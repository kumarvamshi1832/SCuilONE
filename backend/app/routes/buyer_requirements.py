
import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.buyer_requirement import BuyerRequirement
from app.schemas.buyer_requirement import (
    BuyerRequirementCreate,
    BuyerRequirementResponse,
    BuyerRequirementUpdate,
)
from app.services.audit_service import log_audit

router = APIRouter(
    prefix="/api/v1/buyer-requirements",
    tags=["Buyer Requirements"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def serialize_value(value: Any):
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, Decimal):
        return float(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Enum):
        return value.value
    return value


def requirement_snapshot(requirement: BuyerRequirement) -> dict:
    fields = (
        "id",
        "tenant_id",
        "created_by",
        "lead_id",
        "contact_id",
        "assigned_to",
        "requirement_type",
        "property_type",
        "preferred_city",
        "preferred_location",
        "min_budget",
        "max_budget",
        "bedrooms",
        "min_area",
        "max_area",
        "area_unit",
        "status",
        "notes",
        "created_at",
        "updated_at",
    )

    return {
        field: serialize_value(getattr(requirement, field))
        for field in fields
    }


def get_requirement(
    db: Session,
    requirement_id: uuid.UUID,
    tenant_id: uuid.UUID,
):
    requirement = (
        db.query(BuyerRequirement)
        .filter(
            BuyerRequirement.id == requirement_id,
            BuyerRequirement.tenant_id == tenant_id,
        )
        .first()
    )

    if not requirement:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Buyer requirement not found",
        )

    return requirement


def validate_customer_links(
    db: Session,
    tenant_id: uuid.UUID,
    lead_id: uuid.UUID | None,
    contact_id: uuid.UUID | None,
):
    from app.models.contact import Contact
    from app.models.lead import Lead

    if lead_id is None and contact_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Link the requirement to an existing Lead or Contact.",
        )

    if lead_id is not None:
        lead = (
            db.query(Lead)
            .filter(
                Lead.id == lead_id,
                Lead.tenant_id == tenant_id,
            )
            .first()
        )

        if not lead:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Lead not found in this tenant.",
            )

    if contact_id is not None:
        contact = (
            db.query(Contact)
            .filter(
                Contact.id == contact_id,
                Contact.tenant_id == tenant_id,
            )
            .first()
        )

        if not contact:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Contact not found in this tenant.",
            )


def validate_assigned_user(
    db: Session,
    tenant_id: uuid.UUID,
    assigned_to: uuid.UUID | None,
):
    if assigned_to is None:
        return

    from app.models.user import User

    user = (
        db.query(User)
        .filter(
            User.id == assigned_to,
            User.tenant_id == tenant_id,
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigned user not found in this tenant.",
        )


@router.post(
    "/",
    response_model=BuyerRequirementResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_buyer_requirement(
    payload: BuyerRequirementCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _permission=Depends(require_permission("buyer_requirement.create")),
):
    tenant_id = uuid.UUID(str(current_user["tenant_id"]))
    user_id = uuid.UUID(str(current_user["user_id"]))

    validate_customer_links(
        db,
        tenant_id,
        payload.lead_id,
        payload.contact_id,
    )

    validate_assigned_user(
        db,
        tenant_id,
        payload.assigned_to,
    )

    requirement = BuyerRequirement(
        **payload.model_dump(),
        tenant_id=tenant_id,
        created_by=user_id,
    )

    try:
        db.add(requirement)
        db.flush()

        log_audit(
            db,
            tenant_id,
            user_id,
            action="create",
            module="buyer_requirements",
            record_id=requirement.id,
            description="Created buyer requirement",
            after_data=requirement_snapshot(requirement),
        )

        db.commit()
        db.refresh(requirement)

        return requirement

    except Exception:
        db.rollback()
        raise


@router.get(
    "/",
    response_model=list[BuyerRequirementResponse],
)
def list_buyer_requirements(
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _permission=Depends(require_permission("buyer_requirement.view")),
):
    tenant_id = uuid.UUID(str(current_user["tenant_id"]))

    return (
        db.query(BuyerRequirement)
        .filter(BuyerRequirement.tenant_id == tenant_id)
        .order_by(BuyerRequirement.created_at.desc())
        .all()
    )


@router.get(
    "/{requirement_id}",
    response_model=BuyerRequirementResponse,
)
def read_buyer_requirement(
    requirement_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _permission=Depends(require_permission("buyer_requirement.view")),
):
    tenant_id = uuid.UUID(str(current_user["tenant_id"]))

    return get_requirement(db, requirement_id, tenant_id)


@router.put(
    "/{requirement_id}",
    response_model=BuyerRequirementResponse,
)
def update_buyer_requirement(
    requirement_id: uuid.UUID,
    payload: BuyerRequirementUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _permission=Depends(require_permission("buyer_requirement.update")),
):
    tenant_id = uuid.UUID(str(current_user["tenant_id"]))
    user_id = uuid.UUID(str(current_user["user_id"]))

    requirement = get_requirement(db, requirement_id, tenant_id)
    changes = payload.model_dump(exclude_unset=True)

    lead_id = changes.get("lead_id", requirement.lead_id)
    contact_id = changes.get("contact_id", requirement.contact_id)
    assigned_to = changes.get("assigned_to", requirement.assigned_to)

    validate_customer_links(
        db,
        tenant_id,
        lead_id,
        contact_id,
    )

    validate_assigned_user(
        db,
        tenant_id,
        assigned_to,
    )

    before_data = {}
    after_data = {}

    for field, new_value in changes.items():
        old_value = getattr(requirement, field)

        old_serialized = serialize_value(old_value)
        new_serialized = serialize_value(new_value)

        if old_serialized != new_serialized:
            before_data[field] = old_serialized
            after_data[field] = new_serialized

    if not after_data:
        return requirement

    try:
        for field in after_data:
            setattr(requirement, field, changes[field])

        db.flush()

        log_audit(
            db,
            tenant_id,
            user_id,
            action="update",
            module="buyer_requirements",
            record_id=requirement.id,
            description="Updated buyer requirement",
            before_data=before_data,
            after_data=after_data,
        )

        db.commit()
        db.refresh(requirement)

        return requirement

    except Exception:
        db.rollback()
        raise


@router.delete(
    "/{requirement_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_buyer_requirement(
    requirement_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _permission=Depends(require_permission("buyer_requirement.delete")),
):
    tenant_id = uuid.UUID(str(current_user["tenant_id"]))
    user_id = uuid.UUID(str(current_user["user_id"]))

    requirement = get_requirement(db, requirement_id, tenant_id)
    before_data = requirement_snapshot(requirement)

    try:
        log_audit(
            db,
            tenant_id,
            user_id,
            action="delete",
            module="buyer_requirements",
            record_id=requirement.id,
            description="Deleted buyer requirement",
            before_data=before_data,
        )

        db.delete(requirement)
        db.commit()

    except Exception:
        db.rollback()
        raise
