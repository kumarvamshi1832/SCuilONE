import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import Any
from app.core.industry_modules import require_enabled_module
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError

from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.account import Account
from app.models.contact import Contact
from app.models.deal import Deal
from app.models.lead import Lead
from app.models.software_requirement import SoftwareRequirement
from app.models.software_estimate import SoftwareEstimate
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.software_requirement import (
    SoftwareRequirementCreate,
    SoftwareRequirementResponse,
    SoftwareRequirementUpdate,
)
from app.services.audit_service import log_audit


router = APIRouter(
    prefix="/api/v1/software-requirements",
    tags=["Software Requirements"],
    dependencies=[
        Depends(require_enabled_module("software_requirements")),
    ],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_tenant_and_user(current_user: dict):
    try:
        return (
            uuid.UUID(str(current_user["tenant_id"])),
            uuid.UUID(str(current_user["user_id"])),
        )
    except (KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user or tenant context.",
        )


def require_software_industry(db: Session, tenant_id: uuid.UUID):
    tenant = db.query(Tenant).filter(
        Tenant.id == tenant_id
    ).first()

    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found.",
        )

    industry = (tenant.industry or "").strip().lower()

    allowed_industries = {
        "software",
        "software services",
        "software services / it consulting",
        "software_services",
        "it consulting",
    }

    if industry not in allowed_industries:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This module is available only to Software Services companies.",
        )


def validate_customer_links(
    db: Session,
    tenant_id: uuid.UUID,
    lead_id: uuid.UUID | None,
    account_id: uuid.UUID | None,
    contact_id: uuid.UUID | None,
    deal_id: uuid.UUID | None = None,
):
    if not any((lead_id, account_id, contact_id, deal_id)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Link the requirement to a Deal, Lead, Account, or Contact.",
        )

    lead = None
    account = None
    contact = None
    deal = None

    if deal_id is not None:
        deal = db.query(Deal).filter(
            Deal.id == deal_id,
            Deal.tenant_id == tenant_id,
        ).first()
        if deal is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Deal not found in this company.",
            )

    if lead_id is not None:
        lead = db.query(Lead).filter(
            Lead.id == lead_id,
            Lead.tenant_id == tenant_id,
        ).first()

        if lead is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Lead not found in this company.",
            )

    if account_id is not None:
        account = db.query(Account).filter(
            Account.id == account_id,
            Account.tenant_id == tenant_id,
        ).first()

        if account is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Account not found in this company.",
            )

    if contact_id is not None:
        contact = db.query(Contact).filter(
            Contact.id == contact_id,
            Contact.tenant_id == tenant_id,
        ).first()

        if contact is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Contact not found in this company.",
            )

    if deal is not None:
        for field_name, selected_id in (
            ("lead", lead_id),
            ("account", account_id),
            ("contact", contact_id),
        ):
            deal_value = getattr(deal, f"{field_name}_id", None)
            if (
                selected_id is not None
                and deal_value is not None
                and selected_id != deal_value
            ):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"The selected {field_name} does not match "
                        "the linked deal."
                    ),
                )

    if (
        lead is not None
        and account is not None
        and lead.account_id is not None
        and lead.account_id != account.id
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The selected account does not match the lead's account.",
        )

    if (
        contact is not None
        and account is not None
        and contact.account_id is not None
        and contact.account_id != account.id
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="The selected account does not match the contact's account.",
        )

    return deal


def validate_assigned_user(
    db: Session,
    tenant_id: uuid.UUID,
    assigned_to: uuid.UUID | None,
):
    if assigned_to is None:
        return

    user = db.query(User).filter(
        User.id == assigned_to,
        User.tenant_id == tenant_id,
    ).first()

    if user is None or user.status != "Active":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assignee must be an active user in this company.",
        )


def serialize_value(value: Any):
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (datetime, date)):
        return value.isoformat()
    if isinstance(value, Enum):
        return value.value
    return value


def requirement_snapshot(record: SoftwareRequirement) -> dict:
    fields = (
        "id",
        "tenant_id",
        "created_by",
        "deal_id",
        "lead_id",
        "account_id",
        "contact_id",
        "assigned_to",
        "title",
        "description",
        "software_type",
        "platforms",
        "integrations",
        "min_budget",
        "max_budget",
        "currency",
        "target_date",
        "priority",
        "status",
        "notes",
        "created_at",
        "updated_at",
    )

    return {
        field: serialize_value(getattr(record, field))
        for field in fields
    }


def get_requirement(
    db: Session,
    requirement_id: uuid.UUID,
    tenant_id: uuid.UUID,
):
    record = db.query(SoftwareRequirement).filter(
        SoftwareRequirement.id == requirement_id,
        SoftwareRequirement.tenant_id == tenant_id,
    ).first()

    if record is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Software requirement not found.",
        )

    return record


def validate_budget_range(
    min_budget: Decimal | None,
    max_budget: Decimal | None,
):
    if (
        min_budget is not None
        and max_budget is not None
        and min_budget > max_budget
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Minimum budget cannot exceed maximum budget.",
        )


