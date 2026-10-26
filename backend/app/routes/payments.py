
from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.booking import Booking
from app.models.payment import Payment
from app.models.payment_plan import PaymentPlan, PaymentPlanInstallment
from app.schemas.payment import (
    PaymentCreate,
    PaymentDecision,
    PaymentResponse,
)
from app.services.audit_service import log_audit


router = APIRouter(prefix="/api/v1/bookings/{booking_id}/payments", tags=["Booking Payments"])


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
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authenticated user context.",
        )


def get_booking(
    db: Session,
    booking_id: UUID,
    tenant_id: UUID,
    lock: bool = False,
):
    query = db.query(Booking).filter(
        Booking.id == booking_id,
        Booking.tenant_id == tenant_id,
    )
    if lock:
        query = query.with_for_update()

    booking = query.first()
    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found.",
        )
    return booking


def get_payment(
    db: Session,
    payment_id: UUID,
    booking_id: UUID,
    tenant_id: UUID,
    lock: bool = False,
):
    query = db.query(Payment).filter(
        Payment.id == payment_id,
        Payment.booking_id == booking_id,
        Payment.tenant_id == tenant_id,
    )
    if lock:
        query = query.with_for_update()

    payment = query.first()
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found.",
        )
    return payment


def payment_snapshot(payment: Payment) -> dict:
    return {
        "id": payment.id,
        "booking_id": payment.booking_id,
        "installment_id": payment.installment_id,
        "amount": payment.amount,
        "payment_method": payment.payment_method,
        "transaction_reference": payment.transaction_reference,
        "status": payment.status,
        "payment_date": payment.payment_date,
        "verified_by": payment.verified_by,
        "verified_at": payment.verified_at,
        "notes": payment.notes,
    }


def audit_payment(
    db: Session,
    tenant_id: UUID,
    user_id: UUID,
    action: str,
    payment: Payment,
    description: str,
    before_data=None,
):
    log_audit(
        db=db,
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        module="payments",
        record_id=payment.id,
        description=description,
        before_data=before_data,
        after_data=payment_snapshot(payment),
    )


