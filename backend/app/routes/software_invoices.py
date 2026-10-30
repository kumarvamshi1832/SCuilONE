import uuid
from datetime import date, datetime
from decimal import Decimal, ROUND_HALF_UP

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.dependencies import require_active_user
from app.core.industry_modules import require_enabled_module
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.software_contract import SoftwareContract
from app.models.software_contract_milestone import SoftwareContractMilestone
from app.models.software_invoice import SoftwareInvoice, SoftwareInvoiceItem, SoftwareInvoicePayment
from app.models.software_project import SoftwareProject
from app.models.software_time_entry import SoftwareTimeEntry
from app.models.activity import Activity
from app.services.audit_service import log_audit
from app.schemas.software_invoice import (
    SoftwareInvoiceCreate, SoftwareInvoicePaymentCreate, SoftwareInvoiceResponse,
    SoftwareInvoiceStatusUpdate,
)

router = APIRouter(
    prefix="/api/v1/software-invoices",
    tags=["Software Invoices and Billing"],
    dependencies=[Depends(require_enabled_module("software_contracts"))],
)
CENT = Decimal("0.01")
FOUR_PLACES = Decimal("0.0001")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def money(value: Decimal) -> Decimal:
    return value.quantize(CENT, rounding=ROUND_HALF_UP)


def get_context(current_user: dict):
    try:
        return uuid.UUID(str(current_user["tenant_id"])), uuid.UUID(str(current_user["user_id"]))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authenticated user context")


def invoice_query(db: Session, tenant_id: uuid.UUID):
    return db.query(SoftwareInvoice).options(
        selectinload(SoftwareInvoice.items), selectinload(SoftwareInvoice.payments)
    ).filter(SoftwareInvoice.tenant_id == tenant_id)


def get_invoice(db: Session, tenant_id: uuid.UUID, invoice_id: uuid.UUID, lock: bool = False):
    query = db.query(SoftwareInvoice).options(
        selectinload(SoftwareInvoice.items), selectinload(SoftwareInvoice.payments)
    ).filter(SoftwareInvoice.id == invoice_id, SoftwareInvoice.tenant_id == tenant_id)
    if lock:
        query = query.with_for_update()
    invoice = query.first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Software invoice not found")
    return invoice


def invoice_payload(invoice: SoftwareInvoice) -> dict:
    paid = money(sum((Decimal(str(p.amount)) for p in invoice.payments), Decimal("0.00")))
    return {
        "id": invoice.id, "tenant_id": invoice.tenant_id, "project_id": invoice.project_id,
        "software_contract_id": invoice.software_contract_id, "created_by": invoice.created_by,
        "invoice_number": invoice.invoice_number, "currency": invoice.currency,
        "issue_date": invoice.issue_date, "due_date": invoice.due_date, "status": invoice.status,
        "subtotal": invoice.subtotal, "tax_total": invoice.tax_total, "total_amount": invoice.total_amount,
        "amount_paid": paid, "balance_due": money(Decimal(str(invoice.total_amount)) - paid),
        "notes": invoice.notes, "sent_at": invoice.sent_at, "created_at": invoice.created_at,
        "updated_at": invoice.updated_at, "items": invoice.items, "payments": invoice.payments,
    }


