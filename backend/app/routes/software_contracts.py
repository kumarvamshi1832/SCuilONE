import uuid
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from app.models.software_project import SoftwareProject
from sqlalchemy.orm import Session, selectinload
from app.core.industry_modules import require_enabled_module
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.models.software_contract import SoftwareContract
from app.models.software_contract_milestone import SoftwareContractMilestone
from app.models.software_invoice import SoftwareInvoice, SoftwareInvoiceItem
from app.models.software_estimate import SoftwareEstimate
from app.models.software_estimate_item import SoftwareEstimateItem
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.software_contract import (
    SoftwareContractCreate,
    SoftwareContractResponse,
    SoftwareContractUpdate,
    SoftwareContractMilestoneReadyRequest,
    SoftwareContractMilestoneInvoiceRequest,
    SoftwareContractMilestoneResponse,
)
from app.services.audit_service import log_audit


router = APIRouter(
    prefix="/api/v1/software-contracts",
    tags=["Software Contracts"],
    dependencies=[
        Depends(require_enabled_module("software_contracts")),
    ],
)

CONTRACT_STATUS_TRANSITIONS = {
    "Draft": {"Sent", "Terminated"},
    "Sent": {"Under Review", "Signed", "Draft", "Terminated"},
    "Under Review": {"Signed", "Draft", "Terminated"},
    "Signed": {"Active", "Terminated"},
    "Active": {"Completed", "Terminated", "Expired"},
    "Completed": set(),
    "Terminated": set(),
    "Expired": set(),
}


