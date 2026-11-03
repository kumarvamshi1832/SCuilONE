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
from app.models.activity_link import ActivityLink
from app.models.software_sprint import SoftwareSprint
from app.models.software_invoice import (
    SoftwareCreditNote, SoftwareInvoice, SoftwareInvoiceItem, SoftwareInvoicePayment,
)
from app.models.software_project import SoftwareProject
from app.models.software_time_entry import SoftwareTimeEntry
from app.models.activity import Activity
from app.services.audit_service import log_audit
from app.schemas.software_invoice import (
    SoftwareCreditNoteCreate, SoftwareInvoiceCreate, SoftwareInvoicePaymentCreate,
    SoftwareInvoicePaymentReverse, SoftwareInvoiceResponse, SoftwareInvoiceStatusUpdate,
)
from app.services.document_numbers import next_unused_number

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
        selectinload(SoftwareInvoice.items), selectinload(SoftwareInvoice.payments),
        selectinload(SoftwareInvoice.credit_notes),
    ).filter(SoftwareInvoice.tenant_id == tenant_id)


def get_invoice(db: Session, tenant_id: uuid.UUID, invoice_id: uuid.UUID, lock: bool = False):
    query = db.query(SoftwareInvoice).options(
        selectinload(SoftwareInvoice.items), selectinload(SoftwareInvoice.payments),
        selectinload(SoftwareInvoice.credit_notes),
    ).filter(SoftwareInvoice.id == invoice_id, SoftwareInvoice.tenant_id == tenant_id)
    if lock:
        query = query.with_for_update()
    invoice = query.first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Software invoice not found")
    return invoice


def received_total(invoice: SoftwareInvoice) -> Decimal:
    """Money actually held: reversed payments no longer count."""
    return money(sum(
        (Decimal(str(p.amount)) for p in invoice.payments if p.status == "Received"),
        Decimal("0.00"),
    ))


def credited_total(invoice: SoftwareInvoice) -> Decimal:
    return money(sum(
        (Decimal(str(n.amount)) for n in invoice.credit_notes), Decimal("0.00")
    ))


def outstanding_amount(invoice: SoftwareInvoice) -> Decimal:
    if invoice.status == "Void":
        return Decimal("0.00")
    return max(
        money(Decimal(str(invoice.total_amount)) - received_total(invoice) - credited_total(invoice)),
        Decimal("0.00"),
    )


def apply_settlement(db: Session, tenant_id: uuid.UUID, invoice: SoftwareInvoice,
                     received: Decimal, credited: Decimal) -> None:
    """Set the invoice status from its money and keep the milestone in step."""
    outstanding = money(Decimal(str(invoice.total_amount)) - received - credited)
    if outstanding <= 0:
        invoice.status = "Paid" if received > 0 else "Credited"
    elif received > 0:
        invoice.status = "Partially Paid"
    else:
        invoice.status = "Sent"

    milestone = db.query(SoftwareContractMilestone).filter(
        SoftwareContractMilestone.tenant_id == tenant_id,
        SoftwareContractMilestone.invoice_id == invoice.id,
    ).with_for_update().first()
    if milestone:
        if invoice.status in {"Paid", "Credited"}:
            milestone.status = "Paid"
        elif milestone.status == "Paid":
            milestone.status = "Invoiced"


def allocate_invoice_number(db: Session, tenant_id: uuid.UUID, year: int) -> str:
    return next_unused_number(
        db, tenant_id, "INV",
        lambda number: db.query(SoftwareInvoice.id).filter(
            SoftwareInvoice.tenant_id == tenant_id, SoftwareInvoice.invoice_number == number
        ).first() is not None,
        year,
    )


def invoice_payload(invoice: SoftwareInvoice) -> dict:
    paid = received_total(invoice)
    credited = credited_total(invoice)
    balance = outstanding_amount(invoice)
    today = date.today()
    is_overdue = (
        invoice.status in {"Sent", "Partially Paid"}
        and invoice.due_date is not None and invoice.due_date < today and balance > 0
    )
    return {
        "id": invoice.id, "tenant_id": invoice.tenant_id, "project_id": invoice.project_id,
        "software_contract_id": invoice.software_contract_id, "created_by": invoice.created_by,
        "invoice_number": invoice.invoice_number, "currency": invoice.currency,
        "issue_date": invoice.issue_date, "due_date": invoice.due_date, "status": invoice.status,
        "subtotal": invoice.subtotal, "tax_total": invoice.tax_total, "total_amount": invoice.total_amount,
        "amount_paid": paid, "credited_amount": credited, "balance_due": balance,
        "is_overdue": is_overdue, "days_overdue": (today - invoice.due_date).days if is_overdue else 0,
        "notes": invoice.notes, "sent_at": invoice.sent_at, "created_at": invoice.created_at,
        "updated_at": invoice.updated_at, "items": invoice.items, "payments": invoice.payments,
        "credit_notes": invoice.credit_notes,
    }


