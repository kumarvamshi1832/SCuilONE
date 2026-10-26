from uuid import UUID
from sqlalchemy import func
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.buyer_requirement import BuyerRequirement
from app.models.property import Property
from app.models.property_match import PropertyMatch
from app.models.user import User
from app.schemas.property_match import PropertyMatchCreate, PropertyMatchResponse
from app.schemas.property import PropertyResponse
from app.services.audit_service import log_audit

router = APIRouter(prefix="/api/v1/property-matches", tags=["Property Matching"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_tenant_and_user(current_user: dict):
    try:
        return UUID(str(current_user["tenant_id"])), UUID(str(current_user["user_id"]))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid user or tenant context.")


def validate_assigned_user(db: Session, tenant_id: UUID, assigned_to: UUID | None):
    if assigned_to is None:
        return
    user = db.query(User).filter(User.id == assigned_to, User.tenant_id == tenant_id).first()
    if not user or user.status != "Active":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Assigned salesperson must be an active user in this tenant.")


def match_snapshot(record: PropertyMatch) -> dict:
    return {
        "id": str(record.id),
        "tenant_id": str(record.tenant_id),
        "buyer_requirement_id": str(record.buyer_requirement_id),
        "property_id": str(record.property_id),
        "assigned_to": str(record.assigned_to) if record.assigned_to else None,
        "status": record.status,
    }


@router.post("/", response_model=PropertyMatchResponse, status_code=status.HTTP_201_CREATED)
def create_property_match(
    payload: PropertyMatchCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("property_match.create")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    requirement = db.query(BuyerRequirement).filter(
        BuyerRequirement.id == payload.buyer_requirement_id,
        BuyerRequirement.tenant_id == tenant_id,
    ).first()
    if not requirement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Buyer requirement not found in this tenant.")
    if requirement.status == "Closed":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A closed buyer requirement cannot be matched.")

    property_record = db.query(Property).filter(
        Property.id == payload.property_id,
        Property.tenant_id == tenant_id,
    ).first()
    if not property_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found in this tenant.")
    if property_record.status != "Available":
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Only properties with Available status can be matched.")

    expected_listing_type = "Sale" if requirement.requirement_type == "Buy" else "Rent"
    if property_record.listing_type != expected_listing_type:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"This requirement is for {requirement.requirement_type}; the property listing type is {property_record.listing_type}.")

    assigned_to = payload.assigned_to
    if assigned_to is None:
        assigned_to = requirement.assigned_to or property_record.assigned_to
    validate_assigned_user(db, tenant_id, assigned_to)

    existing = db.query(PropertyMatch).filter(
        PropertyMatch.tenant_id == tenant_id,
        PropertyMatch.buyer_requirement_id == requirement.id,
        PropertyMatch.property_id == property_record.id,
    ).first()
    if existing:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This buyer requirement is already matched to this property.")

    record = PropertyMatch(
        tenant_id=tenant_id,
        buyer_requirement_id=requirement.id,
        property_id=property_record.id,
        assigned_to=assigned_to,
        created_by=user_id,
        status="Matched",
    )

    try:
        db.add(record)
        db.flush()
        log_audit(
            db, tenant_id=tenant_id, user_id=user_id, action="CREATE",
            module="property_matches", record_id=record.id,
            description=f"Matched buyer requirement to property {property_record.name}",
            after_data=match_snapshot(record),
        )
        db.commit()
        db.refresh(record)
        return record
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="This buyer requirement is already matched to this property.")
    except Exception:
        db.rollback()
        raise


@router.post(
    "/requirements/{requirement_id}/auto-match",
    response_model=list[PropertyMatchResponse],
    status_code=status.HTTP_200_OK,
)
def auto_match_properties(
    requirement_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("property_match.create")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    requirement = db.query(BuyerRequirement).filter(
        BuyerRequirement.id == requirement_id,
        BuyerRequirement.tenant_id == tenant_id,
    ).first()

    if not requirement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Buyer requirement not found in this tenant.",
        )

    if requirement.status == "Closed":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A closed buyer requirement cannot be matched.",
        )

    expected_listing_type = (
        "Sale" if requirement.requirement_type == "Buy" else "Rent"
    )

    query = db.query(Property).filter(
        Property.tenant_id == tenant_id,
        Property.status == "Available",
        func.lower(func.trim(Property.listing_type))
        == expected_listing_type.lower(),
        func.lower(func.trim(Property.property_type))
        == requirement.property_type.strip().lower(),
    )

    if requirement.preferred_city and requirement.preferred_city.strip():
        query = query.filter(
            func.lower(func.trim(Property.city))
            == requirement.preferred_city.strip().lower()
        )

    # Apply a separate location filter only when it differs from the city.
    location = (requirement.preferred_location or "").strip()
    city = (requirement.preferred_city or "").strip()

    if location and location.casefold() != city.casefold():
        query = query.filter(Property.address.ilike(f"%{location}%"))

    if requirement.min_budget is not None:
        query = query.filter(Property.price >= requirement.min_budget)

    if requirement.max_budget is not None:
        query = query.filter(Property.price <= requirement.max_budget)

    if requirement.bedrooms is not None:
        query = query.filter(Property.bedrooms == requirement.bedrooms)

    if requirement.min_area is not None:
        query = query.filter(Property.area >= requirement.min_area)

    if requirement.max_area is not None:
        query = query.filter(Property.area <= requirement.max_area)

    if requirement.min_area is not None or requirement.max_area is not None:
        query = query.filter(
            func.lower(func.trim(Property.area_unit))
            == requirement.area_unit.strip().lower()
        )

    candidates = query.order_by(Property.price.asc()).all()

    if not candidates:
        return []

    property_ids = [property_record.id for property_record in candidates]

    existing_matches = db.query(PropertyMatch).filter(
        PropertyMatch.tenant_id == tenant_id,
        PropertyMatch.buyer_requirement_id == requirement.id,
        PropertyMatch.property_id.in_(property_ids),
    ).all()

    existing_by_property = {
        record.property_id: record for record in existing_matches
    }

    results = []

    try:
        for property_record in candidates:
            existing = existing_by_property.get(property_record.id)

            if existing:
                if existing.status == "Matched":
                    results.append(existing)
                continue

            assigned_to = (
                requirement.assigned_to or property_record.assigned_to
            )
            validate_assigned_user(db, tenant_id, assigned_to)

            record = PropertyMatch(
                tenant_id=tenant_id,
                buyer_requirement_id=requirement.id,
                property_id=property_record.id,
                assigned_to=assigned_to,
                created_by=user_id,
                status="Matched",
            )

            db.add(record)
            db.flush()

            log_audit(
                db,
                tenant_id=tenant_id,
                user_id=user_id,
                action="CREATE",
                module="property_matches",
                record_id=record.id,
                description=(
                    f"Automatically matched buyer requirement "
                    f"to property {property_record.name}"
                ),
                after_data=match_snapshot(record),
            )

            results.append(record)

        db.commit()

        for record in results:
            db.refresh(record)

        return results

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A concurrent request created a property match. "
                "Please retry the matching request."
            ),
        )
    except Exception:
        db.rollback()
        raise


