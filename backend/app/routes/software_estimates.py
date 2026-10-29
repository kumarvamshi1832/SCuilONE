import uuid
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, selectinload
from sqlalchemy.exc import IntegrityError
from app.core.industry_modules import require_enabled_module
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.software_estimate import SoftwareEstimate
from app.models.software_estimate_item import SoftwareEstimateItem
from app.models.software_contract import SoftwareContract
from app.models.software_requirement import SoftwareRequirement
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.software_estimate import (
    SoftwareEstimateCreate,
    SoftwareEstimateResponse,
    SoftwareEstimateUpdate,
)
from app.services.audit_service import log_audit


router = APIRouter(
    prefix="/api/v1/software-estimates",
    tags=["Software Estimates"],
    dependencies=[
        Depends(require_enabled_module("software_estimates")),
    ],
)

CENT = Decimal("0.01")
ZERO = Decimal("0.00")

SOFTWARE_INDUSTRIES = {
    "software",
    "software services",
    "software services / it consulting",
    "software_services",
    "it consulting",
}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def get_tenant_and_user(current_user: dict):
    try:
        tenant_id = uuid.UUID(str(current_user["tenant_id"]))
        user_id = uuid.UUID(str(current_user["user_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=401,
            detail="Invalid authenticated user context",
        )

    return tenant_id, user_id


def require_software_industry(db: Session, tenant_id: uuid.UUID):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()

    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    industry = (tenant.industry or "").strip().lower()

    if industry not in SOFTWARE_INDUSTRIES:
        raise HTTPException(
            status_code=403,
            detail="Software Estimates are available only to Software Services tenants",
        )


def get_requirement(
    db: Session,
    tenant_id: uuid.UUID,
    requirement_id: uuid.UUID,
):
    requirement = db.query(SoftwareRequirement).filter(
        SoftwareRequirement.id == requirement_id,
        SoftwareRequirement.tenant_id == tenant_id,
    ).first()

    if not requirement:
        raise HTTPException(
            status_code=404,
            detail="Software requirement not found",
        )

    return requirement


def get_estimate(
    db: Session,
    tenant_id: uuid.UUID,
    estimate_id: uuid.UUID,
):
    estimate = db.query(SoftwareEstimate).options(
        selectinload(SoftwareEstimate.items)
    ).filter(
        SoftwareEstimate.id == estimate_id,
        SoftwareEstimate.tenant_id == tenant_id,
    ).first()

    if not estimate:
        raise HTTPException(
            status_code=404,
            detail="Software estimate not found",
        )

    return estimate


def validate_assignee(
    db: Session,
    tenant_id: uuid.UUID,
    assigned_to: uuid.UUID | None,
):
    if assigned_to is None:
        return

    user = db.query(User).filter(
        User.id == assigned_to,
        User.tenant_id == tenant_id,
        User.status == "Active",
    ).first()

    if not user:
        raise HTTPException(
            status_code=400,
            detail="Assigned user must be an active user in this tenant",
        )


def get_item_value(item, field, default=0):
    if isinstance(item, dict):
        return item.get(field, default)
    return getattr(item, field, default)


def calculate_items(items):
    calculated = []
    subtotal = ZERO
    item_discount_total = ZERO
    tax_total = ZERO

    for item in items:
        quantity = Decimal(str(get_item_value(item, "quantity")))
        unit_price = Decimal(str(get_item_value(item, "unit_price")))
        discount_percent = Decimal(
            str(get_item_value(item, "discount_percent"))
        )
        tax_percent = Decimal(
            str(get_item_value(item, "tax_percent"))
        )

        item_name = get_item_value(item, "item_name", "")
        description = get_item_value(item, "description", "")
        sort_order = get_item_value(item, "sort_order", 0)

        line_subtotal = money(quantity * unit_price)
        line_discount = money(
            line_subtotal * discount_percent / Decimal("100")
        )

        taxable_amount = line_subtotal - line_discount
        line_tax = money(
            taxable_amount * tax_percent / Decimal("100")
        )
        line_total = taxable_amount + line_tax

        calculated.append({
            "item_name": item_name,
            "description": description,
            "quantity": quantity,
            "unit_price": unit_price,
            "discount_percent": discount_percent,
            "tax_percent": tax_percent,
            "line_subtotal": line_subtotal,
            "line_discount": line_discount,
            "line_tax": line_tax,
            "line_total": money(line_total),
            "sort_order": sort_order,
        })

        subtotal += line_subtotal
        item_discount_total += line_discount
        tax_total += line_tax

    return {
        "items": calculated,
        "subtotal": money(subtotal),
        "item_discount_total": money(item_discount_total),
        "tax_amount": money(tax_total),
    }


def calculate_totals(calculation, discount_amount: Decimal):
    discount_amount = money(Decimal(str(discount_amount)))

    available_before_tax = (
        calculation["subtotal"] - calculation["item_discount_total"]
    )

    if discount_amount > available_before_tax:
        raise HTTPException(
            status_code=422,
            detail="Estimate discount cannot exceed the amount after item discounts",
        )

    total = (
        calculation["subtotal"]
        - calculation["item_discount_total"]
        - discount_amount
        + calculation["tax_amount"]
    )

    return {
        "subtotal": calculation["subtotal"],
        "discount_amount": discount_amount,
        "tax_amount": calculation["tax_amount"],
        "total_amount": money(total),
    }


def add_items(
    db: Session,
    tenant_id: uuid.UUID,
    estimate_id: uuid.UUID,
    calculated_items: list[dict],
):
    for item_data in calculated_items:
        db.add(
            SoftwareEstimateItem(
                tenant_id=tenant_id,
                estimate_id=estimate_id,
                **item_data,
            )
        )


ESTIMATE_STATUS_TRANSITIONS = {
    "Draft": {"Sent", "Withdrawn"},
    "Sent": {"Accepted", "Rejected", "Expired", "Withdrawn"},
    "Accepted": set(),
    "Rejected": set(),
    "Expired": set(),
    "Withdrawn": set(),
}

# Once an estimate leaves Draft, its commercial content is locked.
FIELDS_EDITABLE_AFTER_DRAFT = {"status", "notes", "assigned_to"}


def ensure_estimate_update_allowed(
    estimate: SoftwareEstimate,
    changes: dict,
):
    requested_status = changes.get("status")

    if (
        requested_status is not None
        and requested_status != estimate.status
    ):
        allowed = ESTIMATE_STATUS_TRANSITIONS.get(estimate.status, set())

        if requested_status not in allowed:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Cannot change estimate status from "
                    f"'{estimate.status}' to '{requested_status}'"
                ),
            )

        
        if requested_status in {"Sent", "Accepted"}:
            effective_expiry = changes.get(
                "expiry_date",
                estimate.expiry_date,
            )

            if effective_expiry is None:
                raise HTTPException(
                    status_code=422,
                    detail="An expiry date is required before sending or accepting an estimate",
                )

            if effective_expiry < date.today():
                raise HTTPException(
                    status_code=409,
                    detail=(
                        f"The estimate expired on {effective_expiry}, "
                        f"so it cannot be marked {requested_status}"
                    ),
                )

    if estimate.status != "Draft":
        locked_fields = sorted(set(changes) - FIELDS_EDITABLE_AFTER_DRAFT)

        if locked_fields:
            raise HTTPException(
                status_code=409,
                detail=(
                    f"A {estimate.status} estimate cannot be edited. "
                    f"Only status, notes and assignee can change "
                    f"(locked: {', '.join(locked_fields)})"
                ),
            )