@router.post("/", response_model=SoftwareInvoiceResponse, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_permission("software_invoice.create"))])
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
    if contract.billing_type not in {"Fixed Price", "Time & Material"}:
        raise HTTPException(status_code=400, detail="Contract has an unsupported billing type")
    if contract.billing_type == "Fixed Price" and any(item.time_entry_id for item in data.items):
        raise HTTPException(status_code=400, detail="Fixed Price contracts must be invoiced through payment milestones")
    if contract.billing_type == "Time & Material" and any(not item.time_entry_id for item in data.items):
        raise HTTPException(status_code=400, detail="Time & Material invoices must contain approved time entries only")
    if contract.billing_type == "Time & Material" and contract.hourly_rate is None:
        raise HTTPException(status_code=400, detail="Time & Material contract is missing its hourly rate")
    effective_issue_date = data.issue_date or date.today()
    if data.due_date and data.due_date < effective_issue_date:
        raise HTTPException(status_code=400, detail="due_date cannot be before issue_date")
    if data.invoice_number and data.invoice_number.strip():
        invoice_number = data.invoice_number.strip()
        if db.query(SoftwareInvoice.id).filter(
            SoftwareInvoice.tenant_id == tenant_id, SoftwareInvoice.invoice_number == invoice_number
        ).first():
            raise HTTPException(status_code=409, detail="Invoice number already exists for this tenant")
    else:
        invoice_number = allocate_invoice_number(db, tenant_id, effective_issue_date.year)

    invoice = SoftwareInvoice(
        tenant_id=tenant_id, project_id=project.id, software_contract_id=contract.id,
        created_by=user_id, invoice_number=invoice_number, currency=contract.currency,
        issue_date=effective_issue_date, due_date=data.due_date, status="Draft", notes=data.notes,
        subtotal=Decimal("0.00"), tax_total=Decimal("0.00"), total_amount=Decimal("0.00"),
    )
    subtotal_total = Decimal("0.00")
    tax_total = Decimal("0.00")
    for item_data in data.items:
        description = (item_data.description or "").strip()
        quantity = Decimal(item_data.quantity or 0).quantize(FOUR_PLACES, rounding=ROUND_HALF_UP)
        unit_price = money(Decimal(item_data.unit_price)) if item_data.unit_price is not None else Decimal("0.00")
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
            # The work must belong to the project being invoiced (directly or through one of its sprints),
            # otherwise one customer could be billed for another customer's hours.
            on_project = db.query(ActivityLink.id).filter(
                ActivityLink.tenant_id == tenant_id, ActivityLink.activity_id == activity.id,
                ActivityLink.module == "software_project", ActivityLink.record_id == project.id,
            ).first()
            if not on_project:
                sprint_ids = [row[0] for row in db.query(ActivityLink.record_id).filter(
                    ActivityLink.tenant_id == tenant_id, ActivityLink.activity_id == activity.id,
                    ActivityLink.module == "software_sprint",
                ).all()]
                on_project = sprint_ids and db.query(SoftwareSprint.id).filter(
                    SoftwareSprint.tenant_id == tenant_id, SoftwareSprint.id.in_(sprint_ids),
                    SoftwareSprint.software_project_id == project.id,
                ).first()
            if not on_project:
                raise HTTPException(status_code=400, detail="This time entry does not belong to the project being invoiced")
            description = description or activity.title
            quantity = (Decimal(entry.duration_minutes) / Decimal(60)).quantize(FOUR_PLACES, rounding=ROUND_HALF_UP)
            # Contract rate is authoritative for Time & Material billing.
            unit_price = money(Decimal(str(contract.hourly_rate)))
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


