"""Scheduled jobs.

Every job is idempotent: running it twice on the same day changes nothing the
second time, so a retried or overlapping run is harmless.
"""
import logging
import os
import uuid
from datetime import date, datetime, timedelta
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.contact import Contact
from app.models.notification import Notification
from app.models.role import Role
from app.models.software_contract import SoftwareContract
from app.models.software_estimate import SoftwareEstimate
from app.models.software_invoice import (
    SoftwareCreditNote,
    SoftwareInvoice,
    SoftwareInvoicePayment,
)
from app.models.software_invoice_reminder import SoftwareInvoiceReminder
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_role import UserRole
from app.services.audit_service import log_audit
from app.services.email_service import send_customer_payment_reminder_email

logger = logging.getLogger("scuilone.worker")

BATCH_SIZE = 200
OPEN_INVOICE_STATUSES = ("Sent", "Partially Paid")
# An overdue invoice is escalated when it first passes each of these ages.
OVERDUE_ALERT_DAYS = (1, 7, 15, 30, 60)
DUE_SOON_DAYS = 3
# Managers are told when an unpaid invoice passes these ages.
ESCALATION_DAYS = (30, 60, 90)
ESCALATION_ROLES = ("Tenant Owner", "Tenant Admin", "Manager")
# Customers are emailed (only when enabled) at these ages, and once before the due date.
CUSTOMER_OVERDUE_DAYS = (3, 10, 30)
MAX_CUSTOMER_EMAILS_PER_RUN = 200


def _active_user_ids(db: Session, tenant_id: uuid.UUID, candidates: list) -> set:
    ids = {c for c in candidates if c is not None}
    if not ids:
        return set()

    rows = db.query(User.id).filter(
        User.tenant_id == tenant_id,
        User.id.in_(ids),
        User.status == "Active",
    ).all()
    return {row[0] for row in rows}


def _add_notification(
    db: Session,
    tenant_id: uuid.UUID,
    recipient_user_id: uuid.UUID,
    title: str,
    message: str,
    notification_type: str,
    related_module: str,
    related_record_id: uuid.UUID,
) -> None:
    db.add(
        Notification(
            tenant_id=tenant_id,
            recipient_user_id=recipient_user_id,
            workflow_id=None,
            title=title[:200],
            message=message,
            notification_type=notification_type,
            related_module=related_module,
            related_record_id=related_record_id,
            is_read=False,
        )
    )


def _already_notified(
    db: Session, notification_type: str, record_ids: list
) -> set:
    if not record_ids:
        return set()

    rows = db.query(Notification.related_record_id, Notification.title).filter(
        Notification.notification_type == notification_type,
        Notification.related_record_id.in_(record_ids),
    ).all()
    return {(row[0], row[1]) for row in rows}


def _balance_expression():
    """total - received - credited, computed in SQL so large tables stay fast."""
    received = (
        select(func.coalesce(func.sum(SoftwareInvoicePayment.amount), 0))
        .where(
            SoftwareInvoicePayment.invoice_id == SoftwareInvoice.id,
            SoftwareInvoicePayment.status == "Received",
        )
        .correlate(SoftwareInvoice)
        .scalar_subquery()
    )
    credited = (
        select(func.coalesce(func.sum(SoftwareCreditNote.amount), 0))
        .where(SoftwareCreditNote.invoice_id == SoftwareInvoice.id)
        .correlate(SoftwareInvoice)
        .scalar_subquery()
    )
    return SoftwareInvoice.total_amount - received - credited


# --------------------------------------------------------------------- jobs
def expire_sent_estimates(db: Session, today: date) -> dict:
    """Sent estimates whose validity date has passed become Expired."""
    expired = notified = 0

    while True:
        estimates = (
            db.query(SoftwareEstimate)
            .filter(
                SoftwareEstimate.status == "Sent",
                SoftwareEstimate.expiry_date.is_not(None),
                SoftwareEstimate.expiry_date < today,
            )
            .order_by(SoftwareEstimate.expiry_date.asc())
            .limit(BATCH_SIZE)
            .with_for_update(skip_locked=True)
            .all()
        )

        if not estimates:
            break

        for estimate in estimates:
            estimate.status = "Expired"
            expired += 1

            log_audit(
                db,
                tenant_id=estimate.tenant_id,
                user_id=None,
                action="AUTO_EXPIRE",
                module="software_estimates",
                record_id=estimate.id,
                description=(
                    f"Estimate {estimate.estimate_number} expired automatically "
                    f"on {today} (valid until {estimate.expiry_date})"
                ),
                before_data={"status": "Sent"},
                after_data={"status": "Expired"},
            )

            recipients = _active_user_ids(
                db, estimate.tenant_id, [estimate.assigned_to, estimate.created_by]
            )
            for recipient in recipients:
                _add_notification(
                    db,
                    estimate.tenant_id,
                    recipient,
                    f"Estimate {estimate.estimate_number} has expired",
                    (
                        f"Estimate {estimate.estimate_number} was valid until "
                        f"{estimate.expiry_date} and has been marked Expired."
                    ),
                    "estimate_expired",
                    "software_estimates",
                    estimate.id,
                )
                notified += 1

        db.commit()

    return {"expired": expired, "notifications": notified}


