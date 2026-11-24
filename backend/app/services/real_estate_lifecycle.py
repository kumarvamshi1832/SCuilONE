"""Shared Real Estate Lifecycle Service.

Centralizes property reservation/hold locking, idempotent hold expiry for Sale/Rent/Lease,
open-ended rental schedule extension, rental arrears (including late fees), and shared
offer-acceptance governance so staff routes, customer portal routes, and background workers
enforce one consistent set of business rules.
"""
from __future__ import annotations

import calendar
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.connection import settings
from app.models.booking import Booking
from app.models.buyer_requirement import BuyerRequirement
from app.models.customer_booking_journey import CustomerBookingRequest
from app.models.lead import Lead
from app.models.notification import Notification
from app.models.payment import Payment
from app.models.payment_plan import PaymentPlan
from app.models.payment_refund import PaymentRefund
from app.models.property import Property
from app.models.property_match import PropertyMatch
from app.models.property_offer import PropertyOffer
from app.models.rental import (
    RentalAgreement,
    RentalBookingRequest,
    RentalPayment,
    RentalPaymentSchedule,
)
from app.models.user import User
from app.services.audit_service import log_audit
from app.services.payment_allocation import IN_FLIGHT_STATUSES
from app.services.rental_calculations import ZERO, add_months, money, period_months

ACTIVE_SALE_BOOKING_STATUSES = ("Pending", "Confirmed", "Expired - Payment Review")
ACTIVE_PORTAL_REQUEST_STATUSES = ("Requested", "Approved", "Expired - Payment Review")
ACTIVE_RENTAL_REQUEST_STATUSES = ("Requested", "Approved", "Agreement Created", "Expired - Payment Review")
ACTIVE_RENTAL_AGREEMENT_STATUSES = ("Draft", "Pending Signature", "Active", "Termination Requested")
LIVE_OCCUPIED_RENTAL_STATUSES = ("Active", "Termination Requested", "Expired")