@router.post(
    "/",
    response_model=SoftwareRequirementResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_software_requirement(
    payload: SoftwareRequirementCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(
        require_permission("software_requirement.create")
    ),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    require_software_industry(db, tenant_id)

    linked_deal = validate_customer_links(
        db,
        tenant_id,
        payload.lead_id,
        payload.account_id,
        payload.contact_id,
        payload.deal_id,
    )

    requirement_data = payload.model_dump()
    if linked_deal is not None:
        requirement_data["lead_id"] = (
            payload.lead_id or linked_deal.lead_id
        )
        requirement_data["account_id"] = (
            payload.account_id or linked_deal.account_id
        )
        requirement_data["contact_id"] = (
            payload.contact_id or linked_deal.contact_id
        )

    validate_assigned_user(
        db,
        tenant_id,
        payload.assigned_to,
    )

    validate_budget_range(
        payload.min_budget,
        payload.max_budget,
    )

    record = SoftwareRequirement(
        **requirement_data,
        tenant_id=tenant_id,
        created_by=user_id,
    )

    try:
        db.add(record)
        db.flush()

        log_audit(
            db,
            tenant_id,
            user_id,
            action="create",
            module="software_requirements",
            record_id=record.id,
            description=f"Created software requirement: {record.title}",
            after_data=requirement_snapshot(record),
        )

        db.commit()
        db.refresh(record)
        return record

    except Exception:
        db.rollback()
        raise


@router.get(
    "/",
    response_model=list[SoftwareRequirementResponse],
)
def list_software_requirements(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(
        require_permission("software_requirement.view")
    ),
    requirement_status: str | None = Query(default=None, alias="status"),
    assigned_to: uuid.UUID | None = None,
    lead_id: uuid.UUID | None = None,
    account_id: uuid.UUID | None = None,
    deal_id: uuid.UUID | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
):
    tenant_id, _ = get_tenant_and_user(current_user)

    require_software_industry(db, tenant_id)

    query = db.query(SoftwareRequirement).filter(
        SoftwareRequirement.tenant_id == tenant_id
    )

    if requirement_status:
        query = query.filter(
            SoftwareRequirement.status == requirement_status
        )

    if assigned_to:
        query = query.filter(
            SoftwareRequirement.assigned_to == assigned_to
        )

    if lead_id:
        query = query.filter(
            SoftwareRequirement.lead_id == lead_id
        )

    if account_id:
        query = query.filter(
            SoftwareRequirement.account_id == account_id
        )

    if deal_id:
        query = query.filter(SoftwareRequirement.deal_id == deal_id)

    return (
        query.order_by(SoftwareRequirement.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get(
    "/{requirement_id}",
    response_model=SoftwareRequirementResponse,
)
def read_software_requirement(
    requirement_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(
        require_permission("software_requirement.view")
    ),
):
    tenant_id, _ = get_tenant_and_user(current_user)

    require_software_industry(db, tenant_id)

    return get_requirement(db, requirement_id, tenant_id)


@router.put(
    "/{requirement_id}",
    response_model=SoftwareRequirementResponse,
)
def update_software_requirement(
    requirement_id: uuid.UUID,
    payload: SoftwareRequirementUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(
        require_permission("software_requirement.update")
    ),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    require_software_industry(db, tenant_id)

    record = get_requirement(db, requirement_id, tenant_id)
    changes = payload.model_dump(exclude_unset=True)

    required_fields = {
        "title",
        "description",
        "software_type",
        "currency",
        "priority",
        "status",
    }

    for field in required_fields.intersection(changes):
        if changes[field] is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"{field} cannot be null.",
            )

    deal_id = changes.get("deal_id", record.deal_id)
    lead_id = changes.get("lead_id", record.lead_id)
    account_id = changes.get("account_id", record.account_id)
    contact_id = changes.get("contact_id", record.contact_id)
    assigned_to = changes.get("assigned_to", record.assigned_to)

    validate_customer_links(
        db,
        tenant_id,
        lead_id,
        account_id,
        contact_id,
        deal_id,
    )

    validate_assigned_user(
        db,
        tenant_id,
        assigned_to,
    )

    min_budget = changes.get("min_budget", record.min_budget)
    max_budget = changes.get("max_budget", record.max_budget)

    validate_budget_range(min_budget, max_budget)

    before_data = {}
    after_data = {}

    for field, new_value in changes.items():
        old_value = getattr(record, field)

        old_serialized = serialize_value(old_value)
        new_serialized = serialize_value(new_value)

        if old_serialized != new_serialized:
            before_data[field] = old_serialized
            after_data[field] = new_serialized

    if not after_data:
        return record

    try:
        for field in after_data:
            setattr(record, field, changes[field])

        db.flush()

        log_audit(
            db,
            tenant_id,
            user_id,
            action="update",
            module="software_requirements",
            record_id=record.id,
            description=f"Updated software requirement: {record.title}",
            before_data=before_data,
            after_data=after_data,
        )

        db.commit()
        db.refresh(record)
        return record

    except Exception:
        db.rollback()
        raise


@router.delete(
    "/{requirement_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_software_requirement(
    requirement_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(
        require_permission("software_requirement.delete")
    ),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    require_software_industry(db, tenant_id)

    record = get_requirement(db, requirement_id, tenant_id)

    estimate_count = db.query(SoftwareEstimate).filter(
        SoftwareEstimate.tenant_id == tenant_id,
        SoftwareEstimate.software_requirement_id == record.id,
    ).count()

    if estimate_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This requirement has {estimate_count} estimate(s) and "
                "cannot be deleted. Delete its Draft estimates, or set the "
                "requirement status to Closed instead."
            ),
        )

    try:
        log_audit(
            db,
            tenant_id,
            user_id,
            action="delete",
            module="software_requirements",
            record_id=record.id,
            description=f"Deleted software requirement: {record.title}",
            before_data=requirement_snapshot(record),
        )

        db.delete(record)
        db.commit()

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This record is still referenced by other records "
                "and cannot be deleted."
            ),
        )
    except Exception:
        db.rollback()
        raise