def overdue_invoice_alerts(db: Session, today: date) -> dict:
    """Notify the invoice owner when an unpaid invoice passes 1, 7, 15, 30, 60 days late."""
    balance = _balance_expression()
    rows = (
        db.query(SoftwareInvoice, balance.label("balance"))
        .filter(
            SoftwareInvoice.status.in_(OPEN_INVOICE_STATUSES),
            SoftwareInvoice.due_date.is_not(None),
            SoftwareInvoice.due_date < today,
            balance > 0,
        )
        .all()
    )

    candidates = []
    for invoice, open_amount in rows:
        days_late = (today - invoice.due_date).days
        bucket = max((d for d in OVERDUE_ALERT_DAYS if d <= days_late), default=None)
        if bucket is None:
            continue
        title = f"Invoice {invoice.invoice_number} is overdue ({bucket}+ days)"
        candidates.append((invoice, open_amount, days_late, title))

    seen = _already_notified(
        db, "invoice_overdue", [invoice.id for invoice, _, _, _ in candidates]
    )

    created = 0
    for invoice, open_amount, days_late, title in candidates:
        if (invoice.id, title) in seen:
            continue

        recipients = _active_user_ids(db, invoice.tenant_id, [invoice.created_by])
        for recipient in recipients:
            _add_notification(
                db,
                invoice.tenant_id,
                recipient,
                title,
                (
                    f"Invoice {invoice.invoice_number} was due on {invoice.due_date} "
                    f"and {open_amount:.2f} {invoice.currency} is still unpaid "
                    f"({days_late} days overdue)."
                ),
                "invoice_overdue",
                "software_invoices",
                invoice.id,
            )
            created += 1

    db.commit()
    return {"overdue_invoices": len(candidates), "notifications": created}


def upcoming_due_reminders(db: Session, today: date) -> dict:
    """Remind the invoice owner a few days before an unpaid invoice falls due."""
    balance = _balance_expression()
    rows = (
        db.query(SoftwareInvoice, balance.label("balance"))
        .filter(
            SoftwareInvoice.status.in_(OPEN_INVOICE_STATUSES),
            SoftwareInvoice.due_date.is_not(None),
            SoftwareInvoice.due_date >= today,
            SoftwareInvoice.due_date <= today + timedelta(days=DUE_SOON_DAYS),
            balance > 0,
        )
        .all()
    )

    candidates = [
        (
            invoice,
            open_amount,
            f"Invoice {invoice.invoice_number} is due on {invoice.due_date}",
        )
        for invoice, open_amount in rows
    ]
    seen = _already_notified(
        db, "invoice_due_soon", [invoice.id for invoice, _, _ in candidates]
    )

    created = 0
    for invoice, open_amount, title in candidates:
        if (invoice.id, title) in seen:
            continue

        recipients = _active_user_ids(db, invoice.tenant_id, [invoice.created_by])
        for recipient in recipients:
            _add_notification(
                db,
                invoice.tenant_id,
                recipient,
                title,
                (
                    f"{open_amount:.2f} {invoice.currency} is outstanding on invoice "
                    f"{invoice.invoice_number}, due {invoice.due_date}."
                ),
                "invoice_due_soon",
                "software_invoices",
                invoice.id,
            )
            created += 1

    db.commit()
    return {"due_soon_invoices": len(candidates), "notifications": created}