@router.get("/requirements/{requirement_id}", response_model=list[PropertyMatchResponse])
def list_matches_for_requirement(
    requirement_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("property_match.view")),
):
    tenant_id, _ = get_tenant_and_user(current_user)
    requirement = db.query(BuyerRequirement.id).filter(
        BuyerRequirement.id == requirement_id, BuyerRequirement.tenant_id == tenant_id,
    ).first()
    if not requirement:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Buyer requirement not found in this tenant.")
    return db.query(PropertyMatch).filter(
        PropertyMatch.tenant_id == tenant_id, PropertyMatch.buyer_requirement_id == requirement_id,
    ).order_by(PropertyMatch.created_at.desc()).all()


@router.get("/properties/{property_id}", response_model=list[PropertyMatchResponse])
def list_matches_for_property(
    property_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("property_match.view")),
):
    tenant_id, _ = get_tenant_and_user(current_user)
    property_exists = db.query(Property.id).filter(
        Property.id == property_id, Property.tenant_id == tenant_id,
    ).first()
    if not property_exists:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Property not found in this tenant.")
    return db.query(PropertyMatch).filter(
        PropertyMatch.tenant_id == tenant_id, PropertyMatch.property_id == property_id,
    ).order_by(PropertyMatch.created_at.desc()).all()



@router.get(
    "/potential/{requirement_id}",
    response_model=list[PropertyResponse],
)
def get_potential_matches(
    requirement_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("property_match.view")),
):
    from decimal import Decimal

    tenant_id, _ = get_tenant_and_user(current_user)

    requirement = db.query(BuyerRequirement).filter(
        BuyerRequirement.id == requirement_id,
        BuyerRequirement.tenant_id == tenant_id,
    ).first()

    if not requirement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Buyer requirement not found in this tenant.",
        )

    if requirement.status == "Closed":
        return []

    if (
        requirement.min_budget is None
        and requirement.max_budget is None
    ):
        return []

    expected_listing_type = (
        "Sale" if requirement.requirement_type == "Buy" else "Rent"
    )

    query = db.query(Property).filter(
        Property.tenant_id == tenant_id,
        Property.status == "Available",
        func.lower(func.trim(Property.listing_type))
        == expected_listing_type.lower(),
        func.lower(func.trim(Property.property_type))
        == requirement.property_type.strip().lower(),
    )

    city = (requirement.preferred_city or "").strip()
    location = (requirement.preferred_location or "").strip()

    if city:
        query = query.filter(
            func.lower(func.trim(Property.city)) == city.lower()
        )

    if location and location.casefold() != city.casefold():
        query = query.filter(Property.address.ilike(f"%{location}%"))

    if requirement.bedrooms is not None:
        query = query.filter(
            Property.bedrooms == requirement.bedrooms
        )

    if requirement.min_area is not None:
        query = query.filter(Property.area >= requirement.min_area)

    if requirement.max_area is not None:
        query = query.filter(Property.area <= requirement.max_area)

    if (
        requirement.min_area is not None
        or requirement.max_area is not None
    ):
        query = query.filter(
            func.lower(func.trim(Property.area_unit))
            == requirement.area_unit.strip().lower()
        )

    candidates = query.order_by(Property.price.asc()).all()

    min_budget = requirement.min_budget
    max_budget = requirement.max_budget

    lower_limit = (
        min_budget * Decimal("0.90")
        if min_budget is not None
        else None
    )
    upper_limit = (
        max_budget * Decimal("1.10")
        if max_budget is not None
        else None
    )

    potential_matches = []

    for property_record in candidates:
        price = property_record.price

        within_lower_limit = (
            lower_limit is None or price >= lower_limit
        )
        within_upper_limit = (
            upper_limit is None or price <= upper_limit
        )

        if not within_lower_limit or not within_upper_limit:
            continue

        inside_min_budget = (
            min_budget is None or price >= min_budget
        )
        inside_max_budget = (
            max_budget is None or price <= max_budget
        )

        if inside_min_budget and inside_max_budget:
            continue

        potential_matches.append(property_record)

    return potential_matches