def utcnow() -> datetime:
    """Return timezone-normalized naive UTC datetime consistent with SQLAlchemy DateTime columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def ensure_utc_naive(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def get_setting_int(name: str, default: int) -> int:
    value = getattr(settings, name, default)
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return default


def sale_booking_net_verified(db: Session, tenant_id: UUID, booking_id: UUID) -> Decimal:
    verified = (
        db.query(Payment)
        .filter(
            Payment.tenant_id == tenant_id,
            Payment.booking_id == booking_id,
            Payment.status == "Verified",
        )
        .all()
    )
    gross = sum((money(p.amount) for p in verified), ZERO)
    verified_ids = [p.id for p in verified]
    refunds_q = db.query(PaymentRefund).filter(
        PaymentRefund.tenant_id == tenant_id,
        PaymentRefund.booking_id == booking_id,
        PaymentRefund.status == "Processed",
    )
    if verified_ids:
        refunds_q = refunds_q.filter(PaymentRefund.payment_id.in_(verified_ids))
    else:
        refunds_q = refunds_q.filter(PaymentRefund.payment_id.is_(None))
    refunded = sum((money(r.amount) for r in refunds_q.all()), ZERO)
    return max(ZERO, money(gross - refunded))


def rental_agreement_verified_payments(db: Session, tenant_id: UUID, agreement_id: UUID) -> Decimal:
    total = (
        db.query(func.coalesce(func.sum(RentalPayment.amount), 0))
        .filter(
            RentalPayment.tenant_id == tenant_id,
            RentalPayment.agreement_id == agreement_id,
            RentalPayment.status == "Verified",
        )
        .scalar()
    )
    return money(total)


def _release_property_if_uncommitted(
    db: Session,
    tenant_id: UUID,
    property_id: UUID,
    *,
    now: datetime,
    exclude_booking_id: UUID | None = None,
    exclude_portal_request_id: UUID | None = None,
    exclude_rental_request_id: UUID | None = None,
) -> bool:
    prop = (
        db.query(Property)
        .filter(Property.id == property_id, Property.tenant_id == tenant_id)
        .with_for_update()
        .first()
    )
    if not prop or prop.status != "Reserved":
        return False
    if has_conflicting_property_commitment(
        db,
        tenant_id,
        property_id,
        now=now,
        exclude_booking_id=exclude_booking_id,
        exclude_portal_request_id=exclude_portal_request_id,
        exclude_rental_request_id=exclude_rental_request_id,
    ):
        return False
    prop.status = "Available"
    prop.offer_hold_expires_at = None
    prop.updated_at = now
    from app.services.agency_collaboration import broadcast_property_availability_change
    broadcast_property_availability_change(
        db=db,
        company_tenant_id=tenant_id,
        property_id=property_id,
        event_type="property_released",
        title=f"Property '{prop.name}' is Available again",
        message=f"Central availability for '{prop.name}' returned to Available after hold release/expiry.",
        idempotency_prefix=f"prop_rel:{property_id}:{int(now.timestamp())}",
    )
    return True


def has_conflicting_property_commitment(
    db: Session,
    tenant_id: UUID,
    property_id: UUID,
    *,
    now: datetime | None = None,
    exclude_booking_id: UUID | None = None,
    exclude_portal_request_id: UUID | None = None,
    exclude_rental_request_id: UUID | None = None,
    exclude_agreement_id: UUID | None = None,
    exclude_offer_id: UUID | None = None,
) -> bool:
    """Return True if any active Sale, Rent, or Lease commitment holds this property."""
    now = now or utcnow()

    booking_q = db.query(Booking.id).filter(
        Booking.tenant_id == tenant_id,
        Booking.property_id == property_id,
        Booking.status.in_(ACTIVE_SALE_BOOKING_STATUSES),
    )
    if exclude_booking_id:
        booking_q = booking_q.filter(Booking.id != exclude_booking_id)
    if booking_q.first():
        return True

    portal_q = db.query(CustomerBookingRequest.id).filter(
        CustomerBookingRequest.tenant_id == tenant_id,
        CustomerBookingRequest.property_id == property_id,
        CustomerBookingRequest.status.in_(ACTIVE_PORTAL_REQUEST_STATUSES),
    )
    if exclude_portal_request_id:
        portal_q = portal_q.filter(CustomerBookingRequest.id != exclude_portal_request_id)
    if portal_q.first():
        return True

    rental_req_q = db.query(RentalBookingRequest.id).filter(
        RentalBookingRequest.tenant_id == tenant_id,
        RentalBookingRequest.property_id == property_id,
        RentalBookingRequest.status.in_(ACTIVE_RENTAL_REQUEST_STATUSES),
    )
    if exclude_rental_request_id:
        rental_req_q = rental_req_q.filter(RentalBookingRequest.id != exclude_rental_request_id)
    if rental_req_q.first():
        return True

    agreement_q = db.query(RentalAgreement.id).filter(
        RentalAgreement.tenant_id == tenant_id,
        RentalAgreement.property_id == property_id,
        RentalAgreement.status.in_(LIVE_OCCUPIED_RENTAL_STATUSES),
    )
    if exclude_agreement_id:
        agreement_q = agreement_q.filter(RentalAgreement.id != exclude_agreement_id)
    if agreement_q.first():
        return True

    offer_q = (
        db.query(PropertyOffer.id)
        .join(PropertyMatch, PropertyMatch.id == PropertyOffer.property_match_id)
        .filter(
            PropertyOffer.tenant_id == tenant_id,
            PropertyMatch.tenant_id == tenant_id,
            PropertyMatch.property_id == property_id,
            PropertyOffer.status.in_(("Accepted", "Pending Owner Approval")),
            PropertyOffer.hold_expires_at.is_not(None),
            PropertyOffer.hold_expires_at > now,
        )
    )
    if exclude_offer_id:
        offer_q = offer_q.filter(PropertyOffer.id != exclude_offer_id)
    if offer_q.first():
        return True

    return False


# ---------------------------------------------------------------------------
# Problem 1: Walk-in Sale Booking Hold Expiry
# ---------------------------------------------------------------------------

def expire_single_walkin_sale_booking(
    db: Session,
    booking: Booking,
    *,
    now: datetime | None = None,
) -> bool:
    """Idempotently expire a Pending walk-in Sale booking whose hold_expires_at has elapsed.

    Returns True if a state transition occurred, False if already handled or not eligible.
    """
    now = now or utcnow()
    if booking.status != "Pending" or booking.hold_expires_at is None or booking.hold_expires_at > now:
        return False

    # If a portal CustomerBookingRequest owns this booking, let portal expiry handle both consistently.
    linked_portal = (
        db.query(CustomerBookingRequest)
        .filter(
            CustomerBookingRequest.tenant_id == booking.tenant_id,
            CustomerBookingRequest.booking_id == booking.id,
        )
        .with_for_update()
        .first()
    )
    if linked_portal is not None:
        return expire_single_customer_booking_request(db, linked_portal, now=now)

    net_verified = sale_booking_net_verified(db, booking.tenant_id, booking.id)
    before_status = booking.status

    if net_verified > ZERO:
        booking.status = "Expired - Payment Review"
        booking.expired_at = now
        booking.hold_expires_at = None
        booking.updated_at = now
        log_audit(
            db,
            booking.tenant_id,
            None,
            "AUTO_EXPIRE",
            "bookings",
            booking.id,
            f"Walk-in booking hold expired with verified funds ({net_verified:.2f}) remaining; property retained for manual payment review.",
            before_data={"status": before_status},
            after_data={"status": booking.status, "net_verified": str(net_verified)},
        )
        if booking.created_by:
            recipient = (
                db.query(User)
                .filter(User.id == booking.created_by, User.tenant_id == booking.tenant_id, User.status == "Active")
                .first()
            )
            if recipient:
                db.add(
                    Notification(
                        tenant_id=booking.tenant_id,
                        recipient_user_id=recipient.id,
                        workflow_id=None,
                        title="Walk-in booking hold expired — payment review required",
                        message=f"Booking {booking.id} hold expired while verified funds ({net_verified:.2f}) remain. Review manually before releasing the property.",
                        notification_type="walkin_booking_hold_expired",
                        related_module="bookings",
                        related_record_id=booking.id,
                        is_read=False,
                    )
                )
        db.flush()
        return True

    booking.status = "Expired"
    booking.expired_at = now
    booking.hold_expires_at = None
    booking.cancellation_reason = booking.cancellation_reason or "Walk-in booking hold expired without verified payment."
    booking.updated_at = now

    active_plan = (
        db.query(PaymentPlan)
        .filter(
            PaymentPlan.tenant_id == booking.tenant_id,
            PaymentPlan.booking_id == booking.id,
            PaymentPlan.status == "Active",
        )
        .with_for_update()
        .first()
    )
    if active_plan:
        active_plan.status = "Cancelled"
        active_plan.updated_at = now

    pending_payments = (
        db.query(Payment)
        .filter(
            Payment.tenant_id == booking.tenant_id,
            Payment.booking_id == booking.id,
            Payment.status.in_(IN_FLIGHT_STATUSES),
        )
        .with_for_update()
        .all()
    )
    for payment in pending_payments:
        payment.status = "Rejected"
        payment.notes = ((payment.notes or "") + "\nAutomatically rejected because the walk-in booking hold expired without verified funds.").strip()

    released = _release_property_if_uncommitted(
        db,
        booking.tenant_id,
        booking.property_id,
        now=now,
        exclude_booking_id=booking.id,
    )
    log_audit(
        db,
        booking.tenant_id,
        None,
        "AUTO_EXPIRE",
        "bookings",
        booking.id,
        "Walk-in Sale booking hold expired and property released." if released else "Walk-in Sale booking hold expired.",
        before_data={"status": before_status},
        after_data={"status": booking.status, "property_released": released},
    )
    if booking.created_by:
        recipient = (
            db.query(User)
            .filter(User.id == booking.created_by, User.tenant_id == booking.tenant_id, User.status == "Active")
            .first()
        )
        if recipient:
            db.add(
                Notification(
                    tenant_id=booking.tenant_id,
                    recipient_user_id=recipient.id,
                    workflow_id=None,
                    title="Walk-in booking hold expired",
                    message=f"Booking {booking.id} expired without verified payment and the property hold was released.",
                    notification_type="walkin_booking_hold_expired",
                    related_module="bookings",
                    related_record_id=booking.id,
                    is_read=False,
                )
            )
    db.flush()
    return True


def expire_walkin_sale_bookings(db: Session, *, now: datetime | None = None, batch_size: int = 200) -> dict:
    now = now or utcnow()
    expired = 0
    payment_review = 0
    while True:
        rows = (
            db.query(Booking)
            .filter(
                Booking.status == "Pending",
                Booking.hold_expires_at.is_not(None),
                Booking.hold_expires_at <= now,
            )
            .order_by(Booking.hold_expires_at.asc())
            .limit(batch_size)
            .with_for_update(skip_locked=True)
            .all()
        )
        if not rows:
            break
        progressed = False
        for booking in rows:
            if expire_single_walkin_sale_booking(db, booking, now=now):
                progressed = True
                if booking.status == "Expired - Payment Review":
                    payment_review += 1
                else:
                    expired += 1
        db.commit()
        if not progressed:
            break
    return {"expired_walkin_bookings": expired, "payment_review_required": payment_review}


# ---------------------------------------------------------------------------
# Problem 2: Portal Sale Booking Request Hold Expiry (Requested + Approved)
# ---------------------------------------------------------------------------

def expire_single_customer_booking_request(
    db: Session,
    row: CustomerBookingRequest,
    *,
    now: datetime | None = None,
) -> bool:
    """Idempotently expire a Portal Sale booking request in 'Requested' or 'Approved' status."""
    now = now or utcnow()
    if row.status not in ("Requested", "Approved") or row.hold_expires_at is None or row.hold_expires_at > now:
        return False

    before_status = row.status
    payment_review_required = False
    booking = None
    if row.booking_id:
        booking = (
            db.query(Booking)
            .filter(Booking.id == row.booking_id, Booking.tenant_id == row.tenant_id)
            .with_for_update()
            .first()
        )

    if booking and booking.status == "Pending":
        net_verified = sale_booking_net_verified(db, row.tenant_id, booking.id)
        if net_verified > ZERO:
            payment_review_required = True
            booking.status = "Expired - Payment Review"
            booking.expired_at = now
            booking.hold_expires_at = None
            booking.updated_at = now
        else:
            booking_before = booking.status
            booking.status = "Expired"
            booking.expired_at = now
            booking.hold_expires_at = None
            booking.cancellation_reason = "Customer booking hold expired before final confirmation."
            booking.updated_at = now
            active_plan = (
                db.query(PaymentPlan)
                .filter(
                    PaymentPlan.tenant_id == row.tenant_id,
                    PaymentPlan.booking_id == booking.id,
                    PaymentPlan.status == "Active",
                )
                .with_for_update()
                .first()
            )
            if active_plan:
                active_plan.status = "Cancelled"
                active_plan.updated_at = now
            pending_payments = (
                db.query(Payment)
                .filter(
                    Payment.tenant_id == row.tenant_id,
                    Payment.booking_id == booking.id,
                    Payment.status.in_(IN_FLIGHT_STATUSES),
                )
                .with_for_update()
                .all()
            )
            for payment in pending_payments:
                payment.status = "Rejected"
                payment.notes = ((payment.notes or "") + "\nAutomatically rejected because the booking hold expired without verified funds.").strip()
            log_audit(
                db,
                row.tenant_id,
                None,
                "AUTO_EXPIRE",
                "bookings",
                booking.id,
                "Pending booking expired and property released after customer hold expired.",
                before_data={"status": booking_before},
                after_data={"status": booking.status},
            )

    row.status = "Expired - Payment Review" if payment_review_required else "Expired"
    row.hold_expires_at = None
    row.updated_at = now

    released = False
    if not payment_review_required:
        released = _release_property_if_uncommitted(
            db,
            row.tenant_id,
            row.property_id,
            now=now,
            exclude_booking_id=booking.id if booking else None,
            exclude_portal_request_id=row.id,
        )

    match = (
        db.query(PropertyMatch)
        .filter(PropertyMatch.id == row.property_match_id, PropertyMatch.tenant_id == row.tenant_id)
        .first()
    )
    recipient_id = match.assigned_to if match else None
    if recipient_id:
        recipient = (
            db.query(User)
            .filter(User.id == recipient_id, User.tenant_id == row.tenant_id, User.status == "Active")
            .first()
        )
        if recipient:
            db.add(
                Notification(
                    tenant_id=row.tenant_id,
                    recipient_user_id=recipient.id,
                    workflow_id=None,
                    title="Customer booking hold expired",
                    message=(
                        f"The booking hold for property {row.property_id} expired. Staff review is required because verified funds remain."
                        if payment_review_required
                        else f"The booking hold for property {row.property_id} expired and the property reservation was released."
                    ),
                    notification_type="customer_booking_hold_expired",
                    related_module="customer_booking_requests",
                    related_record_id=row.id,
                    is_read=False,
                )
            )

    log_audit(
        db,
        row.tenant_id,
        None,
        "AUTO_EXPIRE",
        "customer_booking_requests",
        row.id,
        "Customer booking request hold expired with verified funds remaining; property retained for manual review."
        if payment_review_required
        else "Customer booking request hold expired and property released.",
        before_data={"status": before_status},
        after_data={"status": row.status, "property_released": released},
    )
    db.flush()
    return True


def expire_customer_booking_requests(db: Session, *, now: datetime | None = None, batch_size: int = 200) -> dict:
    now = now or utcnow()
    expired = 0
    while True:
        rows = (
            db.query(CustomerBookingRequest)
            .filter(
                CustomerBookingRequest.status.in_(("Requested", "Approved")),
                CustomerBookingRequest.hold_expires_at.is_not(None),
                CustomerBookingRequest.hold_expires_at <= now,
            )
            .order_by(CustomerBookingRequest.hold_expires_at.asc())
            .limit(batch_size)
            .with_for_update(skip_locked=True)
            .all()
        )
        if not rows:
            break
        for row in rows:
            if expire_single_customer_booking_request(db, row, now=now):
                expired += 1
        db.commit()
    return {"expired_holds": expired}


# ---------------------------------------------------------------------------
# Problem 9: Rent & Lease Booking Request Hold Expiry
# ---------------------------------------------------------------------------

def expire_single_rental_booking_request(
    db: Session,
    row: RentalBookingRequest,
    *,
    now: datetime | None = None,
) -> bool:
    """Idempotently expire a Rent/Lease booking request hold safely without discarding verified funds."""
    now = now or utcnow()
    if (
        row.status not in ("Requested", "Approved", "Agreement Created")
        or row.hold_expires_at is None
        or row.hold_expires_at > now
    ):
        return False

    before_status = row.status
    agreement = None
    verified_total = ZERO
    if row.rental_agreement_id:
        agreement = (
            db.query(RentalAgreement)
            .filter(RentalAgreement.id == row.rental_agreement_id, RentalAgreement.tenant_id == row.tenant_id)
            .with_for_update()
            .first()
        )
        if agreement:
            if agreement.status in ("Active", "Termination Requested", "Completed"):
                # Already activated — clear stale hold timestamp without expiring.
                row.status = "Activated"
                row.hold_expires_at = None
                row.updated_at = now
                db.flush()
                return True
            verified_total = rental_agreement_verified_payments(db, row.tenant_id, agreement.id)

    if verified_total > ZERO:
        row.status = "Expired - Payment Review"
        row.expired_at = now
        row.hold_expires_at = None
        row.updated_at = now
        log_audit(
            db,
            row.tenant_id,
            None,
            "AUTO_EXPIRE",
            "rental_booking_requests",
            row.id,
            f"{row.booking_type} booking hold expired with verified payments ({verified_total:.2f}); manual review required.",
            before_data={"status": before_status},
            after_data={"status": row.status, "verified_payments": str(verified_total)},
        )
        db.flush()
        return True

    if agreement and agreement.status in ("Draft", "Pending Signature"):
        agreement.status = "Cancelled"
        agreement.notes = ((agreement.notes or "") + "\nAutomatically cancelled because the booking hold expired.").strip()
        agreement.updated_at = now
        pending_payments = (
            db.query(RentalPayment)
            .filter(
                RentalPayment.tenant_id == row.tenant_id,
                RentalPayment.agreement_id == agreement.id,
                RentalPayment.status.in_(("Pending", "Under Verification")),
            )
            .with_for_update()
            .all()
        )
        for p in pending_payments:
            p.status = "Rejected"
            p.notes = ((p.notes or "") + "\nAutomatically rejected because the rental booking hold expired.").strip()

    row.status = "Expired"
    row.expired_at = now
    row.hold_expires_at = None
    row.updated_at = now

    released = _release_property_if_uncommitted(
        db,
        row.tenant_id,
        row.property_id,
        now=now,
        exclude_rental_request_id=row.id,
    )
    log_audit(
        db,
        row.tenant_id,
        None,
        "AUTO_EXPIRE",
        "rental_booking_requests",
        row.id,
        f"{row.booking_type} booking request hold expired" + (" and property released." if released else "."),
        before_data={"status": before_status},
        after_data={"status": row.status, "property_released": released},
    )
    db.flush()
    return True


def expire_rental_booking_requests(db: Session, *, now: datetime | None = None, batch_size: int = 200) -> dict:
    now = now or utcnow()
    expired = 0
    payment_review = 0
    while True:
        rows = (
            db.query(RentalBookingRequest)
            .filter(
                RentalBookingRequest.status.in_(("Requested", "Approved", "Agreement Created")),
                RentalBookingRequest.hold_expires_at.is_not(None),
                RentalBookingRequest.hold_expires_at <= now,
            )
            .order_by(RentalBookingRequest.hold_expires_at.asc())
            .limit(batch_size)
            .with_for_update(skip_locked=True)
            .all()
        )
        if not rows:
            break
        for row in rows:
            if expire_single_rental_booking_request(db, row, now=now):
                if row.status == "Expired - Payment Review":
                    payment_review += 1
                elif row.status == "Expired":
                    expired += 1
        db.commit()
    return {"expired_rental_booking_holds": expired, "payment_review_required": payment_review}


def release_expired_holds_for_property(db: Session, tenant_id: UUID, property_id: UUID, *, now: datetime | None = None) -> None:
    """Lazily expire any elapsed holds on a single locked property before evaluating availability."""
    now = now or utcnow()
    for req in (
        db.query(CustomerBookingRequest)
        .filter(
            CustomerBookingRequest.tenant_id == tenant_id,
            CustomerBookingRequest.property_id == property_id,
            CustomerBookingRequest.status.in_(("Requested", "Approved")),
            CustomerBookingRequest.hold_expires_at.is_not(None),
            CustomerBookingRequest.hold_expires_at <= now,
        )
        .with_for_update()
        .all()
    ):
        expire_single_customer_booking_request(db, req, now=now)

    for booking in (
        db.query(Booking)
        .filter(
            Booking.tenant_id == tenant_id,
            Booking.property_id == property_id,
            Booking.status == "Pending",
            Booking.hold_expires_at.is_not(None),
            Booking.hold_expires_at <= now,
        )
        .with_for_update()
        .all()
    ):
        expire_single_walkin_sale_booking(db, booking, now=now)

    for rreq in (
        db.query(RentalBookingRequest)
        .filter(
            RentalBookingRequest.tenant_id == tenant_id,
            RentalBookingRequest.property_id == property_id,
            RentalBookingRequest.status.in_(("Requested", "Approved", "Agreement Created")),
            RentalBookingRequest.hold_expires_at.is_not(None),
            RentalBookingRequest.hold_expires_at <= now,
        )
        .with_for_update()
        .all()
    ):
        expire_single_rental_booking_request(db, rreq, now=now)

    prop = (
        db.query(Property)
        .filter(Property.id == property_id, Property.tenant_id == tenant_id)
        .with_for_update()
        .first()
    )
    if prop and prop.status == "Reserved" and prop.offer_hold_expires_at is not None and prop.offer_hold_expires_at <= now:
        prop.offer_hold_expires_at = None
        if not has_conflicting_property_commitment(db, tenant_id, property_id, now=now):
            prop.status = "Available"
            prop.updated_at = now
            db.flush()


# ---------------------------------------------------------------------------
# Problem 13: Open-Ended Rental Schedule Rolling Extension
# ---------------------------------------------------------------------------

def generate_rental_schedule_rows(
    db: Session,
    agreement: RentalAgreement,
    through_date: date,
    start_from: date | None = None,
) -> int:
    """Generate recurring rent and maintenance charges without duplicating or altering historical periods."""
    existing = (
        db.query(RentalPaymentSchedule)
        .filter(
            RentalPaymentSchedule.tenant_id == agreement.tenant_id,
            RentalPaymentSchedule.agreement_id == agreement.id,
        )
        .all()
    )
    existing_keys = {(x.charge_type, x.period_start, x.period_end) for x in existing}
    sequence = max((x.sequence for x in existing), default=0)
    base_start = start_from or agreement.agreement_start
    created = 0

    charge_specs = [("Rent", money(agreement.rent_amount), agreement.rent_frequency)]
    if money(agreement.maintenance_amount) > ZERO:
        charge_specs.append(("Maintenance", money(agreement.maintenance_amount), agreement.maintenance_frequency))

    for charge_type, base_amount, frequency in charge_specs:
        step = period_months(frequency)
        cursor = base_start
        while cursor <= through_date:
            next_start = add_months(cursor, step)
            period_end = next_start - timedelta(days=1)
            if agreement.agreement_end and period_end > agreement.agreement_end:
                period_end = agreement.agreement_end
            if period_end < cursor:
                break
            key = (charge_type, cursor, period_end)
            if key not in existing_keys:
                sequence += 1
                amount = base_amount
                if (
                    charge_type == "Rent"
                    and agreement.escalation_percentage is not None
                    and agreement.escalation_interval_months
                ):
                    escalation_anchor = agreement.escalation_base_date or agreement.agreement_start
                    months_elapsed = max(
                        0,
                        (cursor.year - escalation_anchor.year) * 12 + cursor.month - escalation_anchor.month,
                    )
                    escalations = months_elapsed // agreement.escalation_interval_months
                    for _ in range(escalations):
                        amount = money(
                            amount * (Decimal("1") + money(agreement.escalation_percentage) / Decimal("100"))
                        )
                due_day = min(agreement.due_day, calendar.monthrange(cursor.year, cursor.month)[1])
                due = date(cursor.year, cursor.month, due_day)
                if due < cursor:
                    due = cursor
                db.add(
                    RentalPaymentSchedule(
                        tenant_id=agreement.tenant_id,
                        agreement_id=agreement.id,
                        sequence=sequence,
                        charge_type=charge_type,
                        period_start=cursor,
                        period_end=period_end,
                        due_date=due,
                        amount=amount,
                        status="Pending",
                    )
                )
                existing_keys.add(key)
                created += 1
            cursor = next_start
    return created


def extend_open_ended_rental_schedules(db: Session, today: date | None = None) -> dict:
    """Idempotently extend payment schedules for Active open-ended rental agreements."""
    today = today or date.today()
    threshold_months = get_setting_int("OPEN_ENDED_RENTAL_EXTENSION_THRESHOLD_MONTHS", 3)
    horizon_months = get_setting_int("OPEN_ENDED_RENTAL_EXTENSION_HORIZON_MONTHS", 12)
    initial_months = get_setting_int("OPEN_ENDED_RENTAL_INITIAL_MONTHS", 12)
    threshold_date = add_months(today, threshold_months)

    agreements = (
        db.query(RentalAgreement)
        .filter(
            RentalAgreement.status == "Active",
            RentalAgreement.agreement_end.is_(None),
        )
        .with_for_update(skip_locked=True)
        .all()
    )
    extended_agreements = 0
    rows_created = 0

    for agreement in agreements:
        latest_end = (
            db.query(func.max(RentalPaymentSchedule.period_end))
            .filter(
                RentalPaymentSchedule.tenant_id == agreement.tenant_id,
                RentalPaymentSchedule.agreement_id == agreement.id,
                RentalPaymentSchedule.charge_type == "Rent",
                RentalPaymentSchedule.status != "Cancelled",
            )
            .scalar()
        )
        if latest_end is None:
            target_through = add_months(max(agreement.agreement_start, today), initial_months)
        elif latest_end <= threshold_date:
            target_through = add_months(max(today, latest_end), horizon_months)
        else:
            continue

        created = generate_rental_schedule_rows(db, agreement, target_through)
        if created > 0:
            extended_agreements += 1
            rows_created += created
            log_audit(
                db,
                agreement.tenant_id,
                None,
                "AUTO_EXTEND_SCHEDULE",
                "rental_payment_schedules",
                agreement.id,
                f"Automatically extended open-ended rental schedule by {created} item(s) through {target_through.isoformat()}.",
                after_data={"created_count": created, "through_date": target_through.isoformat()},
            )

    db.commit()
    return {"extended_agreements": extended_agreements, "schedules_created": rows_created}


# ---------------------------------------------------------------------------
# Problem 15: Rental Arrears Calculation Including Late Fees
# ---------------------------------------------------------------------------

def schedule_verified_paid(db: Session, tenant_id: UUID, schedule_id: UUID) -> Decimal:
    value = (
        db.query(func.coalesce(func.sum(RentalPayment.amount), 0))
        .filter(
            RentalPayment.tenant_id == tenant_id,
            RentalPayment.schedule_id == schedule_id,
            RentalPayment.status == "Verified",
        )
        .scalar()
    )
    return money(value)


def compute_effective_late_fee(
    agreement: RentalAgreement,
    schedule: RentalPaymentSchedule,
    paid: Decimal,
    as_of_date: date,
) -> Decimal:
    """Return the single authoritative late fee for a schedule without double-counting."""
    if schedule.late_fee_applied_at is not None:
        return money(schedule.late_fee_amount)
    if (
        schedule.charge_type == "Rent"
        and money(agreement.late_fee_amount) > ZERO
        and as_of_date > schedule.due_date + timedelta(days=agreement.late_fee_grace_days or 0)
        and paid < money(schedule.amount)
    ):
        if agreement.late_fee_type == "Percentage":
            return money(money(schedule.amount) * money(agreement.late_fee_amount) / Decimal("100"))
        return money(agreement.late_fee_amount)
    return money(schedule.late_fee_amount)


def calculate_rental_arrears(
    db: Session,
    tenant_id: UUID,
    agreement: RentalAgreement,
    as_of_date: date,
    *,
    persist_late_fees: bool = True,
) -> dict:
    """Compute rental arrears including scheduled amounts and applicable late fees (no double-counting)."""
    schedules = (
        db.query(RentalPaymentSchedule)
        .filter(
            RentalPaymentSchedule.tenant_id == tenant_id,
            RentalPaymentSchedule.agreement_id == agreement.id,
            RentalPaymentSchedule.due_date <= as_of_date,
            RentalPaymentSchedule.status != "Cancelled",
        )
        .order_by(RentalPaymentSchedule.sequence.asc())
        .all()
    )

    total_arrears = ZERO
    principal_arrears = ZERO
    late_fee_arrears = ZERO
    breakdown = []
    now = utcnow()

    for item in schedules:
        paid = schedule_verified_paid(db, tenant_id, item.id)
        effective_late_fee = compute_effective_late_fee(agreement, item, paid, as_of_date)
        if persist_late_fees and item.late_fee_applied_at is None and effective_late_fee > ZERO:
            item.late_fee_amount = effective_late_fee
            item.late_fee_applied_at = now
        scheduled_amount = money(item.amount)
        total_due = money(scheduled_amount + effective_late_fee)
        outstanding = max(ZERO, money(total_due - paid))
        if outstanding > ZERO:
            principal_rem = max(ZERO, money(scheduled_amount - paid))
            late_fee_rem = max(ZERO, money(outstanding - principal_rem))
            principal_arrears = money(principal_arrears + principal_rem)
            late_fee_arrears = money(late_fee_arrears + late_fee_rem)
            total_arrears = money(total_arrears + outstanding)
            breakdown.append(
                {
                    "schedule_id": str(item.id),
                    "sequence": item.sequence,
                    "charge_type": item.charge_type,
                    "due_date": item.due_date.isoformat(),
                    "scheduled_amount": str(scheduled_amount),
                    "late_fee_amount": str(effective_late_fee),
                    "verified_paid": str(paid),
                    "outstanding": str(outstanding),
                }
            )

    return {
        "total_arrears": money(total_arrears),
        "principal_arrears": money(principal_arrears),
        "late_fee_arrears": money(late_fee_arrears),
        "items": breakdown,
    }


# ---------------------------------------------------------------------------
# Problem 17: Shared Offer Acceptance Governance (Staff, Portal, Walk-in)
# ---------------------------------------------------------------------------

def apply_offer_acceptance(
    db: Session,
    tenant_id: UUID,
    offer: PropertyOffer,
    match: PropertyMatch,
    prop: Property,
    *,
    now: datetime | None = None,
) -> None:
    """Validate and apply offer acceptance rules consistently across portal and walk-in flows."""
    now = now or utcnow()
    release_expired_holds_for_property(db, tenant_id, prop.id, now=now)
    db.refresh(prop)

    if prop.status != "Available":
        raise HTTPException(status_code=409, detail="This property is no longer available for a new accepted offer.")
    if prop.minimum_acceptable_price is not None and money(offer.offered_price) < money(prop.minimum_acceptable_price):
        raise HTTPException(
            status_code=409,
            detail=f"Offer is below the property's minimum acceptable price ({prop.minimum_acceptable_price}).",
        )
    competing = (
        db.query(PropertyOffer.id)
        .join(PropertyMatch, PropertyMatch.id == PropertyOffer.property_match_id)
        .filter(
            PropertyOffer.tenant_id == tenant_id,
            PropertyMatch.tenant_id == tenant_id,
            PropertyMatch.property_id == prop.id,
            PropertyOffer.id != offer.id,
            PropertyOffer.status.in_(("Accepted", "Pending Owner Approval")),
            (PropertyOffer.expires_at.is_(None) | (PropertyOffer.expires_at > now)),
            (PropertyOffer.hold_expires_at.is_(None) | (PropertyOffer.hold_expires_at > now)),
        )
        .first()
    )
    if competing:
        raise HTTPException(
            status_code=409,
            detail="Another buyer already has an accepted or owner-pending offer on this property.",
        )

    if prop.require_owner_approval:
        offer.status = "Pending Owner Approval"
        return

    offer.status = "Accepted"
    match.status = "Offer Accepted"
    req = (
        db.query(BuyerRequirement)
        .filter(BuyerRequirement.id == match.buyer_requirement_id, BuyerRequirement.tenant_id == tenant_id)
        .first()
    )
    if req and req.lead_id:
        lead = db.query(Lead).filter(Lead.id == req.lead_id, Lead.tenant_id == tenant_id).first()
        if lead:
            lead.status = "Offer Accepted"
    if prop.hold_on_offer_acceptance:
        prop.offer_hold_expires_at = now + timedelta(hours=max(1, prop.offer_hold_hours or 48))
        offer.hold_expires_at = prop.offer_hold_expires_at
        offer.expires_at = min(offer.expires_at, offer.hold_expires_at) if offer.expires_at else offer.hold_expires_at
        prop.status = "Reserved"
        prop.updated_at = now