@router.get("/", response_model=list[SoftwareInvoiceResponse], dependencies=[Depends(require_permission("software_invoice.view"))])
def list_invoices(status_filter: str | None = Query(default=None, alias="status"), project_id: uuid.UUID | None = None,
                  overdue: bool | None = None,
                  current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, _ = get_context(current_user)
    query = invoice_query(db, tenant_id)
    if status_filter:
        query = query.filter(SoftwareInvoice.status == status_filter)
    if project_id:
        query = query.filter(SoftwareInvoice.project_id == project_id)
    if overdue:
        query = query.filter(
            SoftwareInvoice.status.in_(("Sent", "Partially Paid")),
            SoftwareInvoice.due_date.is_not(None), SoftwareInvoice.due_date < date.today(),
        )
        invoices = query.order_by(SoftwareInvoice.due_date.asc()).all()
    else:
        invoices = query.order_by(SoftwareInvoice.created_at.desc()).all()
    return [invoice_payload(invoice) for invoice in invoices]


@router.get("/summary", dependencies=[Depends(require_permission("software_invoice.view"))])
def billing_summary(project_id: uuid.UUID | None = None,
                    current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    """Billing totals per currency (optionally for one project)."""
    tenant_id, _ = get_context(current_user)
    query = invoice_query(db, tenant_id).filter(
        SoftwareInvoice.status.in_(("Sent", "Partially Paid", "Paid", "Credited"))
    )
    if project_id:
        query = query.filter(SoftwareInvoice.project_id == project_id)
    totals: dict[str, dict] = {}
    for invoice in query.all():
        row = totals.setdefault(invoice.currency, {
            "currency": invoice.currency, "invoiced": Decimal("0.00"), "received": Decimal("0.00"),
            "credited": Decimal("0.00"), "outstanding": Decimal("0.00"),
            "overdue_amount": Decimal("0.00"), "overdue_invoice_count": 0,
        })
        payload = invoice_payload(invoice)
        row["invoiced"] += Decimal(str(invoice.total_amount))
        row["received"] += payload["amount_paid"]
        row["credited"] += payload["credited_amount"]
        row["outstanding"] += payload["balance_due"]
        if payload["is_overdue"]:
            row["overdue_amount"] += payload["balance_due"]
            row["overdue_invoice_count"] += 1
    return {"items": [{k: (str(v) if isinstance(v, Decimal) else v) for k, v in row.items()} for row in totals.values()]}


@router.get("/{invoice_id}", response_model=SoftwareInvoiceResponse, dependencies=[Depends(require_permission("software_invoice.view"))])
def read_invoice(invoice_id: uuid.UUID, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, _ = get_context(current_user)
    return invoice_payload(get_invoice(db, tenant_id, invoice_id))


@router.patch("/{invoice_id}/status", response_model=SoftwareInvoiceResponse)
def update_invoice_status(invoice_id: uuid.UUID, data: SoftwareInvoiceStatusUpdate,
                          current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    # Sending and voiding are separate permissions, so check the one that applies.
    require_permission(
        "software_invoice.cancel" if data.status == "Void" else "software_invoice.send"
    )(current_user=current_user, db=db)
    tenant_id, user_id = get_context(current_user)
    invoice = get_invoice(db, tenant_id, invoice_id, lock=True)
    old_status = invoice.status
    if old_status == data.status:
        return invoice_payload(invoice)
    if old_status == "Draft" and data.status in {"Sent", "Void"}:
        pass
    elif old_status == "Sent" and data.status == "Void" and received_total(invoice) <= 0 and not invoice.credit_notes:
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
             dependencies=[Depends(require_permission("software_invoice.payment.create"))])
def record_invoice_payment(invoice_id: uuid.UUID, data: SoftwareInvoicePaymentCreate,
                           current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = get_context(current_user)
    invoice = get_invoice(db, tenant_id, invoice_id, lock=True)
    if invoice.status not in {"Sent", "Partially Paid"}:
        raise HTTPException(status_code=400, detail="Payments can only be recorded for Sent or Partially Paid invoices")

    payment_method = data.payment_method.strip()
    if not payment_method:
        raise HTTPException(status_code=422, detail="payment_method cannot be blank")
    transaction_reference = (data.transaction_reference or "").strip() or None

    payment_date = data.payment_date or date.today()
    if payment_date > date.today():
        raise HTTPException(status_code=400, detail="Payment date cannot be in the future")
    if payment_date < invoice.issue_date:
        raise HTTPException(status_code=400, detail="Payment date cannot be before the invoice issue date")

    paid_before = received_total(invoice)
    credited = credited_total(invoice)
    balance = money(Decimal(str(invoice.total_amount)) - paid_before - credited)
    amount = money(Decimal(data.amount))
    if amount > balance:
        raise HTTPException(status_code=400, detail=f"Payment exceeds outstanding balance of {balance}")

    if transaction_reference:
        duplicate_reference = db.query(SoftwareInvoicePayment.id).filter(
            SoftwareInvoicePayment.tenant_id == tenant_id,
            SoftwareInvoicePayment.status == "Received",
            func.lower(func.btrim(SoftwareInvoicePayment.payment_method)) == payment_method.lower(),
            func.lower(func.btrim(SoftwareInvoicePayment.transaction_reference)) == transaction_reference.lower(),
        ).first()
        if duplicate_reference:
            raise HTTPException(
                status_code=409,
                detail="This payment method and transaction reference has already been recorded",
            )

    payment = SoftwareInvoicePayment(
        tenant_id=tenant_id, invoice_id=invoice.id, created_by=user_id, amount=amount,
        payment_method=payment_method, transaction_reference=transaction_reference,
        payment_date=payment_date, notes=data.notes, status="Received",
    )
    db.add(payment)
    old_status = invoice.status
    apply_settlement(db, tenant_id, invoice, paid_before + amount, credited)
    log_audit(db, tenant_id, user_id, "payment_recorded", "software_invoice", invoice.id,
              "Recorded invoice payment", before_data={"amount_paid": paid_before, "status": old_status},
              after_data={"payment_amount": amount, "amount_paid": paid_before + amount, "status": invoice.status,
                          "payment_method": payment_method, "transaction_reference": transaction_reference})
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        # The unique database index is the final guard against concurrent
        # requests that both pass the application-level duplicate check.
        constraint_name = getattr(getattr(exc.orig, "diag", None), "constraint_name", None)
        if constraint_name == "uq_software_invoice_payments_tenant_method_reference":
            raise HTTPException(
                status_code=409,
                detail="This payment method and transaction reference has already been recorded",
            ) from exc
        raise
    except Exception:
        db.rollback()
        raise
    return invoice_payload(get_invoice(db, tenant_id, invoice.id))


@router.post("/{invoice_id}/payments/{payment_id}/reverse", response_model=SoftwareInvoiceResponse,
             dependencies=[Depends(require_permission("software_invoice.payment.reverse"))])
def reverse_invoice_payment(invoice_id: uuid.UUID, payment_id: uuid.UUID, data: SoftwareInvoicePaymentReverse,
                            current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    """Reverse a payment (bounced cheque, wrong entry). The record is kept for audit."""
    tenant_id, user_id = get_context(current_user)
    invoice = get_invoice(db, tenant_id, invoice_id, lock=True)
    if invoice.status in {"Draft", "Void"}:
        raise HTTPException(status_code=400, detail=f"Payments cannot be reversed on a {invoice.status} invoice")
    payment = next((p for p in invoice.payments if p.id == payment_id), None)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found for this invoice")
    if payment.status != "Received":
        raise HTTPException(status_code=409, detail="This payment has already been reversed")

    received_before = received_total(invoice)
    credited = credited_total(invoice)
    old_status = invoice.status
    payment.status = "Reversed"
    payment.reversed_at = datetime.utcnow()
    payment.reversed_by = user_id
    payment.reversal_reason = data.reason.strip()
    apply_settlement(db, tenant_id, invoice, received_before - money(Decimal(str(payment.amount))), credited)
    log_audit(db, tenant_id, user_id, "payment_reversed", "software_invoice", invoice.id,
              f"Reversed payment: {data.reason.strip()}",
              before_data={"amount_paid": received_before, "status": old_status},
              after_data={"payment_id": str(payment.id), "reversed_amount": payment.amount,
                          "amount_paid": received_before - money(Decimal(str(payment.amount))),
                          "status": invoice.status})
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return invoice_payload(get_invoice(db, tenant_id, invoice.id))


@router.post("/{invoice_id}/credit-notes", response_model=SoftwareInvoiceResponse, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_permission("software_invoice.credit_note.create"))])
def create_invoice_credit_note(invoice_id: uuid.UUID, data: SoftwareCreditNoteCreate,
                               current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = get_context(current_user)
    invoice = get_invoice(db, tenant_id, invoice_id, lock=True)
    if invoice.status not in {"Sent", "Partially Paid"}:
        raise HTTPException(status_code=400, detail="Credit notes can only be issued for Sent or Partially Paid invoices")
    received = received_total(invoice)
    credited_before = credited_total(invoice)
    balance = money(Decimal(str(invoice.total_amount)) - received - credited_before)
    amount = money(Decimal(data.amount))
    if amount > balance:
        raise HTTPException(status_code=400, detail=f"Credit exceeds outstanding balance of {balance}")

    number = next_unused_number(
        db, tenant_id, "CN",
        lambda candidate: db.query(SoftwareCreditNote.id).filter(
            SoftwareCreditNote.tenant_id == tenant_id, SoftwareCreditNote.credit_note_number == candidate
        ).first() is not None,
    )
    note = SoftwareCreditNote(
        tenant_id=tenant_id, invoice_id=invoice.id, created_by=user_id, credit_note_number=number,
        issue_date=date.today(), amount=amount, reason=data.reason.strip(),
    )
    db.add(note)
    old_status = invoice.status
    apply_settlement(db, tenant_id, invoice, received, credited_before + amount)
    log_audit(db, tenant_id, user_id, "credit_note_issued", "software_invoice", invoice.id,
              f"Issued credit note {number}: {data.reason.strip()}",
              before_data={"credited_amount": credited_before, "status": old_status},
              after_data={"credit_note_number": number, "amount": amount,
                          "credited_amount": credited_before + amount, "status": invoice.status})
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise
    return invoice_payload(get_invoice(db, tenant_id, invoice.id))
