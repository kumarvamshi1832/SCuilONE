from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.booking import Booking
from app.models.payment import Payment
from app.models.payment_refund import PaymentRefund
from app.models.payment_plan import PaymentPlan, PaymentPlanInstallment
from app.schemas.payment_plan import PaymentPlanCreate
from app.services.audit_service import log_audit

router = APIRouter(prefix="/api/v1/bookings/{booking_id}", tags=["Payment Plans and Collections"])
CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def tenant_user(current_user: dict):
    try:
        return UUID(str(current_user["tenant_id"])), UUID(str(current_user["user_id"]))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authenticated user context.")


def get_booking(db: Session, booking_id: UUID, tenant_id: UUID, lock: bool = False):
    query = db.query(Booking).filter(Booking.id == booking_id, Booking.tenant_id == tenant_id)
    if lock:
        query = query.with_for_update()
    booking = query.first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")
    return booking


def payment_totals(db: Session, tenant_id: UUID, booking_id: UUID):
    payments = db.query(Payment).filter(Payment.tenant_id == tenant_id, Payment.booking_id == booking_id).all()
    verified = [p for p in payments if p.status == "Verified"]
    verified_ids = [p.id for p in verified]
    refunds = db.query(PaymentRefund).filter(
        PaymentRefund.tenant_id == tenant_id,
        PaymentRefund.booking_id == booking_id,
        PaymentRefund.status == "Processed",
    ).all()
    total_verified = sum((Decimal(str(p.amount)) for p in verified), ZERO)
    total_refunds = sum((Decimal(str(r.amount)) for r in refunds), ZERO)
    pending = sum((Decimal(str(p.amount)) for p in payments if p.status == "Pending"), ZERO)
    return payments, refunds, total_verified, total_refunds, pending


def installment_snapshot(db: Session, tenant_id: UUID, installment: PaymentPlanInstallment, payments, refunds):
    installment_payments = [p for p in payments if p.installment_id == installment.id and p.status == "Verified"]
    payment_ids = {p.id for p in installment_payments}
    installment_refunds = [r for r in refunds if r.payment_id in payment_ids]
    received = sum((Decimal(str(p.amount)) for p in installment_payments), ZERO)
    refunded = sum((Decimal(str(r.amount)) for r in installment_refunds), ZERO)
    net_paid = max(ZERO, received - refunded)
    outstanding = max(ZERO, Decimal(str(installment.amount)) - net_paid)
    due_status = "Paid" if outstanding == ZERO else "Overdue" if installment.due_date < date.today() else "Partially Paid" if net_paid > ZERO else "Pending"
    return {
        "id": installment.id,
        "sequence": installment.sequence,
        "name": installment.name,
        "amount": Decimal(str(installment.amount)),
        "due_date": installment.due_date,
        "status": due_status,
        "total_verified": received,
        "total_processed_refunds": refunded,
        "net_collected": net_paid,
        "outstanding_balance": outstanding,
        "notes": installment.notes,
    }


def plan_snapshot(db: Session, tenant_id: UUID, booking: Booking, plan: PaymentPlan):
    installments = db.query(PaymentPlanInstallment).filter(
        PaymentPlanInstallment.tenant_id == tenant_id,
        PaymentPlanInstallment.payment_plan_id == plan.id,
    ).order_by(PaymentPlanInstallment.sequence.asc()).all()
    payments, refunds, _, _, _ = payment_totals(db, tenant_id, booking.id)
    rows = [installment_snapshot(db, tenant_id, item, payments, refunds) for item in installments]
    total_collected = sum((row["net_collected"] for row in rows), ZERO)
    total_outstanding = sum((row["outstanding_balance"] for row in rows), ZERO)
    return {
        "id": plan.id,
        "tenant_id": plan.tenant_id,
        "booking_id": plan.booking_id,
        "total_amount": plan.total_amount,
        "status": plan.status,
        "notes": plan.notes,
        "created_by": plan.created_by,
        "created_at": plan.created_at,
        "updated_at": plan.updated_at,
        "installments": rows,
        "total_collected": total_collected,
        "total_outstanding": total_outstanding,
    }