@router.post(
    "/",
    response_model=PaymentResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_payment(
    booking_id: UUID,
    payload: PaymentCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("booking.payment.create")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    try:
        booking = get_booking(db, booking_id, tenant_id, lock=True)

        if booking.status not in ("Pending", "Confirmed"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Payments can only be recorded for active bookings.",
            )

        active_plan = db.query(PaymentPlan).filter(
            PaymentPlan.tenant_id == tenant_id,
            PaymentPlan.booking_id == booking.id,
            PaymentPlan.status == "Active",
        ).first()
        if active_plan and payload.installment_id is None:
            raise HTTPException(
                status_code=422,
                detail="Select the instalment this payment is for because this booking has an active payment plan.",
            )

        installment = None
        if payload.installment_id is not None:
            installment = (
                db.query(PaymentPlanInstallment)
                .join(PaymentPlan, PaymentPlan.id == PaymentPlanInstallment.payment_plan_id)
                .filter(
                    PaymentPlanInstallment.id == payload.installment_id,
                    PaymentPlanInstallment.tenant_id == tenant_id,
                    PaymentPlan.booking_id == booking.id,
                    PaymentPlan.tenant_id == tenant_id,
                    PaymentPlan.status == "Active",
                )
                .first()
            )
            if not installment:
                raise HTTPException(status_code=404, detail="Active payment-plan instalment not found for this booking.")

        payment_date = payload.payment_date or datetime.utcnow()

        payment = Payment(
            tenant_id=tenant_id,
            booking_id=booking.id,
            installment_id=installment.id if installment else None,
            amount=payload.amount,
            payment_method=payload.payment_method,
            transaction_reference=(
                payload.transaction_reference.strip()
                if payload.transaction_reference
                else None
            ),
            status="Pending",
            payment_date=payment_date,
            verified_by=None,
            verified_at=None,
            notes=payload.notes,
            created_by=user_id,
        )

        db.add(payment)
        db.flush()

        audit_payment(
            db,
            tenant_id,
            user_id,
            "CREATE",
            payment,
            f"Recorded payment of {payment.amount} for booking {booking.id}; awaiting verification.",
        )

        db.commit()
        db.refresh(payment)
        return payment

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


@router.get("/", response_model=list[PaymentResponse])
def list_payments(
    booking_id: UUID,
    payment_status: str | None = Query(default=None, alias="status"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("booking.payment.view")),
):
    tenant_id, _ = get_tenant_and_user(current_user)
    get_booking(db, booking_id, tenant_id)

    query = db.query(Payment).filter(
        Payment.tenant_id == tenant_id,
        Payment.booking_id == booking_id,
    )

    if payment_status:
        if payment_status not in ("Pending", "Verified", "Rejected"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid payment status filter.",
            )
        query = query.filter(Payment.status == payment_status)

    return (
        query.order_by(Payment.payment_date.desc(), Payment.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/{payment_id}", response_model=PaymentResponse)
def get_payment_details(
    booking_id: UUID,
    payment_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("booking.payment.view")),
):
    tenant_id, _ = get_tenant_and_user(current_user)
    get_booking(db, booking_id, tenant_id)
    return get_payment(db, payment_id, booking_id, tenant_id)


@router.post("/{payment_id}/decision", response_model=PaymentResponse)
def decide_payment(
    booking_id: UUID,
    payment_id: UUID,
    payload: PaymentDecision,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("booking.payment.verify")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    try:
        booking = get_booking(db, booking_id, tenant_id, lock=True)
        payment = get_payment(
            db, payment_id, booking_id, tenant_id, lock=True
        )

        if payment.status != "Pending":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only pending payments can be verified or rejected.",
            )


        if payload.status == "Verified":
            if booking.status not in ("Pending", "Confirmed"):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Payments for inactive bookings cannot be verified.",
                )

            verified_payments = (
                db.query(Payment)
                .filter(
                    Payment.tenant_id == tenant_id,
                    Payment.booking_id == booking.id,
                    Payment.status == "Verified",
                )
                .all()
            )

            from app.models.payment_refund import PaymentRefund

            processed_refunds = (
                db.query(PaymentRefund)
                .filter(
                    PaymentRefund.tenant_id == tenant_id,
                    PaymentRefund.booking_id == booking.id,
                    PaymentRefund.status == "Processed",
                )
                .all()
            )

            total_received = sum(
                (Decimal(str(item.amount)) for item in verified_payments),
                Decimal("0.00"),
            )

            total_refunded = sum(
                (Decimal(str(item.amount)) for item in processed_refunds),
                Decimal("0.00"),
            )

            net_received = total_received - total_refunded

            if net_received + Decimal(str(payment.amount)) > Decimal(
                str(booking.agreed_price)
            ):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        "Verifying this payment would exceed the remaining "
                        "agreed sale price after processed refunds."
                    ),
                )

            if payment.installment_id is not None:
                installment = (
                    db.query(PaymentPlanInstallment)
                    .join(PaymentPlan, PaymentPlan.id == PaymentPlanInstallment.payment_plan_id)
                    .filter(
                        PaymentPlanInstallment.id == payment.installment_id,
                        PaymentPlanInstallment.tenant_id == tenant_id,
                        PaymentPlan.booking_id == booking.id,
                        PaymentPlan.tenant_id == tenant_id,
                        PaymentPlan.status == "Active",
                    )
                    .with_for_update()
                    .first()
                )
                if not installment:
                    raise HTTPException(status_code=409, detail="The linked instalment is no longer active.")

                linked_verified = db.query(Payment).filter(
                    Payment.tenant_id == tenant_id,
                    Payment.booking_id == booking.id,
                    Payment.installment_id == installment.id,
                    Payment.status == "Verified",
                ).all()
                linked_ids = [item.id for item in linked_verified]
                from app.models.payment_refund import PaymentRefund
                linked_refunds = db.query(PaymentRefund).filter(
                    PaymentRefund.tenant_id == tenant_id,
                    PaymentRefund.booking_id == booking.id,
                    PaymentRefund.payment_id.in_(linked_ids) if linked_ids else PaymentRefund.payment_id == None,
                    PaymentRefund.status == "Processed",
                ).all()
                received_for_installment = sum((Decimal(str(item.amount)) for item in linked_verified), Decimal("0.00"))
                refunded_for_installment = sum((Decimal(str(item.amount)) for item in linked_refunds), Decimal("0.00"))
                remaining_for_installment = max(Decimal("0.00"), Decimal(str(installment.amount)) - received_for_installment + refunded_for_installment)
                if Decimal(str(payment.amount)) > remaining_for_installment:
                    raise HTTPException(status_code=409, detail=f"This payment exceeds the linked instalment's remaining balance of {remaining_for_installment:.2f}.")

        before_data = payment_snapshot(payment)
        payment.status = payload.status
        payment.verified_by = user_id
        payment.verified_at = datetime.utcnow()
        if payload.notes is not None:
            payment.notes = payload.notes
        payment.updated_at = datetime.utcnow()

        audit_payment(
            db,
            tenant_id,
            user_id,
            "UPDATE",
            payment,
            f"Payment {payload.status.lower()} for booking {booking.id}.",
            before_data=before_data,
        )

        db.commit()
        db.refresh(payment)
        return payment

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