def escalate_overdue_invoices(db: Session, today: date) -> dict:
    """Tell the tenant's owners, admins and managers about invoices 30, 60 and 90+ days late."""
    balance = _balance_expression()
    rows = (
        db.query(SoftwareInvoice, balance.label("balance"))
        .filter(
            SoftwareInvoice.status.in_(OPEN_INVOICE_STATUSES),
            SoftwareInvoice.due_date.is_not(None),
            SoftwareInvoice.due_date <= today - timedelta(days=min(ESCALATION_DAYS)),
            balance > 0,
        )
        .all()
    )

    candidates = []
    for invoice, open_amount in rows:
        days_late = (today - invoice.due_date).days
        bucket = max((d for d in ESCALATION_DAYS if d <= days_late), default=None)
        if bucket is None:
            continue
        title = f"Escalation: invoice {invoice.invoice_number} is {bucket}+ days overdue"
        candidates.append((invoice, open_amount, days_late, title))

    seen = _already_notified(
        db, "invoice_overdue_escalation", [invoice.id for invoice, _, _, _ in candidates]
    )

    managers_by_tenant: dict = {}
    created = 0

    for invoice, open_amount, days_late, title in candidates:
        if (invoice.id, title) in seen:
            continue

        if invoice.tenant_id not in managers_by_tenant:
            managers_by_tenant[invoice.tenant_id] = [
                row[0]
                for row in db.query(User.id)
                .join(UserRole, UserRole.user_id == User.id)
                .join(Role, Role.id == UserRole.role_id)
                .filter(
                    User.tenant_id == invoice.tenant_id,
                    User.status == "Active",
                    Role.name.in_(ESCALATION_ROLES),
                )
                .distinct()
                .all()
            ]

        for recipient in managers_by_tenant[invoice.tenant_id]:
            _add_notification(
                db,
                invoice.tenant_id,
                recipient,
                title,
                (
                    f"Invoice {invoice.invoice_number} was due on {invoice.due_date}; "
                    f"{open_amount:.2f} {invoice.currency} is still unpaid "
                    f"({days_late} days overdue). Please follow up with the customer."
                ),
                "invoice_overdue_escalation",
                "software_invoices",
                invoice.id,
            )
            created += 1

    db.commit()
    return {"escalated_invoices": len(candidates), "notifications": created}


def _customer_reminders_enabled() -> bool:
    return os.getenv("WORKER_CUSTOMER_REMINDERS", "false").strip().lower() in {"1", "true", "yes", "on"}


def customer_payment_reminders(db: Session, today: date) -> dict:
    """Email customers about unpaid invoices. Off unless WORKER_CUSTOMER_REMINDERS=true.

    Sent once per invoice for: 3 days before the due date, and 3, 10 and 30 days
    after it. The recipient is the contract's contact, or the account's email.
    """
    if not _customer_reminders_enabled():
        return {"enabled": False, "sent": 0}

    dry_run = bool(db.info.get("dry_run"))
    balance = _balance_expression()

    rows = (
        db.query(
            SoftwareInvoice,
            balance.label("balance"),
            Contact.full_name,
            Contact.email,
            Account.name,
            Account.email,
            Tenant.name,
            User.email,
        )
        .join(SoftwareContract, SoftwareContract.id == SoftwareInvoice.software_contract_id)
        .outerjoin(Contact, Contact.id == SoftwareContract.contact_id)
        .outerjoin(Account, Account.id == SoftwareContract.account_id)
        .join(Tenant, Tenant.id == SoftwareInvoice.tenant_id)
        .outerjoin(User, User.id == SoftwareInvoice.created_by)
        .filter(
            SoftwareInvoice.status.in_(OPEN_INVOICE_STATUSES),
            SoftwareInvoice.due_date.is_not(None),
            SoftwareInvoice.due_date <= today + timedelta(days=DUE_SOON_DAYS),
            balance > 0,
        )
        .order_by(SoftwareInvoice.due_date.asc())
        .all()
    )

    candidates = []
    for invoice, open_amount, contact_name, contact_email, account_name, account_email, tenant_name, owner_email in rows:
        days_late = (today - invoice.due_date).days
        if days_late >= 0:
            bucket = max((d for d in CUSTOMER_OVERDUE_DAYS if d <= days_late), default=None)
            if bucket is None:
                continue  # due today or only a day or two late: no email yet
            kind = f"overdue_{bucket}"
        else:
            kind = "due_soon"
        candidates.append(
            (invoice, open_amount, kind, days_late, contact_name or account_name, (contact_email or account_email or "").strip(), tenant_name, owner_email)
        )

    already_sent = {
        (row[0], row[1])
        for row in db.query(SoftwareInvoiceReminder.invoice_id, SoftwareInvoiceReminder.kind)
        .filter(SoftwareInvoiceReminder.invoice_id.in_([c[0].id for c in candidates]))
        .all()
    } if candidates else set()

    sent = failed = skipped_no_email = would_send = 0

    for invoice, open_amount, kind, days_late, customer_name, email, tenant_name, owner_email in candidates:
        if (invoice.id, kind) in already_sent:
            continue

        if not email:
            skipped_no_email += 1
            continue

        if sent + would_send >= MAX_CUSTOMER_EMAILS_PER_RUN:
            logger.warning("Customer reminder limit reached for this run; the rest will go next run.")
            break

        if dry_run:
            would_send += 1
            continue

        try:
            send_customer_payment_reminder_email(
                recipient_email=email,
                customer_name=customer_name or "",
                business_name=tenant_name,
                invoice_number=invoice.invoice_number,
                outstanding_amount=f"{open_amount:.2f}",
                currency=invoice.currency,
                due_date=invoice.due_date.isoformat(),
                days_overdue=max(days_late, 0),
                reply_to=owner_email,
            )
        except Exception:
            failed += 1
            logger.exception("Could not email reminder for invoice %s", invoice.invoice_number)
            continue

        # Record right after sending so a crash can never cause a repeat email.
        db.add(
            SoftwareInvoiceReminder(
                tenant_id=invoice.tenant_id,
                invoice_id=invoice.id,
                kind=kind,
                recipient_email=email[:254],
            )
        )
        db.commit()
        sent += 1

    result = {"enabled": True, "sent": sent, "failed": failed, "skipped_no_email": skipped_no_email}
    if dry_run:
        result["would_send"] = would_send
    return result


