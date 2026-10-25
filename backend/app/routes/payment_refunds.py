
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
from app.models.payment_refund import PaymentRefund
from app.schemas.payment_refund import (
    PaymentRefundCreate,
    PaymentRefundDecision,
    PaymentRefundManualConfirmation,
    PaymentRefundResponse,
)
from app.services.audit_service import log_audit


router = APIRouter(
    prefix="/api/v1/bookings/{booking_id}/payments/{payment_id}/refunds",
    tags=["Payment Refunds"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_tenant_and_user(current_user: dict):
    try:
        return UUID(str(current_user["tenant_id"])), UUID(
            str(current_user["user_id"])
        )
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


def get_refund(
    db: Session,
    refund_id: UUID,
    booking_id: UUID,
    payment_id: UUID,
    tenant_id: UUID,
    lock: bool = False,
):
    query = db.query(PaymentRefund).filter(
        PaymentRefund.id == refund_id,
        PaymentRefund.tenant_id == tenant_id,
        PaymentRefund.booking_id == booking_id,
        PaymentRefund.payment_id == payment_id,
    )
    if lock:
        query = query.with_for_update()

    refund = query.first()
    if not refund:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Refund request not found.",
        )
    return refund


def refund_snapshot(refund: PaymentRefund) -> dict:
    return {
        "id": refund.id,
        "booking_id": refund.booking_id,
        "payment_id": refund.payment_id,
        "amount": refund.amount,
        "reason": refund.reason,
        "status": refund.status,
        "external_reference": refund.external_reference,
        "notes": refund.notes,
        "created_by": refund.created_by,
        "processed_by": refund.processed_by,
        "processed_at": refund.processed_at,
    }


def audit_refund(
    db: Session,
    tenant_id: UUID,
    user_id: UUID,
    action: str,
    refund: PaymentRefund,
    description: str,
    before_data=None,
):
    log_audit(
        db=db,
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        module="payment_refunds",
        record_id=refund.id,
        description=description,
        before_data=before_data,
        after_data=refund_snapshot(refund),
    )


def refundable_balance(
    db: Session,
    payment: Payment,
    tenant_id: UUID,
    exclude_refund_id: UUID | None = None,
) -> Decimal:
    query = db.query(PaymentRefund).filter(
        PaymentRefund.tenant_id == tenant_id,
        PaymentRefund.booking_id == payment.booking_id,
        PaymentRefund.payment_id == payment.id,
        PaymentRefund.status.in_(("Pending", "Processed")),
    )

    if exclude_refund_id:
        query = query.filter(PaymentRefund.id != exclude_refund_id)

    reserved = sum(
        (Decimal(str(item.amount)) for item in query.all()),
        Decimal("0.00"),
    )
    return Decimal(str(payment.amount)) - reserved


def booking_refundable_balance(
    db: Session,
    booking: Booking,
    tenant_id: UUID,
    exclude_refund_id: UUID | None = None,
) -> Decimal:
    verified_payments = (
        db.query(Payment)
        .filter(
            Payment.tenant_id == tenant_id,
            Payment.booking_id == booking.id,
            Payment.status == "Verified",
        )
        .with_for_update()
        .all()
    )

    received = sum(
        (Decimal(str(item.amount)) for item in verified_payments),
        Decimal("0.00"),
    )

    query = db.query(PaymentRefund).filter(
        PaymentRefund.tenant_id == tenant_id,
        PaymentRefund.booking_id == booking.id,
        PaymentRefund.status.in_(("Pending", "Processed")),
    )

    if exclude_refund_id:
        query = query.filter(PaymentRefund.id != exclude_refund_id)

    reserved = sum(
        (Decimal(str(item.amount)) for item in query.all()),
        Decimal("0.00"),
    )

    return received - reserved


def validate_refund_processing(
    db: Session,
    booking: Booking,
    payment: Payment,
    refund: PaymentRefund,
    tenant_id: UUID,
):
    if payment.status != "Verified":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Only verified payments can be refunded.",
        )

    payment_balance = refundable_balance(
        db,
        payment,
        tenant_id,
        exclude_refund_id=refund.id,
    )

    if refund.amount > payment_balance:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Processing this refund would exceed the remaining "
                f"payment refundable balance of {payment_balance:.2f}."
            ),
        )

    booking_balance = booking_refundable_balance(
        db,
        booking,
        tenant_id,
        exclude_refund_id=refund.id,
    )

    if refund.amount > booking_balance:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Processing this refund would exceed the booking "
                f"remaining refundable balance of {booking_balance:.2f}."
            ),
        )

    verified_total = sum(
        (
            Decimal(str(item.amount))
            for item in db.query(Payment)
            .filter(
                Payment.tenant_id == tenant_id,
                Payment.booking_id == booking.id,
                Payment.status == "Verified",
            )
            .all()
        ),
        Decimal("0.00"),
    )

    current_refund_total = Decimal(
        str(booking.refund_amount or 0)
    )
    new_refund_total = current_refund_total + Decimal(
        str(refund.amount)
    )

    if new_refund_total > verified_total:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The booking refund total cannot exceed "
                "verified payments received."
            ),
        )

    return new_refund_total


