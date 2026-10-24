from uuid import UUID
from decimal import Decimal

import cloudinary.uploader
import app.core.cloudinary_config

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.models.property import Property
from app.models.property_image import PropertyImage
from app.models.user import User
from app.schemas.property import PropertyCreate, PropertyUpdate, PropertyResponse
from app.services.audit_service import log_audit


router = APIRouter(prefix="/api/v1/properties", tags=["Properties"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_tenant_and_user(current_user: dict):
    try:
        tenant_id = UUID(str(current_user["tenant_id"]))
        user_id = UUID(str(current_user["user_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user or tenant context.",
        )
    return tenant_id, user_id


def validate_assigned_user(
    db: Session,
    assigned_to: UUID | None,
    tenant_id: UUID,
):
    if assigned_to is None:
        return

    user = db.query(User).filter(
        User.id == assigned_to,
        User.tenant_id == tenant_id,
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigned salesperson does not belong to this tenant.",
        )

    if user.status != "Active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot assign a property to an inactive user.",
        )


def property_snapshot(property_record: Property) -> dict:
    return {
        "name": property_record.name,
        "property_type": property_record.property_type,
        "listing_type": property_record.listing_type,
        "address": property_record.address,
        "city": property_record.city,
        "state": property_record.state,
        "price": str(property_record.price),
        "status": property_record.status,
        "assigned_to": (
            str(property_record.assigned_to)
            if property_record.assigned_to else None
        ),
    }


@router.post(
    "/",
    response_model=PropertyResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("property.create"))],
)
def create_property(
    data: PropertyCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
):
    tenant_id, user_id = get_tenant_and_user(current_user)
    validate_assigned_user(db, data.assigned_to, tenant_id)

    property_record = Property(
        **data.model_dump(),
        tenant_id=tenant_id,
        created_by=user_id,
    )

    try:
        db.add(property_record)
        db.flush()

        log_audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="CREATE",
            module="properties",
            record_id=str(property_record.id),
            description=f"Created property: {property_record.name}",
            after_data=property_snapshot(property_record),
        )

        db.commit()
        db.refresh(property_record)
        return property_record
    except Exception:
        db.rollback()
        raise


@router.get(
    "/",
    response_model=list[PropertyResponse],
    dependencies=[Depends(require_permission("property.view"))],
)
def list_properties(
    city: str | None = Query(default=None, max_length=100),
    property_type: str | None = Query(default=None, max_length=50),
    listing_type: str | None = Query(default=None, max_length=30),
    property_status: str | None = Query(default=None, alias="status", max_length=30),
    assigned_to: UUID | None = None,
    search: str | None = Query(default=None, max_length=200),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
):
    tenant_id, _ = get_tenant_and_user(current_user)

    query = db.query(Property).filter(
        Property.tenant_id == tenant_id
    )

    if city:
        query = query.filter(
            Property.city.ilike(f"%{city.strip()}%")
        )

    if property_type:
        query = query.filter(
            Property.property_type == property_type
        )

    if listing_type:
        query = query.filter(
            Property.listing_type == listing_type
        )

    if property_status:
        query = query.filter(
            Property.status == property_status
        )

    if assigned_to:
        query = query.filter(
            Property.assigned_to == assigned_to
        )

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            Property.name.ilike(term)
            | Property.address.ilike(term)
            | Property.city.ilike(term)
        )

    return (
        query.order_by(Property.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get(
    "/{property_id}",
    response_model=PropertyResponse,
    dependencies=[Depends(require_permission("property.view"))],
)
def get_property(
    property_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
):
    tenant_id, _ = get_tenant_and_user(current_user)

    property_record = db.query(Property).filter(
        Property.id == property_id,
        Property.tenant_id == tenant_id,
    ).first()

    if not property_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Property not found.",
        )

    return property_record


@router.patch(
    "/{property_id}",
    response_model=PropertyResponse,
    dependencies=[Depends(require_permission("property.update"))],
)
def update_property(
    property_id: UUID,
    data: PropertyUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    property_record = db.query(Property).filter(
        Property.id == property_id,
        Property.tenant_id == tenant_id,
    ).first()

    if not property_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Property not found.",
        )

    changes = data.model_dump(exclude_unset=True)

    if "assigned_to" in changes:
        validate_assigned_user(
            db,
            changes["assigned_to"],
            tenant_id,
        )

    before_data = property_snapshot(property_record)

    for field, value in changes.items():
        setattr(property_record, field, value)

    try:
        db.flush()

        log_audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="UPDATE",
            module="properties",
            record_id=str(property_record.id),
            description=f"Updated property: {property_record.name}",
            before_data=before_data,
            after_data=property_snapshot(property_record),
        )

        db.commit()
        db.refresh(property_record)
        return property_record

    except Exception:
        db.rollback()
        raise


@router.delete(
    "/{property_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("property.delete"))],
)
def delete_property(
    property_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    property_record = db.query(Property).filter(
        Property.id == property_id,
        Property.tenant_id == tenant_id,
    ).first()

    if not property_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Property not found.",
        )

    before_data = property_snapshot(property_record)

    images = db.query(PropertyImage).filter(
        PropertyImage.tenant_id == tenant_id,
        PropertyImage.property_id == property_id,
    ).all()

    try:
        for image in images:
            result = cloudinary.uploader.destroy(
                image.public_id,
                resource_type="image",
                invalidate=True,
            )

            if result.get("result") not in {"ok", "not found"}:
                raise HTTPException(
                    status_code=status.HTTP_502_BAD_GATEWAY,
                    detail=(
                        "Cloudinary could not confirm deletion "
                        "of a property image."
                    ),
                )

        for image in images:
            db.delete(image)

        log_audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="DELETE",
            module="properties",
            record_id=str(property_record.id),
            description=f"Deleted property: {property_record.name}",
            before_data=before_data,
        )

        db.delete(property_record)
        db.commit()

    except HTTPException:
        db.rollback()
        raise

    except Exception:
        db.rollback()
        raise
