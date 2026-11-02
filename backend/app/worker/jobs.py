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


JOBS = {
    "expire_estimates": expire_sent_estimates,
    "overdue_invoices": overdue_invoice_alerts,
    "due_reminders": upcoming_due_reminders,
    "escalate_overdue": escalate_overdue_invoices,
    "customer_reminders": customer_payment_reminders,
}