@router.post(
    "/",
    response_model=PaymentRefundResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_refund(
    booking_id: UUID,
    payment_id: UUID,
    payload: PaymentRefundCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("booking.refund.manage")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    try:
        booking = get_booking(db, booking_id, tenant_id, lock=True)
        payment = get_payment(
            db, payment_id, booking_id, tenant_id, lock=True
        )

        if payment.status != "Verified":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Refunds can only be requested for verified payments.",
            )

        amount = payload.amount.quantize(Decimal("0.01"))

        if amount <= 0:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Refund amount must be greater than zero.",
            )

        balance = refundable_balance(db, payment, tenant_id)

        if amount > balance:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Refund exceeds the remaining refundable balance "
                    f"of {balance:.2f}."
                ),
            )

        booking_balance = booking_refundable_balance(
            db, booking, tenant_id
        )

        if amount > booking_balance:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Refund exceeds the booking remaining refundable "
                    f"balance of {booking_balance:.2f}."
                ),
            )

        refund = PaymentRefund(
            tenant_id=tenant_id,
            booking_id=booking.id,
            payment_id=payment.id,
            amount=amount,
            reason=payload.reason.strip(),
            status="Pending",
            created_by=user_id,
        )

        db.add(refund)
        db.flush()

        audit_refund(
            db,
            tenant_id,
            user_id,
            "CREATE",
            refund,
            f"Refund request for {amount:.2f} created for payment {payment.id}.",
        )

        db.commit()
        db.refresh(refund)
        return refund

    except Exception:
        db.rollback()
        raise


@router.get("/", response_model=list[PaymentRefundResponse])
def list_refunds(
    booking_id: UUID,
    payment_id: UUID,
    refund_status: str | None = Query(default=None, alias="status"),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("booking.refund.manage")),
):
    tenant_id, _ = get_tenant_and_user(current_user)

    get_booking(db, booking_id, tenant_id)
    get_payment(db, payment_id, booking_id, tenant_id)

    query = db.query(PaymentRefund).filter(
        PaymentRefund.tenant_id == tenant_id,
        PaymentRefund.booking_id == booking_id,
        PaymentRefund.payment_id == payment_id,
    )

    if refund_status:
        if refund_status not in ("Pending", "Processed", "Rejected"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid refund status filter.",
            )
        query = query.filter(PaymentRefund.status == refund_status)

    return (
        query.order_by(PaymentRefund.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.patch(
    "/{refund_id}",
    response_model=PaymentRefundResponse,
)
def decide_refund(
    booking_id: UUID,
    payment_id: UUID,
    refund_id: UUID,
    payload: PaymentRefundDecision,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("booking.refund.manage")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    try:
        get_booking(db, booking_id, tenant_id, lock=True)
        get_payment(db, payment_id, booking_id, tenant_id, lock=True)

        refund = get_refund(
            db,
            refund_id,
            booking_id,
            payment_id,
            tenant_id,
            lock=True,
        )

        if refund.status != "Pending":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only pending refund requests can be rejected.",
            )

        before_data = refund_snapshot(refund)

        refund.status = "Rejected"

        if payload.external_reference is not None:
            refund.external_reference = (
                payload.external_reference.strip() or None
            )

        if payload.notes is not None:
            refund.notes = payload.notes.strip() or None

        refund.processed_by = None
        refund.processed_at = None
        refund.updated_at = datetime.utcnow()

        audit_refund(
            db,
            tenant_id,
            user_id,
            "UPDATE",
            refund,
            f"Refund request {refund.id} rejected. No money was returned by this action.",
            before_data=before_data,
        )

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="UPDATE",
            module="bookings",
            record_id=refund.booking_id,
            description=(
                f"Refund request {refund.id} rejected; "
                "booking refund total unchanged."
            ),
        )

        db.commit()
        db.refresh(refund)
        return refund

    except Exception:
        db.rollback()
        raise


@router.post(
    "/{refund_id}/confirm",
    response_model=PaymentRefundResponse,
)
def confirm_manual_refund(
    booking_id: UUID,
    payment_id: UUID,
    refund_id: UUID,
    payload: PaymentRefundManualConfirmation,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("booking.refund.manage")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    try:
        booking = get_booking(db, booking_id, tenant_id, lock=True)
        payment = get_payment(
            db, payment_id, booking_id, tenant_id, lock=True
        )

        refund = get_refund(
            db,
            refund_id,
            booking_id,
            payment_id,
            tenant_id,
            lock=True,
        )

        if refund.status != "Pending":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only pending refund requests can be confirmed.",
            )

        external_reference = payload.external_reference.strip()
        notes = payload.notes.strip()

        if not external_reference:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="A bank transfer or receipt reference is required.",
            )

        if not notes:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Confirmation notes are required.",
            )

        new_refund_total = validate_refund_processing(
            db,
            booking,
            payment,
            refund,
            tenant_id,
        )

        before_refund = refund_snapshot(refund)
        before_booking_total = str(booking.refund_amount or 0)

        now = datetime.utcnow()

        refund.status = "Processed"
        refund.external_reference = external_reference
        refund.notes = notes
        refund.processed_by = user_id
        refund.processed_at = now
        refund.updated_at = now

        booking.refund_amount = new_refund_total

        audit_refund(
            db,
            tenant_id,
            user_id,
            "UPDATE",
            refund,
            (
                f"Manual refund of {refund.amount:.2f} confirmed as returned. "
                f"Reference: {external_reference}."
            ),
            before_data=before_refund,
        )

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="UPDATE",
            module="bookings",
            record_id=booking.id,
            description=(
                f"Booking refund total changed from {before_booking_total} "
                f"to {new_refund_total:.2f} after manual refund confirmation."
            ),
            before_data={"refund_amount": before_booking_total},
            after_data={"refund_amount": str(new_refund_total)},
        )

        db.commit()
        db.refresh(refund)
        return refund

    except Exception:
        db.rollback()
        raise