def estimate_snapshot(estimate: SoftwareEstimate):
    return {
        "estimate_number": estimate.estimate_number,
        "title": estimate.title,
        "status": estimate.status,
        "currency": estimate.currency,
        "subtotal": str(estimate.subtotal),
        "discount_amount": str(estimate.discount_amount),
        "tax_amount": str(estimate.tax_amount),
        "total_amount": str(estimate.total_amount),
        "software_requirement_id": str(
            estimate.software_requirement_id
        ),
        "deal_id": str(estimate.deal_id) if estimate.deal_id else None,
    }


def generate_estimate_number():
    return (
        f"EST-{date.today():%Y%m%d}-"
        f"{uuid.uuid4().hex[:8].upper()}"
    )


@router.post(
    "/",
    response_model=SoftwareEstimateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_estimate(
    payload: SoftwareEstimateCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("software_estimate.create")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    require_software_industry(db, tenant_id)

    requirement = get_requirement(
        db,
        tenant_id,
        payload.software_requirement_id,
    )

    validate_assignee(db, tenant_id, payload.assigned_to)

    if payload.status != "Draft":
        raise HTTPException(
            status_code=422,
            detail="A new estimate must start as Draft",
        )

    calculation = calculate_items(payload.items)
    totals = calculate_totals(
        calculation,
        payload.discount_amount,
    )

    estimate_number = (
        payload.estimate_number or generate_estimate_number()
    ).strip()

    if db.query(SoftwareEstimate).filter(
        SoftwareEstimate.tenant_id == tenant_id,
        SoftwareEstimate.estimate_number == estimate_number,
    ).first():
        raise HTTPException(
            status_code=409,
            detail="Estimate number already exists in this tenant",
        )

    estimate = SoftwareEstimate(
        tenant_id=tenant_id,
        created_by=user_id,
        software_requirement_id=requirement.id,
        deal_id=requirement.deal_id,
        lead_id=requirement.lead_id,
        account_id=requirement.account_id,
        contact_id=requirement.contact_id,
        assigned_to=payload.assigned_to,
        estimate_number=estimate_number,
        title=payload.title,
        description=payload.description,
        currency=payload.currency,
        issue_date=payload.issue_date,
        expiry_date=payload.expiry_date,
        status=payload.status,
        terms_and_conditions=payload.terms_and_conditions,
        notes=payload.notes,
        **totals,
    )

    try:
        db.add(estimate)
        db.flush()

        add_items(
            db,
            tenant_id,
            estimate.id,
            calculation["items"],
        )

        log_audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="create",
            module="software_estimate",
            record_id=estimate.id,
            description=f"Created estimate {estimate_number}",
            after_data={
                "estimate_number": estimate_number,
                "title": payload.title,
                "total_amount": str(totals["total_amount"]),
            },
        )

        db.commit()
    except Exception:
        db.rollback()
        raise

    return get_estimate(db, tenant_id, estimate.id)


@router.get(
    "/",
    response_model=list[SoftwareEstimateResponse],
)
def list_estimates(
    estimate_status: str | None = Query(default=None, alias="status"),
    assigned_to: uuid.UUID | None = None,
    software_requirement_id: uuid.UUID | None = None,
    account_id: uuid.UUID | None = None,
    deal_id: uuid.UUID | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("software_estimate.view")),
):
    tenant_id, _ = get_tenant_and_user(current_user)
    require_software_industry(db, tenant_id)

    query = db.query(SoftwareEstimate).options(
        selectinload(SoftwareEstimate.items)
    ).filter(
        SoftwareEstimate.tenant_id == tenant_id
    )

    if estimate_status:
        query = query.filter(SoftwareEstimate.status == estimate_status)

    if assigned_to:
        query = query.filter(SoftwareEstimate.assigned_to == assigned_to)

    if software_requirement_id:
        query = query.filter(
            SoftwareEstimate.software_requirement_id
            == software_requirement_id
        )

    if account_id:
        query = query.filter(SoftwareEstimate.account_id == account_id)

    if deal_id:
        query = query.filter(SoftwareEstimate.deal_id == deal_id)

    return query.order_by(
        SoftwareEstimate.created_at.desc()
    ).offset(offset).limit(limit).all()