def get_db():
    from app.database.connection import SessionLocal

    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_tenant_and_user(current_user: dict):
    try:
        tenant_id = uuid.UUID(str(current_user["tenant_id"]))
        user_id = uuid.UUID(str(current_user["user_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user or tenant information",
        )

    return tenant_id, user_id


def require_software_industry(db: Session, tenant_id: uuid.UUID):
    tenant = (
        db.query(Tenant)
        .filter(Tenant.id == tenant_id)
        .first()
    )

    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found")

    industry = (getattr(tenant, "industry", None) or "").strip().lower()

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
            detail="Software Contracts are available only to software tenants",
        )


def validate_assignee(
    db: Session,
    tenant_id: uuid.UUID,
    assigned_to: uuid.UUID | None,
):
    if assigned_to is None:
        return

    user = (
        db.query(User)
        .filter(
            User.id == assigned_to,
            User.tenant_id == tenant_id,
            User.status == "Active",
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigned user must be active and belong to this tenant",
        )


def contract_snapshot(contract: SoftwareContract):
    return {
        "id": str(contract.id),
        "contract_number": contract.contract_number,
        "software_estimate_id": str(contract.software_estimate_id),
        "deal_id": str(contract.deal_id) if contract.deal_id else None,
        "title": contract.title,
        "contract_value": str(contract.contract_value),
        "currency": contract.currency,
        "status": contract.status,
        "start_date": (
            contract.start_date.isoformat()
            if contract.start_date
            else None
        ),
        "end_date": (
            contract.end_date.isoformat()
            if contract.end_date
            else None
        ),
    }


def generate_contract_number():
    return f"CON-{date.today():%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"


def build_estimate_snapshot(estimate: SoftwareEstimate):
    return {
        "estimate_id": str(estimate.id),
        "estimate_number": estimate.estimate_number,
        "title": estimate.title,
        "description": estimate.description,
        "currency": estimate.currency,
        "issue_date": (
            estimate.issue_date.isoformat()
            if estimate.issue_date
            else None
        ),
        "subtotal": str(estimate.subtotal),
        "discount_amount": str(estimate.discount_amount),
        "tax_amount": str(estimate.tax_amount),
        "total_amount": str(estimate.total_amount),
        "terms_and_conditions": estimate.terms_and_conditions,
        "items": [
            {
                "item_name": item.item_name,
                "description": item.description,
                "quantity": str(item.quantity),
                "unit_price": str(item.unit_price),
                "discount_percent": str(item.discount_percent),
                "tax_percent": str(item.tax_percent),
                "line_subtotal": str(item.line_subtotal),
                "line_discount": str(item.line_discount),
                "line_tax": str(item.line_tax),
                "line_total": str(item.line_total),
                "sort_order": item.sort_order,
            }
            for item in estimate.items
        ],
    }


def get_contract_or_404(
    db: Session,
    tenant_id: uuid.UUID,
    contract_id: uuid.UUID,
):
    contract = (
        db.query(SoftwareContract)
        .filter(
            SoftwareContract.id == contract_id,
            SoftwareContract.tenant_id == tenant_id,
        )
        .first()
    )

    if not contract:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Software contract not found",
        )

    return contract


@router.post(
    "",
    response_model=SoftwareContractResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("software_contract.create"))],
)
def create_software_contract(
    payload: SoftwareContractCreate,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, user_id = get_tenant_and_user(current_user)
    require_software_industry(db, tenant_id)

    estimate = (
        db.query(SoftwareEstimate)
        .options(selectinload(SoftwareEstimate.items))
        .filter(
            SoftwareEstimate.id == payload.software_estimate_id,
            SoftwareEstimate.tenant_id == tenant_id,
        )
        .with_for_update()
        .first()
    )

    if not estimate:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Software estimate not found",
        )

    if estimate.status != "Accepted":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A contract can only be created from an Accepted estimate",
        )

    existing_contract = (
        db.query(SoftwareContract)
        .filter(
            SoftwareContract.tenant_id == tenant_id,
            SoftwareContract.software_estimate_id == estimate.id,
        )
        .first()
    )

    if existing_contract:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A contract already exists for this estimate",
        )

    validate_assignee(db, tenant_id, payload.assigned_to)

    contract = SoftwareContract(
        tenant_id=tenant_id,
        created_by=user_id,
        software_estimate_id=estimate.id,
        deal_id=estimate.deal_id,
        lead_id=estimate.lead_id,
        account_id=estimate.account_id,
        contact_id=estimate.contact_id,
        assigned_to=payload.assigned_to or estimate.assigned_to,
        contract_number=(
            payload.contract_number or generate_contract_number()
        ),
        title=payload.title or estimate.title,
        description=(
            payload.description
            if payload.description is not None
            else estimate.description
        ),
        currency=estimate.currency,
        contract_value=Decimal(str(estimate.total_amount)),
        issue_date=payload.issue_date or date.today(),
        start_date=payload.start_date,
        end_date=payload.end_date,
        status="Draft",
        scope_of_work=payload.scope_of_work,
        deliverables=payload.deliverables,
        exclusions=payload.exclusions,
        assumptions=payload.assumptions,
        acceptance_criteria=payload.acceptance_criteria,
        payment_terms=payload.payment_terms,
        terms_and_conditions=(
            payload.terms_and_conditions
            if payload.terms_and_conditions is not None
            else estimate.terms_and_conditions
        ),
        estimate_snapshot=build_estimate_snapshot(estimate),
        notes=payload.notes,
    )

    validate_assignee(db, tenant_id, contract.assigned_to)

    try:
        db.add(contract)
        db.flush()

        # Convert percentages into fixed contract amounts. The final milestone
        # absorbs any rounding cent so all milestone amounts equal the contract.
        running_amount = Decimal("0.00")
        milestone_inputs = payload.payment_milestones
        for index, item in enumerate(milestone_inputs, start=1):
            if index == len(milestone_inputs):
                milestone_amount = Decimal(str(contract.contract_value)) - running_amount
            else:
                milestone_amount = (
                    Decimal(str(contract.contract_value)) * item.percentage / Decimal("100")
                ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
                running_amount += milestone_amount
            if milestone_amount <= 0:
                raise HTTPException(status_code=422, detail="Each payment milestone must have a positive calculated amount")
            contract.payment_milestones.append(SoftwareContractMilestone(
                tenant_id=tenant_id, sequence=index, name=item.name.strip(),
                percentage=item.percentage, amount=milestone_amount,
                trigger_description=item.trigger_description, status="Pending",
            ))

        db.flush()

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="CREATE",
            module="software_contracts",
            record_id=contract.id,
            description="Created software contract from accepted estimate",
            after_data=contract_snapshot(contract),
        )

        db.commit()
        db.refresh(contract)
        return contract

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The contract number already exists or a contract "
                "has already been created for this estimate"
            ),
        )
    except Exception:
        db.rollback()
        raise


