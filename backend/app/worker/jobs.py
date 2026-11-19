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
    """Expire 48-hour customer booking holds and safely release pending reservations."""
    from app.models.customer_booking_journey import CustomerBookingRequest
    from app.models.booking import Booking
    from app.models.property import Property
    from app.models.notification import Notification
    from app.models.user import User
    from app.models.property_match import PropertyMatch
    from app.models.payment import Payment
    from app.models.payment_plan import PaymentPlan
    from app.models.payment_refund import PaymentRefund
    from app.services.payment_allocation import IN_FLIGHT_STATUSES

    now = datetime.utcnow()
    expired = 0
    while True:
        rows = (
            db.query(CustomerBookingRequest)
            .filter(
                CustomerBookingRequest.status == "Approved",
                CustomerBookingRequest.hold_expires_at.is_not(None),
                CustomerBookingRequest.hold_expires_at <= now,
            )
            .order_by(CustomerBookingRequest.hold_expires_at.asc())
            .limit(BATCH_SIZE)
            .with_for_update(skip_locked=True)
            .all()
        )
        if not rows:
            break
        for row in rows:
            booking = None
            if row.booking_id:
                booking = (
                    db.query(Booking)
                    .filter(Booking.id == row.booking_id, Booking.tenant_id == row.tenant_id)
                    .with_for_update()
                    .first()
                )
            payment_review_required = False
            if booking and booking.status == "Pending":
                verified = db.query(Payment).filter(Payment.tenant_id == row.tenant_id, Payment.booking_id == booking.id, Payment.status == "Verified").all()
                verified_total = sum((Decimal(str(p.amount)) for p in verified), Decimal("0.00"))
                verified_ids = [p.id for p in verified]
                refunds = db.query(PaymentRefund).filter(PaymentRefund.tenant_id == row.tenant_id, PaymentRefund.booking_id == booking.id, PaymentRefund.payment_id.in_(verified_ids) if verified_ids else PaymentRefund.payment_id == None, PaymentRefund.status == "Processed").all()
                net_verified = verified_total - sum((Decimal(str(r.amount)) for r in refunds), Decimal("0.00"))
                if net_verified > 0:
                    # Never release a property automatically while verified customer funds remain.
                    payment_review_required = True
                else:
                    before_status = booking.status
                    booking.status = "Cancelled"
                    booking.cancellation_reason = "Customer booking hold expired before final confirmation."
                    prop = (
                        db.query(Property)
                        .filter(Property.id == booking.property_id, Property.tenant_id == row.tenant_id)
                        .with_for_update()
                        .first()
                    )
                    if prop and prop.status == "Reserved":
                        prop.status = "Available"
                        prop.updated_at = now
                    active_plan = db.query(PaymentPlan).filter(PaymentPlan.tenant_id == row.tenant_id, PaymentPlan.booking_id == booking.id, PaymentPlan.status == "Active").with_for_update().first()
                    if active_plan:
                        active_plan.status = "Cancelled"
                    pending = db.query(Payment).filter(Payment.tenant_id == row.tenant_id, Payment.booking_id == booking.id, Payment.status.in_(IN_FLIGHT_STATUSES)).with_for_update().all()
                    for payment in pending:
                        payment.status = "Rejected"
                        payment.notes = ((payment.notes or "") + "\nAutomatically rejected because the booking hold expired without verified funds.").strip()
                    log_audit(
                        db, row.tenant_id, None, "AUTO_EXPIRE", "bookings", booking.id,
                        "Pending booking cancelled and property released after customer hold expired.",
                        before_data={"status": before_status}, after_data={"status": "Cancelled"},
                    )
            row.status = "Expired - Payment Review" if payment_review_required else "Expired"
            row.hold_expires_at = None
            # Notify the property/booking owner, if one can be resolved from the linked match.
            match = db.query(PropertyMatch).filter(PropertyMatch.id == row.property_match_id, PropertyMatch.tenant_id == row.tenant_id).first()
            recipient_id = match.assigned_to if match else None
            recipient = db.query(User).filter(User.id == recipient_id, User.tenant_id == row.tenant_id, User.status == "Active").first() if recipient_id else None
            if recipient:
                db.add(Notification(tenant_id=row.tenant_id, recipient_user_id=recipient.id, workflow_id=None, title="Customer booking hold expired", message=(f"The 48-hour booking hold for property {row.property_id} expired. Staff review is required because verified funds remain." if payment_review_required else f"The 48-hour booking hold for property {row.property_id} expired and the property reservation was released."), notification_type="customer_booking_hold_expired", related_module="customer_booking_requests", related_record_id=row.id, is_read=False))
            log_audit(db, row.tenant_id, None, "AUTO_EXPIRE", "customer_booking_requests", row.id, "Customer booking request hold expired.", before_data={"status": "Approved"}, after_data={"status": row.status})
            expired += 1
        db.commit()
    return {"expired_holds": expired}


# Register after the function definition so module import order is deterministic.
JOBS["expire_customer_booking_holds"] = expire_customer_booking_holds


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