def subscription_lifecycle_job(db: Session, today: date) -> dict:
    from datetime import datetime, time, timezone
    from app.services.subscription_service import process_subscription_lifecycle_transitions
    ref_dt = datetime.combine(today, time(12, 0), tzinfo=timezone.utc)
    if db.info.get("dry_run"):
        return {"dry_run": True, "trials_expired": 0}
    return process_subscription_lifecycle_transitions(db, reference_time=ref_dt)


def subscription_renewals_job(db: Session, today: date) -> dict:
    from app.services.subscription_service import generate_upcoming_renewal_invoices
    if db.info.get("dry_run"):
        return {"dry_run": True, "generated": 0}
    return generate_upcoming_renewal_invoices(db, today=today)


def subscription_reminders_job(db: Session, today: date) -> dict:
    from datetime import datetime, time, timezone
    from app.services.subscription_service import process_trial_and_post_trial_reminders
    ref_dt = datetime.combine(today, time(12, 0), tzinfo=timezone.utc)
    if db.info.get("dry_run"):
        return {"dry_run": True, "sent": 0}
    return process_trial_and_post_trial_reminders(db, reference_time=ref_dt)


def technical_monitoring_job(db: Session, today: date) -> dict:
    from app.services.monitoring_service import run_all_health_checks_and_detect_incidents
    if db.info.get("dry_run"):
        return {"dry_run": True, "checked": 0}
    res = run_all_health_checks_and_detect_incidents(db)
    return {
        "checked_services": len(res.get("services", [])),
        "resource_status": res.get("resources", {}).get("status", "Healthy"),
    }


JOBS = {
    "expire_estimates": expire_sent_estimates,
    "overdue_invoices": overdue_invoice_alerts,
    "due_reminders": upcoming_due_reminders,
    "escalate_overdue": escalate_overdue_invoices,
    "customer_reminders": customer_payment_reminders,
    "subscription_lifecycle": subscription_lifecycle_job,
    "subscription_renewals": subscription_renewals_job,
    "subscription_reminders": subscription_reminders_job,
    "technical_monitoring": technical_monitoring_job,
}


def expire_customer_booking_holds(db: Session, today: date) -> dict:
    """Expire portal Sale, walk-in Sale, and Rent/Lease booking holds idempotently."""
    from app.services.real_estate_lifecycle import (
        expire_customer_booking_requests,
        expire_rental_booking_requests,
        expire_walkin_sale_bookings,
    )

    portal_res = expire_customer_booking_requests(db, batch_size=BATCH_SIZE)
    walkin_res = expire_walkin_sale_bookings(db, batch_size=BATCH_SIZE)
    rental_res = expire_rental_booking_requests(db, batch_size=BATCH_SIZE)
    return {
        "expired_holds": portal_res["expired_holds"],
        "expired_walkin_bookings": walkin_res["expired_walkin_bookings"],
        "walkin_payment_review": walkin_res["payment_review_required"],
        "expired_rental_booking_holds": rental_res["expired_rental_booking_holds"],
        "rental_payment_review": rental_res["payment_review_required"],
    }


def expire_walkin_sale_holds(db: Session, today: date) -> dict:
    """Expire walk-in Sale booking holds idempotently."""
    from app.services.real_estate_lifecycle import expire_walkin_sale_bookings

    return expire_walkin_sale_bookings(db, batch_size=BATCH_SIZE)


def expire_rental_booking_holds(db: Session, today: date) -> dict:
    """Expire Rent and Lease booking request holds idempotently."""
    from app.services.real_estate_lifecycle import expire_rental_booking_requests

    return expire_rental_booking_requests(db, batch_size=BATCH_SIZE)


def extend_open_ended_rental_schedules_job(db: Session, today: date) -> dict:
    """Automatically extend payment schedules for Active open-ended rental agreements."""
    from app.services.real_estate_lifecycle import extend_open_ended_rental_schedules

    return extend_open_ended_rental_schedules(db, today=today)


# Register after function definitions so module import order is deterministic.
JOBS["expire_customer_booking_holds"] = expire_customer_booking_holds
JOBS["expire_walkin_sale_holds"] = expire_walkin_sale_holds
JOBS["expire_rental_booking_holds"] = expire_rental_booking_holds
JOBS["extend_open_ended_rental_schedules"] = extend_open_ended_rental_schedules_job


