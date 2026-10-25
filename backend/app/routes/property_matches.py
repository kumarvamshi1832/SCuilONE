from uuid import UUID

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