@router.get(
    "",
    response_model=list[SoftwareContractResponse],
    dependencies=[Depends(require_permission("software_contract.view"))],
)
def list_software_contracts(
    contract_status: str | None = Query(default=None, alias="status"),
    assigned_to: uuid.UUID | None = None,
    account_id: uuid.UUID | None = None,
    software_estimate_id: uuid.UUID | None = None,
    deal_id: uuid.UUID | None = None,
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, _ = get_tenant_and_user(current_user)
    require_software_industry(db, tenant_id)

    query = db.query(SoftwareContract).filter(
        SoftwareContract.tenant_id == tenant_id
    )

    if contract_status:
        query = query.filter(SoftwareContract.status == contract_status)

    if assigned_to:
        query = query.filter(SoftwareContract.assigned_to == assigned_to)

    if account_id:
        query = query.filter(SoftwareContract.account_id == account_id)

    if software_estimate_id:
        query = query.filter(
            SoftwareContract.software_estimate_id == software_estimate_id
        )

    if deal_id:
        query = query.filter(SoftwareContract.deal_id == deal_id)

    return (
        query.order_by(SoftwareContract.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get(
    "/{contract_id}",
    response_model=SoftwareContractResponse,
    dependencies=[Depends(require_permission("software_contract.view"))],
)
def get_software_contract(
    contract_id: uuid.UUID,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, _ = get_tenant_and_user(current_user)
    require_software_industry(db, tenant_id)

    return get_contract_or_404(db, tenant_id, contract_id)


@router.patch(
    "/{contract_id}",
    response_model=SoftwareContractResponse,
    dependencies=[Depends(require_permission("software_contract.update"))],
)
def update_software_contract(
    contract_id: uuid.UUID,
    payload: SoftwareContractUpdate,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, user_id = get_tenant_and_user(current_user)
    require_software_industry(db, tenant_id)

    contract = get_contract_or_404(db, tenant_id, contract_id)

    before_data = contract_snapshot(contract)
    changes = payload.model_dump(exclude_unset=True)

    # Validate assignee
    if "assigned_to" in changes:
        validate_assignee(db, tenant_id, changes["assigned_to"])

    # Validate start and end dates
    start_date = changes.get("start_date", contract.start_date)
    end_date = changes.get("end_date", contract.end_date)

    if (
        start_date is not None
        and end_date is not None
        and end_date < start_date
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="End date cannot be before start date",
        )

    # Validate contract status transitions
    allowed_statuses = set(CONTRACT_STATUS_TRANSITIONS.keys())
    requested_status = changes.get("status")

    if requested_status is not None:
        if requested_status not in allowed_statuses:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid contract status",
            )

        if requested_status != contract.status:
            allowed_next_statuses = CONTRACT_STATUS_TRANSITIONS.get(
                contract.status, set()
            )

            if requested_status not in allowed_next_statuses:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=(
                        f"Cannot change contract status from "
                        f"'{contract.status}' to '{requested_status}'"
                    ),
                )

    # Automatically set signed_date when a contract is signed
    if (
        changes.get("status") == "Signed"
        and contract.signed_date is None
        and "signed_date" not in changes
    ):
        changes["signed_date"] = date.today()

    # Apply updates
    for field, value in changes.items():
        setattr(contract, field, value)

    if changes.get("status") in {"Signed", "Active"} and contract.payment_milestones:
        first_milestone = min(contract.payment_milestones, key=lambda item: item.sequence)
        if first_milestone.status == "Pending":
            first_milestone.status = "Ready"

    try:
        db.flush()

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="UPDATE",
            module="software_contracts",
            record_id=contract.id,
            description="Updated software contract",
            before_data=before_data,
            after_data=contract_snapshot(contract),
        )

        db.commit()
        db.refresh(contract)

        return contract

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The contract number already exists",
        )

    except Exception:
        db.rollback()
        raise

@router.post(
    "/{contract_id}/milestones/{milestone_id}/ready",
    response_model=SoftwareContractMilestoneResponse,
    dependencies=[Depends(require_permission("software_contract.update"))],
)
def mark_contract_milestone_ready(
    contract_id: uuid.UUID, milestone_id: uuid.UUID,
    payload: SoftwareContractMilestoneReadyRequest,
    current_user: dict = Depends(require_active_user), db: Session = Depends(get_db),
):
    tenant_id, user_id = get_tenant_and_user(current_user)
    require_software_industry(db, tenant_id)
    contract = get_contract_or_404(db, tenant_id, contract_id)
    milestone = db.query(SoftwareContractMilestone).filter(
        SoftwareContractMilestone.id == milestone_id,
        SoftwareContractMilestone.contract_id == contract.id,
        SoftwareContractMilestone.tenant_id == tenant_id,
    ).with_for_update().first()
    if not milestone:
        raise HTTPException(status_code=404, detail="Contract payment milestone not found")
    if contract.status not in {"Signed", "Active"}:
        raise HTTPException(status_code=409, detail="A contract must be Signed or Active before billing milestones can be activated")
    if milestone.status != "Pending":
        raise HTTPException(status_code=409, detail=f"Only Pending milestones can be activated; current status is '{milestone.status}'")
    previous = db.query(SoftwareContractMilestone).filter(
        SoftwareContractMilestone.tenant_id == tenant_id,
        SoftwareContractMilestone.contract_id == contract.id,
        SoftwareContractMilestone.sequence < milestone.sequence,
    ).order_by(SoftwareContractMilestone.sequence.desc()).first()
    if previous and previous.status != "Paid":
        raise HTTPException(status_code=409, detail=f"Previous milestone '{previous.name}' must be fully paid before this milestone can be activated")
    milestone.status = "Ready"
    log_audit(db, tenant_id, user_id, "milestone_ready", "software_contracts", milestone.id,
              f"Payment milestone '{milestone.name}' marked Ready",
              after_data={"status": milestone.status, "percentage": str(milestone.percentage), "amount": str(milestone.amount), "notes": payload.notes})
    db.commit()
    db.refresh(milestone)
    return milestone


@router.post(
    "/{contract_id}/milestones/{milestone_id}/invoice",
    response_model=SoftwareContractMilestoneResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("software_contract.create"))],
)
def create_invoice_for_contract_milestone(
    contract_id: uuid.UUID, milestone_id: uuid.UUID,
    payload: SoftwareContractMilestoneInvoiceRequest,
    current_user: dict = Depends(require_active_user), db: Session = Depends(get_db),
):
    tenant_id, user_id = get_tenant_and_user(current_user)
    require_software_industry(db, tenant_id)
    contract = get_contract_or_404(db, tenant_id, contract_id)
    milestone = db.query(SoftwareContractMilestone).filter(
        SoftwareContractMilestone.id == milestone_id,
        SoftwareContractMilestone.contract_id == contract.id,
        SoftwareContractMilestone.tenant_id == tenant_id,
    ).with_for_update().first()
    if not milestone:
        raise HTTPException(status_code=404, detail="Contract payment milestone not found")
    if milestone.status != "Ready" or milestone.invoice_id is not None:
        raise HTTPException(status_code=409, detail="Only a Ready milestone without an existing invoice can be invoiced")
    project = db.query(SoftwareProject).filter(
        SoftwareProject.tenant_id == tenant_id,
        SoftwareProject.software_contract_id == contract.id,
    ).first()
    if not project:
        raise HTTPException(status_code=409, detail="Create the software project linked to this contract before generating milestone invoices")
    issue_date = date.today()
    if payload.due_date and payload.due_date < issue_date:
        raise HTTPException(status_code=422, detail="due_date cannot be before the invoice issue date")
    invoice_number = (payload.invoice_number or f"SINV-{date.today():%Y%m%d}-{uuid.uuid4().hex[:8].upper()}").strip()
    if not invoice_number:
        raise HTTPException(status_code=422, detail="invoice_number cannot be blank")
    invoice = SoftwareInvoice(
        tenant_id=tenant_id, project_id=project.id, software_contract_id=contract.id,
        created_by=user_id, invoice_number=invoice_number, currency=contract.currency,
        issue_date=issue_date, due_date=payload.due_date, status="Draft",
        subtotal=milestone.amount, tax_total=Decimal("0.00"), total_amount=milestone.amount,
        notes=payload.notes or f"Payment milestone: {milestone.name} ({milestone.percentage}%)",
    )
    invoice.items.append(SoftwareInvoiceItem(
        tenant_id=tenant_id, description=f"{milestone.name} - {milestone.percentage}% milestone",
        quantity=Decimal("1.0000"), unit_price=milestone.amount, tax_percent=Decimal("0.00"),
        line_subtotal=milestone.amount, line_tax=Decimal("0.00"), line_total=milestone.amount,
    ))
    milestone.status = "Invoiced"
    try:
        db.add(invoice)
        db.flush()
        milestone.invoice_id = invoice.id
        log_audit(db, tenant_id, user_id, "milestone_invoice_created", "software_contracts", milestone.id,
                  f"Created invoice {invoice.invoice_number} for milestone '{milestone.name}'",
                  after_data={"invoice_id": str(invoice.id), "invoice_number": invoice.invoice_number, "amount": str(milestone.amount)})
        db.commit()
        db.refresh(milestone)
        return milestone
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Invoice number already exists or this milestone has already been invoiced") from exc
    except Exception:
        db.rollback()
        raise


@router.delete(
    "/{contract_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("software_contract.delete"))],
)
def delete_software_contract(
    contract_id: uuid.UUID,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, user_id = get_tenant_and_user(current_user)
    require_software_industry(db, tenant_id)

    contract = get_contract_or_404(db, tenant_id, contract_id)
    before_data = contract_snapshot(contract)

    project = (
        db.query(SoftwareProject)
        .filter(
            SoftwareProject.tenant_id == tenant_id,
            SoftwareProject.software_contract_id == contract.id,
        )
        .first()
    )

    if project:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This contract has project {project.project_number} "
                "and cannot be deleted. Delete the project first, or set "
                "the contract status to Terminated instead."
            ),
        )

    try:
        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="DELETE",
            module="software_contracts",
            record_id=contract.id,
            description="Deleted software contract",
            before_data=before_data,
        )

        db.delete(contract)
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