@router.post("/payment-plan", status_code=status.HTTP_201_CREATED)
def create_payment_plan(
    booking_id: UUID,
    payload: PaymentPlanCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("booking.payment_plan.create")),
):
    tenant_id, user_id = tenant_user(current_user)
    try:
        booking = get_booking(db, booking_id, tenant_id, lock=True)
        if booking.status not in ("Pending", "Confirmed"):
            raise HTTPException(status_code=409, detail="A payment plan can only be created for an active booking.")
        if booking.payment_preference != "Installments":
            raise HTTPException(status_code=409, detail="The buyer did not request an instalment-based payment plan for this booking.")
        if db.query(PaymentPlan).filter(
            PaymentPlan.tenant_id == tenant_id,
            PaymentPlan.booking_id == booking.id,
        ).first():
            raise HTTPException(
                status_code=409,
                detail="A payment plan already exists for this booking.",
            )

        existing_payment = db.query(Payment.id).filter(
            Payment.tenant_id == tenant_id,
            Payment.booking_id == booking.id,
            Payment.status.in_(["Pending", "Verified"]),
        ).first()

        if existing_payment:
            raise HTTPException(
                status_code=409,
                detail="A payment plan cannot be created because this booking already has pending or verified payments.",
                )
        total = sum((Decimal(str(item.amount)) for item in payload.installments), ZERO).quantize(CENT)
        agreed_price = Decimal(str(booking.agreed_price)).quantize(CENT)
        if total != agreed_price:
            raise HTTPException(status_code=422, detail=f"Payment plan total must equal the agreed price ({agreed_price}).")
        plan = PaymentPlan(tenant_id=tenant_id, booking_id=booking.id, total_amount=total, status="Active", notes=payload.notes, created_by=user_id)
        db.add(plan)
        db.flush()
        for item in sorted(payload.installments, key=lambda x: x.sequence):
            db.add(PaymentPlanInstallment(
                tenant_id=tenant_id,
                payment_plan_id=plan.id,
                sequence=item.sequence,
                name=item.name.strip(),
                amount=item.amount.quantize(CENT),
                due_date=item.due_date,
                status="Pending",
                notes=item.notes,
            ))
        log_audit(db=db, tenant_id=tenant_id, user_id=user_id, action="CREATE", module="payment_plans", record_id=plan.id,
                  description=f"Seller created payment plan for booking {booking.id} totaling {total}.",
                  after_data={"booking_id": str(booking.id), "total_amount": str(total), "installment_count": len(payload.installments)})
        db.commit()
        db.refresh(plan)
        return plan_snapshot(db, tenant_id, booking, plan)
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


@router.get("/payment-plan")
def get_payment_plan(
    booking_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("booking.payment_plan.view")),
):
    tenant_id, _ = tenant_user(current_user)
    booking = get_booking(db, booking_id, tenant_id)
    plan = db.query(PaymentPlan).filter(PaymentPlan.tenant_id == tenant_id, PaymentPlan.booking_id == booking.id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Payment plan not found for this booking.")
    return plan_snapshot(db, tenant_id, booking, plan)


@router.get("/collections")
def get_collections(
    booking_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("booking.payment.view")),
):
    tenant_id, _ = tenant_user(current_user)
    booking = get_booking(db, booking_id, tenant_id)
    payments, refunds, total_verified, total_refunds, pending = payment_totals(db, tenant_id, booking.id)
    net_collected = max(ZERO, total_verified - total_refunds)
    agreed_price = Decimal(str(booking.agreed_price))
    plan = db.query(PaymentPlan).filter(PaymentPlan.tenant_id == tenant_id, PaymentPlan.booking_id == booking.id, PaymentPlan.status == "Active").first()
    installment_rows = []
    if plan:
        installments = db.query(PaymentPlanInstallment).filter(
            PaymentPlanInstallment.tenant_id == tenant_id,
            PaymentPlanInstallment.payment_plan_id == plan.id,
        ).order_by(PaymentPlanInstallment.sequence.asc()).all()
        installment_rows = [installment_snapshot(db, tenant_id, item, payments, refunds) for item in installments]
    return {
        "booking_id": booking.id,
        "payment_preference": booking.payment_preference,
        "installment_request_notes": booking.installment_request_notes,
        "agreed_price": agreed_price,
        "total_verified": total_verified,
        "total_processed_refunds": total_refunds,
        "net_collected": net_collected,
        "outstanding_balance": max(ZERO, agreed_price - net_collected),
        "pending_payments": pending,
        "installments": installment_rows,
    }