def customer_booking_payment_reminders(db: Session, today: date) -> dict:
    """Notify portal customers about instalments due in three days and overdue milestones."""
    from app.models.payment_plan import PaymentPlan, PaymentPlanInstallment
    from app.models.booking import Booking
    from app.models.customer_booking_journey import CustomerBookingRequest
    from app.models.customer_portal_lifecycle import CustomerPortalNotification
    from app.models.payment import Payment
    from app.models.payment_refund import PaymentRefund
    from app.services.customer_portal_notifications import notify_customer

    sent = 0
    plans = db.query(PaymentPlan).filter(PaymentPlan.status == "Active").all()
    for plan in plans:
        booking = db.query(Booking).filter(Booking.id == plan.booking_id, Booking.tenant_id == plan.tenant_id, Booking.status == "Confirmed").first()
        if not booking:
            continue
        journey = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.tenant_id == plan.tenant_id, CustomerBookingRequest.booking_id == booking.id).first()
        if not journey:
            continue
        installments = db.query(PaymentPlanInstallment).filter(PaymentPlanInstallment.tenant_id == plan.tenant_id, PaymentPlanInstallment.payment_plan_id == plan.id, PaymentPlanInstallment.status.in_(["Pending", "Partially Paid", "Overdue"])).all()
        for installment in installments:
            verified = db.query(Payment).filter(Payment.tenant_id == plan.tenant_id, Payment.booking_id == booking.id, Payment.installment_id == installment.id, Payment.status == "Verified").all()
            verified_total = sum((Decimal(str(p.amount)) for p in verified), Decimal("0.00"))
            ids = [p.id for p in verified]
            refunds = db.query(PaymentRefund).filter(PaymentRefund.tenant_id == plan.tenant_id, PaymentRefund.booking_id == booking.id, PaymentRefund.payment_id.in_(ids) if ids else PaymentRefund.payment_id == None, PaymentRefund.status == "Processed").all()
            net = max(Decimal("0.00"), verified_total - sum((Decimal(str(r.amount)) for r in refunds), Decimal("0.00")))
            if net >= Decimal(str(installment.amount)):
                installment.status = "Paid"
                continue
            days_until = (installment.due_date - today).days
            if days_until == DUE_SOON_DAYS:
                kind, title = "installment_due", "Instalment due in three days"
                message = f"Your instalment '{installment.name}' of {installment.amount} is due on {installment.due_date.isoformat()}."
            elif days_until < 0 and abs(days_until) in OVERDUE_ALERT_DAYS:
                kind, title = "installment_overdue", "Instalment payment overdue"
                message = f"Your instalment '{installment.name}' of {installment.amount} was due on {installment.due_date.isoformat()}. Please review your payment schedule."
                installment.status = "Overdue"
            else:
                continue
            exists = db.query(CustomerPortalNotification.id).filter(CustomerPortalNotification.tenant_id == plan.tenant_id, CustomerPortalNotification.portal_user_id == journey.portal_user_id, CustomerPortalNotification.notification_type == kind, CustomerPortalNotification.related_record_id == installment.id).first()
            if not exists:
                notify_customer(db, plan.tenant_id, journey.portal_user_id, title, message, kind, "payment_plan_installments", installment.id)
                sent += 1
    db.commit()
    return {"customer_installment_notifications": sent}


JOBS["customer_booking_payment_reminders"] = customer_booking_payment_reminders