@router.post("/", response_model=SoftwareInvoiceResponse, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_permission("software_contract.create"))])
def create_invoice(data: SoftwareInvoiceCreate, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = get_context(current_user)
    project = db.query(SoftwareProject).filter(
        SoftwareProject.id == data.project_id, SoftwareProject.tenant_id == tenant_id
    ).first()
    contract = db.query(SoftwareContract).filter(
        SoftwareContract.id == data.software_contract_id, SoftwareContract.tenant_id == tenant_id
    ).first()
    if not project or not contract:
        raise HTTPException(status_code=404, detail="Project or contract not found for this tenant")
    if project.software_contract_id != contract.id:
        raise HTTPException(status_code=400, detail="The selected project is not linked to this contract")
    effective_issue_date = data.issue_date or date.today()
    if data.due_date and data.due_date < effective_issue_date:
        raise HTTPException(status_code=400, detail="due_date cannot be before issue_date")
    if db.query(SoftwareInvoice.id).filter(
        SoftwareInvoice.tenant_id == tenant_id, SoftwareInvoice.invoice_number == data.invoice_number
    ).first():
        raise HTTPException(status_code=409, detail="Invoice number already exists for this tenant")

    invoice = SoftwareInvoice(
        tenant_id=tenant_id, project_id=project.id, software_contract_id=contract.id,
        created_by=user_id, invoice_number=data.invoice_number.strip(), currency=contract.currency,
        issue_date=effective_issue_date, due_date=data.due_date, status="Draft", notes=data.notes,
        subtotal=Decimal("0.00"), tax_total=Decimal("0.00"), total_amount=Decimal("0.00"),
    )
    subtotal_total = Decimal("0.00")
    tax_total = Decimal("0.00")
    for item_data in data.items:
        description = item_data.description.strip()
        quantity = Decimal(item_data.quantity).quantize(FOUR_PLACES, rounding=ROUND_HALF_UP)
        unit_price = money(Decimal(item_data.unit_price))
        tax_percent = Decimal(item_data.tax_percent)
        time_entry_id = item_data.time_entry_id
        if time_entry_id:
            entry = db.query(SoftwareTimeEntry).filter(
                SoftwareTimeEntry.id == time_entry_id, SoftwareTimeEntry.tenant_id == tenant_id
            ).with_for_update().first()
            if not entry:
                raise HTTPException(status_code=404, detail="Time entry not found for this tenant")
            if not entry.is_billable:
                raise HTTPException(status_code=400, detail="Only billable time entries can be invoiced")
            if getattr(entry, "billing_status", "Unreviewed") != "Approved":
                raise HTTPException(status_code=400, detail="Time entry must be approved for billing first")
            if entry.duration_minutes is None or (entry.source == "timer" and entry.stopped_at is None):
                raise HTTPException(status_code=400, detail="Running or uncalculated time entries cannot be invoiced")
            if db.query(SoftwareInvoiceItem.id).filter(SoftwareInvoiceItem.time_entry_id == time_entry_id).first():
                raise HTTPException(status_code=409, detail="This time entry has already been invoiced")
            activity = db.query(Activity).filter(
                Activity.id == entry.activity_id, Activity.tenant_id == tenant_id
            ).first()
            if not activity:
                raise HTTPException(status_code=404, detail="Task linked to time entry was not found")
            description = description or activity.title
            quantity = (Decimal(entry.duration_minutes) / Decimal(60)).quantize(FOUR_PLACES, rounding=ROUND_HALF_UP)
        line_subtotal = money(quantity * unit_price)
        line_tax = money(line_subtotal * tax_percent / Decimal(100))
        line_total = money(line_subtotal + line_tax)
        invoice.items.append(SoftwareInvoiceItem(
            tenant_id=tenant_id, time_entry_id=time_entry_id, description=description,
            quantity=quantity, unit_price=unit_price, tax_percent=tax_percent,
            line_subtotal=line_subtotal, line_tax=line_tax, line_total=line_total,
        ))
        subtotal_total += line_subtotal
        tax_total += line_tax

    invoice.subtotal = money(subtotal_total)
    invoice.tax_total = money(tax_total)
    invoice.total_amount = money(subtotal_total + tax_total)
    if invoice.total_amount <= 0:
        raise HTTPException(status_code=400, detail="Invoice total must be greater than zero")
    db.add(invoice)
    try:
        db.flush()
        log_audit(db, tenant_id, user_id, "create", "software_invoice", invoice.id,
                  "Created draft software invoice", after_data={
                      "invoice_number": invoice.invoice_number, "project_id": project.id,
                      "software_contract_id": contract.id, "total_amount": invoice.total_amount,
                      "status": invoice.status,
                  })
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Invoice number or time entry has already been used") from exc
    except Exception:
        db.rollback()
        raise
    return invoice_payload(get_invoice(db, tenant_id, invoice.id))


@router.get("/", response_model=list[SoftwareInvoiceResponse], dependencies=[Depends(require_permission("software_contract.view"))])
def list_invoices(status_filter: str | None = Query(default=None, alias="status"), project_id: uuid.UUID | None = None,
                  current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, _ = get_context(current_user)
    query = invoice_query(db, tenant_id)
    if status_filter:
        query = query.filter(SoftwareInvoice.status == status_filter)
    if project_id:
        query = query.filter(SoftwareInvoice.project_id == project_id)
    invoices = query.order_by(SoftwareInvoice.created_at.desc()).all()
    return [invoice_payload(invoice) for invoice in invoices]


@router.get("/{invoice_id}", response_model=SoftwareInvoiceResponse, dependencies=[Depends(require_permission("software_contract.view"))])
def read_invoice(invoice_id: uuid.UUID, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, _ = get_context(current_user)
    return invoice_payload(get_invoice(db, tenant_id, invoice_id))


@router.patch("/{invoice_id}/status", response_model=SoftwareInvoiceResponse, dependencies=[Depends(require_permission("software_contract.update"))])
def update_invoice_status(invoice_id: uuid.UUID, data: SoftwareInvoiceStatusUpdate,
                          current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = get_context(current_user)
    invoice = get_invoice(db, tenant_id, invoice_id, lock=True)
    old_status = invoice.status
    if old_status == data.status:
        return invoice_payload(invoice)
    if old_status == "Draft" and data.status in {"Sent", "Void"}:
        pass
    elif old_status == "Sent" and data.status == "Void" and not invoice.payments:
        pass
    else:
        raise HTTPException(status_code=400, detail=f"Cannot change invoice status from '{old_status}' to '{data.status}'")
    invoice.status = data.status
    if data.status == "Sent":
        invoice.sent_at = datetime.utcnow()
    if data.status == "Void":
        linked_milestone = db.query(SoftwareContractMilestone).filter(
            SoftwareContractMilestone.tenant_id == tenant_id,
            SoftwareContractMilestone.invoice_id == invoice.id,
        ).with_for_update().first()
        if linked_milestone:
            linked_milestone.invoice_id = None
            linked_milestone.status = "Ready"
    log_audit(db, tenant_id, user_id, "status_change", "software_invoice", invoice.id,
              f"Invoice status changed from {old_status} to {data.status}",
              before_data={"status": old_status}, after_data={"status": data.status})
    db.commit()
    return invoice_payload(get_invoice(db, tenant_id, invoice.id))


@router.post("/{invoice_id}/payments", response_model=SoftwareInvoiceResponse, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_permission("software_contract.update"))])
def record_invoice_payment(invoice_id: uuid.UUID, data: SoftwareInvoicePaymentCreate,
                           current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = get_context(current_user)
    invoice = get_invoice(db, tenant_id, invoice_id, lock=True)
    if invoice.status not in {"Sent", "Partially Paid"}:
        raise HTTPException(status_code=400, detail="Payments can only be recorded for Sent or Partially Paid invoices")
    paid_before = sum((Decimal(str(p.amount)) for p in invoice.payments), Decimal("0.00"))
    balance = money(Decimal(str(invoice.total_amount)) - paid_before)
    amount = money(Decimal(data.amount))
    if amount > balance:
        raise HTTPException(status_code=400, detail=f"Payment exceeds outstanding balance of {balance}")

    payment_method = data.payment_method.strip()
    if not payment_method:
        raise HTTPException(status_code=422, detail="payment_method cannot be blank")

    
    transaction_reference = (data.transaction_reference or "").strip() or None
    if transaction_reference:
        duplicate_reference = db.query(SoftwareInvoicePayment.id).filter(
            SoftwareInvoicePayment.tenant_id == tenant_id,
            func.lower(func.btrim(SoftwareInvoicePayment.transaction_reference))
            == transaction_reference.lower(),
        ).first()
        if duplicate_reference:
            raise HTTPException(
                status_code=409,
                detail="This transaction reference has already been recorded for this tenant",
            )

    payment = SoftwareInvoicePayment(
        tenant_id=tenant_id, invoice_id=invoice.id, created_by=user_id, amount=amount,
        payment_method=payment_method, transaction_reference=transaction_reference,
        payment_date=data.payment_date or date.today(), notes=data.notes,
    )
    db.add(payment)
    paid_after = paid_before + amount
    old_status = invoice.status
    invoice.status = "Paid" if paid_after == Decimal(str(invoice.total_amount)) else "Partially Paid"
    if invoice.status == "Paid":
        linked_milestone = db.query(SoftwareContractMilestone).filter(
            SoftwareContractMilestone.tenant_id == tenant_id,
            SoftwareContractMilestone.invoice_id == invoice.id,
        ).with_for_update().first()
        if linked_milestone:
            linked_milestone.status = "Paid"
    log_audit(db, tenant_id, user_id, "payment_recorded", "software_invoice", invoice.id,
              "Recorded invoice payment", before_data={"amount_paid": paid_before, "status": old_status},
              after_data={"payment_amount": amount, "amount_paid": paid_after, "status": invoice.status,
                          "payment_method": payment_method, "transaction_reference": transaction_reference})
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # The unique database index is the final guard against concurrent
        # requests that both pass the application-level duplicate check.
        constraint_name = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
        if constraint_name == "uq_software_invoice_payments_tenant_reference":
            raise HTTPException(
                status_code=409,
                detail="This transaction reference has already been recorded for this tenant",
            ) from exc
        raise
    except Exception:
        db.rollback()
        raise
    return invoice_payload(get_invoice(db, tenant_id, invoice.id))