@router.get(
    "/{estimate_id}",
    response_model=SoftwareEstimateResponse,
)
def read_estimate(
    estimate_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("software_estimate.view")),
):
    tenant_id, _ = get_tenant_and_user(current_user)
    require_software_industry(db, tenant_id)

    return get_estimate(db, tenant_id, estimate_id)


@router.put(
    "/{estimate_id}",
    response_model=SoftwareEstimateResponse,
)
def update_estimate(
    estimate_id: uuid.UUID,
    payload: SoftwareEstimateUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("software_estimate.update")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)
    require_software_industry(db, tenant_id)

    estimate = get_estimate(db, tenant_id, estimate_id)
    before_data = estimate_snapshot(estimate)

    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        return estimate

    ensure_estimate_update_allowed(estimate, changes)

    if "title" in changes and changes["title"] is None:
        raise HTTPException(status_code=422, detail="Title cannot be null")

    if "currency" in changes and changes["currency"] is None:
        raise HTTPException(status_code=422, detail="Currency cannot be null")

    if "status" in changes and changes["status"] is None:
        raise HTTPException(status_code=422, detail="Status cannot be null")

    if "issue_date" in changes and changes["issue_date"] is None:
        raise HTTPException(status_code=422, detail="Issue date cannot be null")

    effective_issue_date = changes.get("issue_date", estimate.issue_date)
    effective_expiry_date = changes.get("expiry_date", estimate.expiry_date)

    if (
        effective_expiry_date is not None
        and effective_expiry_date < effective_issue_date
    ):
        raise HTTPException(
            status_code=422,
            detail="Expiry date cannot be before issue date",
        )

    if "assigned_to" in changes:
        validate_assignee(db, tenant_id, changes["assigned_to"])

    effective_discount = changes.get(
        "discount_amount",
        estimate.discount_amount,
    )

    if effective_discount is None:
        raise HTTPException(
            status_code=422,
            detail="Discount amount cannot be null",
        )

    current_items = [
        {
            "item_name": item.item_name,
            "description": item.description,
            "quantity": item.quantity,
            "unit_price": item.unit_price,
            "discount_percent": item.discount_percent,
            "tax_percent": item.tax_percent,
            "sort_order": item.sort_order,
        }
        for item in estimate.items
    ]

    if "items" in changes:
        item_source = changes["items"]
        if not item_source:
            raise HTTPException(
                status_code=422,
                detail="An estimate must contain at least one item",
            )
    else:
        item_source = current_items

    calculation = calculate_items(item_source)
    totals = calculate_totals(calculation, effective_discount)

    try:
        for field in (
            "title",
            "description",
            "assigned_to",
            "currency",
            "issue_date",
            "expiry_date",
            "status",
            "discount_amount",
            "terms_and_conditions",
            "notes",
        ):
            if field in changes:
                setattr(estimate, field, changes[field])

        for field, value in totals.items():
            setattr(estimate, field, value)

        if "items" in changes:
            estimate.items.clear()
            db.flush()
            add_items(
                db,
                tenant_id,
                estimate.id,
                calculation["items"],
            )

        estimate.updated_at = datetime.utcnow()

        log_audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="update",
            module="software_estimate",
            record_id=estimate.id,
            description=f"Updated estimate {estimate.estimate_number}",
            before_data=before_data,
            after_data=estimate_snapshot(estimate),
        )

        db.commit()
    except Exception:
        db.rollback()
        raise

    return get_estimate(db, tenant_id, estimate.id)


@router.delete(
    "/{estimate_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_estimate(
    estimate_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("software_estimate.delete")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)
    require_software_industry(db, tenant_id)

    estimate = get_estimate(db, tenant_id, estimate_id)

    contract = db.query(SoftwareContract).filter(
        SoftwareContract.tenant_id == tenant_id,
        SoftwareContract.software_estimate_id == estimate.id,
    ).first()

    if contract:
        raise HTTPException(
            status_code=409,
            detail=(
                f"This estimate has contract {contract.contract_number} "
                "and cannot be deleted."
            ),
        )

    if estimate.status != "Draft":
        raise HTTPException(
            status_code=409,
            detail=(
                "Only Draft estimates can be deleted. "
                "Set the status to Withdrawn instead."
            ),
        )

    before_data = estimate_snapshot(estimate)

    try:
        log_audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="delete",
            module="software_estimate",
            record_id=estimate.id,
            description=f"Deleted estimate {estimate.estimate_number}",
            before_data=before_data,
        )

        db.delete(estimate)
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

    return None