def rental_lifecycle_job(db: Session, today: date) -> dict:
    """Mark rental dues overdue, expire agreements, and send idempotent reminders."""
    from app.models.rental import RentalAgreement, RentalPaymentSchedule, RentalPayment
    from app.models.property_offer import PropertyOffer
    from app.models.property_match import PropertyMatch
    from app.models.property import Property
    from app.models.lead import Lead
    from app.models.booking import Booking
    from app.models.buyer_requirement import BuyerRequirement
    from app.models.customer_portal import CustomerPortalUser
    from app.models.customer_portal_lifecycle import CustomerPortalNotification
    from app.models.notification import Notification
    from app.models.user import User

    now = datetime.utcnow()
    overdue_updated = 0
    agreements_expired = 0
    reminders_sent = 0
    expiry_reminders_sent = 0
    offers_expired = 0
    property_holds_released = 0
    late_fees_applied = 0

    # Expire offers and release timed holds. Existing bookings keep the property Reserved.
    expired_offers = db.query(PropertyOffer).filter(
        PropertyOffer.status.in_(("Submitted", "Countered", "Pending Owner Approval", "Accepted")),
        PropertyOffer.expires_at.is_not(None),
        PropertyOffer.expires_at <= now,
    ).with_for_update(skip_locked=True).all()
    for offer in expired_offers:
        was_accepted = offer.status == "Accepted"
        if offer.status == "Accepted":
            linked_booking = db.query(Booking.id).filter(
                Booking.tenant_id == offer.tenant_id,
                Booking.accepted_offer_id == offer.id,
                Booking.status.in_(("Pending", "Confirmed", "Completed")),
            ).first()
            linked_agreement = db.query(RentalAgreement.id).filter(
                RentalAgreement.tenant_id == offer.tenant_id,
                RentalAgreement.accepted_offer_id == offer.id,
                RentalAgreement.status.in_(("Draft", "Pending Signature", "Active", "Termination Requested", "Expired")),
            ).first()
            if linked_booking or linked_agreement:
                continue
        offer.status = "Expired"
        offers_expired += 1
        match = db.query(PropertyMatch).filter(
            PropertyMatch.id == offer.property_match_id,
            PropertyMatch.tenant_id == offer.tenant_id,
        ).first()
        if match and was_accepted:
            match.status = "Matched"
            req = db.query(BuyerRequirement).filter(
                BuyerRequirement.id == match.buyer_requirement_id,
                BuyerRequirement.tenant_id == offer.tenant_id,
            ).first()
            if req and req.lead_id:
                lead = db.query(Lead).filter(Lead.id == req.lead_id, Lead.tenant_id == offer.tenant_id).first()
                if lead and lead.status == "Offer Accepted":
                    lead.status = "Qualified"
        if match and offer.hold_expires_at:
            prop = db.query(Property).filter(
                Property.id == match.property_id, Property.tenant_id == offer.tenant_id,
            ).with_for_update().first()
            active_booking = db.query(Booking.id).filter(
                Booking.tenant_id == offer.tenant_id, Booking.property_id == match.property_id,
                Booking.status.in_(("Pending", "Confirmed")),
            ).first()
            if prop and prop.offer_hold_expires_at == offer.hold_expires_at:
                prop.offer_hold_expires_at = None
                if prop.status == "Reserved" and not active_booking:
                    prop.status = "Available"
                    property_holds_released += 1

    expired_holds = db.query(Property).filter(
        Property.offer_hold_expires_at.is_not(None),
        Property.offer_hold_expires_at <= now,
    ).with_for_update(skip_locked=True).all()
    for prop in expired_holds:
        held_offer = db.query(PropertyOffer).join(PropertyMatch, PropertyMatch.id == PropertyOffer.property_match_id).filter(
            PropertyOffer.tenant_id == prop.tenant_id,
            PropertyMatch.tenant_id == prop.tenant_id,
            PropertyMatch.property_id == prop.id,
            PropertyOffer.status.in_(("Accepted", "Pending Owner Approval")),
            PropertyOffer.hold_expires_at.is_not(None),
            PropertyOffer.hold_expires_at <= now,
        ).with_for_update().all()
        for offer in held_offer:
            was_accepted = offer.status == "Accepted"
            linked_booking = db.query(Booking.id).filter(
                Booking.tenant_id == prop.tenant_id, Booking.accepted_offer_id == offer.id,
                Booking.status.in_(("Pending", "Confirmed", "Completed")),
            ).first()
            linked_agreement = db.query(RentalAgreement.id).filter(
                RentalAgreement.tenant_id == prop.tenant_id, RentalAgreement.accepted_offer_id == offer.id,
                RentalAgreement.status.in_(("Draft", "Pending Signature", "Active", "Termination Requested", "Expired")),
            ).first()
            if linked_booking or linked_agreement:
                continue
            offer.status = "Expired"
            match = db.query(PropertyMatch).filter(PropertyMatch.id == offer.property_match_id, PropertyMatch.tenant_id == prop.tenant_id).first()
            if match and was_accepted:
                match.status = "Matched"
                req = db.query(BuyerRequirement).filter(BuyerRequirement.id == match.buyer_requirement_id, BuyerRequirement.tenant_id == prop.tenant_id).first()
                if req and req.lead_id:
                    lead = db.query(Lead).filter(Lead.id == req.lead_id, Lead.tenant_id == prop.tenant_id).first()
                    if lead and lead.status == "Offer Accepted":
                        lead.status = "Qualified"
        active_booking = db.query(Booking.id).filter(
            Booking.tenant_id == prop.tenant_id,
            Booking.property_id == prop.id,
            Booking.status.in_(("Pending", "Confirmed")),
        ).first()
        prop.offer_hold_expires_at = None
        if prop.status == "Reserved" and not active_booking:
            prop.status = "Available"
            property_holds_released += 1

    schedules = db.query(RentalPaymentSchedule).filter(
        RentalPaymentSchedule.status.in_(("Pending", "Partially Paid", "Overdue")),
        RentalPaymentSchedule.due_date < today,
    ).all()
    for schedule in schedules:
        paid = db.query(func.coalesce(func.sum(RentalPayment.amount), 0)).filter(
            RentalPayment.tenant_id == schedule.tenant_id,
            RentalPayment.schedule_id == schedule.id,
            RentalPayment.status == "Verified",
        ).scalar() or 0
        agreement = db.query(RentalAgreement).filter(
            RentalAgreement.id == schedule.agreement_id,
            RentalAgreement.tenant_id == schedule.tenant_id,
        ).first()
        if agreement and schedule.charge_type == "Rent" and agreement.late_fee_amount > 0:
            grace_cutoff = schedule.due_date + timedelta(days=agreement.late_fee_grace_days or 0)
            if today > grace_cutoff and schedule.late_fee_applied_at is None and Decimal(str(paid)) < Decimal(str(schedule.amount)):
                if agreement.late_fee_type == "Percentage":
                    schedule.late_fee_amount = (Decimal(str(schedule.amount)) * Decimal(str(agreement.late_fee_amount)) / Decimal("100")).quantize(Decimal("0.01"))
                else:
                    schedule.late_fee_amount = Decimal(str(agreement.late_fee_amount)).quantize(Decimal("0.01"))
                schedule.late_fee_applied_at = now
                late_fees_applied += 1
        total_due = Decimal(str(schedule.amount)) + Decimal(str(schedule.late_fee_amount or 0))
        if Decimal(str(paid)) >= total_due:
            schedule.status = "Paid"
        else:
            schedule.status = "Overdue"
            overdue_updated += 1

    expiring = db.query(RentalAgreement).filter(
        RentalAgreement.status == "Active",
        RentalAgreement.agreement_end.is_not(None),
        RentalAgreement.agreement_end < today,
    ).with_for_update().all()
    for agreement in expiring:
        agreement.status = "Expired"
        agreements_expired += 1
        message = f"Your rental agreement has reached its end date ({agreement.agreement_end.isoformat()}). Please contact your property manager to confirm renewal or move-out arrangements. The property remains occupied until handover is completed."
        portal_user = db.query(CustomerPortalUser).filter(
            CustomerPortalUser.tenant_id == agreement.tenant_id,
            CustomerPortalUser.contact_id == agreement.contact_id,
            CustomerPortalUser.status == "Active",
        ).first() if agreement.contact_id else None
        if portal_user:
            exists_portal = db.query(CustomerPortalNotification.id).filter(
                CustomerPortalNotification.tenant_id == agreement.tenant_id,
                CustomerPortalNotification.portal_user_id == portal_user.id,
                CustomerPortalNotification.notification_type == "rental_agreement_expired",
                CustomerPortalNotification.related_record_id == agreement.id,
            ).first()
            if not exists_portal:
                db.add(CustomerPortalNotification(
                    tenant_id=agreement.tenant_id, portal_user_id=portal_user.id,
                    title="Rental agreement reached its end date", message=message,
                    notification_type="rental_agreement_expired", related_module="rental_agreements",
                    related_record_id=agreement.id, is_read=False,
                ))
        if agreement.created_by:
            exists = db.query(Notification.id).filter(
                Notification.tenant_id == agreement.tenant_id,
                Notification.related_module == "rental_agreements",
                Notification.related_record_id == agreement.id,
                Notification.title == "Rental agreement expired",
            ).first()
            if not exists:
                db.add(Notification(
                    tenant_id=agreement.tenant_id,
                    recipient_user_id=agreement.created_by,
                    workflow_id=None,
                    title="Rental agreement expired",
                    message=f"Rental agreement {agreement.id} has passed its end date. Confirm tenant exit, renewal, or a revised agreement before releasing the property.",
                    notification_type="rental_lifecycle",
                    related_module="rental_agreements",
                    related_record_id=agreement.id,
                    is_read=False,
                ))

    expiring_soon = db.query(RentalAgreement).filter(
        RentalAgreement.status == "Active",
        RentalAgreement.agreement_end.in_((today + timedelta(days=30), today + timedelta(days=7))),
    ).all()
    for agreement in expiring_soon:
        days_left = (agreement.agreement_end - today).days
        title = f"Rental agreement expires in {days_left} days"
        message = f"Your rental agreement is scheduled to end on {agreement.agreement_end.isoformat()}. Please contact your property manager if you want to request a renewal."
        portal_user = db.query(CustomerPortalUser).filter(
            CustomerPortalUser.tenant_id == agreement.tenant_id,
            CustomerPortalUser.contact_id == agreement.contact_id,
            CustomerPortalUser.status == "Active",
        ).first() if agreement.contact_id else None
        if portal_user:
            exists_portal = db.query(CustomerPortalNotification.id).filter(
                CustomerPortalNotification.tenant_id == agreement.tenant_id,
                CustomerPortalNotification.portal_user_id == portal_user.id,
                CustomerPortalNotification.notification_type == "rental_agreement_expiry_reminder",
                CustomerPortalNotification.related_record_id == agreement.id,
                CustomerPortalNotification.title == title,
            ).first()
            if not exists_portal:
                db.add(CustomerPortalNotification(
                    tenant_id=agreement.tenant_id, portal_user_id=portal_user.id,
                    title=title, message=message,
                    notification_type="rental_agreement_expiry_reminder",
                    related_module="rental_agreements", related_record_id=agreement.id, is_read=False,
                ))
                expiry_reminders_sent += 1
        if agreement.created_by:
            exists_staff = db.query(Notification.id).filter(
                Notification.tenant_id == agreement.tenant_id,
                Notification.recipient_user_id == agreement.created_by,
                Notification.related_module == "rental_agreements",
                Notification.related_record_id == agreement.id,
                Notification.title == title,
            ).first()
            if not exists_staff:
                db.add(Notification(
                    tenant_id=agreement.tenant_id, recipient_user_id=agreement.created_by,
                    workflow_id=None, title=title,
                    message=f"{agreement.customer_name}: {message}",
                    notification_type="rental_lifecycle", related_module="rental_agreements",
                    related_record_id=agreement.id, is_read=False,
                ))

    due_schedules = db.query(RentalPaymentSchedule).filter(
        RentalPaymentSchedule.status.in_(("Pending", "Partially Paid", "Overdue")),
        RentalPaymentSchedule.due_date.in_((today + timedelta(days=3), today - timedelta(days=1), today - timedelta(days=7), today - timedelta(days=15))),
    ).all()
    for schedule in due_schedules:
        agreement = db.query(RentalAgreement).filter(
            RentalAgreement.id == schedule.agreement_id,
            RentalAgreement.tenant_id == schedule.tenant_id,
        ).first()
        if not agreement:
            continue
        portal_user = db.query(CustomerPortalUser).filter(
            CustomerPortalUser.tenant_id == agreement.tenant_id,
            CustomerPortalUser.contact_id == agreement.contact_id,
            CustomerPortalUser.status == "Active",
        ).first() if agreement.contact_id else None
        due_days = (schedule.due_date - today).days
        kind = "rental_due_soon" if due_days > 0 else "rental_overdue"
        title = "Rental payment due in three days" if due_days > 0 else "Rental payment overdue"
        message = (f"Your {schedule.charge_type.lower()} payment of {schedule.amount} is due on {schedule.due_date.isoformat()}." if due_days > 0 else f"Your {schedule.charge_type.lower()} payment of {schedule.amount} was due on {schedule.due_date.isoformat()}. Late fee: {schedule.late_fee_amount}. Total due: {Decimal(str(schedule.amount)) + Decimal(str(schedule.late_fee_amount or 0))}. Please submit payment proof or contact your property manager.")
        if portal_user:
            exists = db.query(CustomerPortalNotification.id).filter(
                CustomerPortalNotification.tenant_id == agreement.tenant_id,
                CustomerPortalNotification.portal_user_id == portal_user.id,
                CustomerPortalNotification.notification_type == kind,
                CustomerPortalNotification.related_record_id == schedule.id,
            ).first()
            if not exists:
                db.add(CustomerPortalNotification(
                    tenant_id=agreement.tenant_id,
                    portal_user_id=portal_user.id,
                    title=title,
                    message=message,
                    notification_type=kind,
                    related_module="rental_payment_schedules",
                    related_record_id=schedule.id,
                    is_read=False,
                ))
                reminders_sent += 1
        if agreement.created_by:
            exists_staff = db.query(Notification.id).filter(
                Notification.tenant_id == agreement.tenant_id,
                Notification.notification_type == "rental_lifecycle",
                Notification.related_module == "rental_payment_schedules",
                Notification.related_record_id == schedule.id,
                Notification.title == title,
            ).first()
            if not exists_staff:
                recipient = db.query(User).filter(User.id == agreement.created_by, User.tenant_id == agreement.tenant_id, User.status == "Active").first()
                if recipient:
                    db.add(Notification(
                        tenant_id=agreement.tenant_id,
                        recipient_user_id=recipient.id,
                        workflow_id=None,
                        title=title,
                        message=f"{agreement.customer_name}: {message}",
                        notification_type="rental_lifecycle",
                        related_module="rental_payment_schedules",
                        related_record_id=schedule.id,
                        is_read=False,
                    ))
    db.commit()
    from app.services.real_estate_lifecycle import extend_open_ended_rental_schedules
    ext_res = extend_open_ended_rental_schedules(db, today=today)
    return {
        "overdue_schedule_items": overdue_updated,
        "late_fees_applied": late_fees_applied,
        "offers_expired": offers_expired,
        "property_holds_released": property_holds_released,
        "agreements_expired": agreements_expired,
        "payment_reminders_sent": reminders_sent,
        "agreement_expiry_reminders_sent": expiry_reminders_sent,
        "open_ended_agreements_extended": ext_res["extended_agreements"],
        "open_ended_schedules_created": ext_res["schedules_created"],
    }


JOBS["rental_lifecycle"] = rental_lifecycle_job
