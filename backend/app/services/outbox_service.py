"""Phase 14 background automation services:
- Transactional NotificationOutbox enqueue & retry-safe exponential-backoff processor
- Automated expiry of stale AgencyInvitation links and expired CompanyAgencyConnection records
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from typing import Callable
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.agency import (
    AgencyInvitation,
    AgencyPropertyAccess,
    CompanyAgencyConnection,
)
from app.models.notification import Notification
from app.models.notification_outbox import NotificationOutbox
from app.services.agency_collaboration import notify_agency


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def enqueue_outbox_event(
    db: Session,
    *,
    channel: str,
    event_type: str,
    title: str,
    message: str,
    tenant_id: UUID | None = None,
    agency_id: UUID | None = None,
    connection_id: UUID | None = None,
    property_id: UUID | None = None,
    recipient_user_id: UUID | None = None,
    recipient_email: str | None = None,
    payload: dict | None = None,
    idempotency_key: str | None = None,
    max_attempts: int = 5,
) -> NotificationOutbox:
    """Idempotently enqueue a notification inside the caller's DB transaction."""
    if idempotency_key:
        existing = db.query(NotificationOutbox).filter(NotificationOutbox.idempotency_key == idempotency_key).first()
        if existing:
            return existing
    row = NotificationOutbox(
        tenant_id=tenant_id,
        agency_id=agency_id,
        connection_id=connection_id,
        property_id=property_id,
        channel=channel,
        event_type=event_type,
        recipient_user_id=recipient_user_id,
        recipient_email=recipient_email,
        title=title,
        message=message,
        payload=payload or {},
        idempotency_key=idempotency_key,
        status="Pending",
        attempts=0,
        max_attempts=max_attempts,
        next_attempt_at=_utc_now(),
    )
    db.add(row)
    db.flush()
    return row


def process_notification_outbox(
    db: Session,
    *,
    batch_size: int = 50,
    now: datetime | None = None,
    email_sender: Callable[[NotificationOutbox], None] | None = None,
) -> dict:
    """Deliver due outbox items with idempotency, exponential backoff retries, and DeadLetter handling."""
    now = now or _utc_now()
    due = (
        db.query(NotificationOutbox)
        .filter(
            NotificationOutbox.status.in_(("Pending", "Failed")),
            NotificationOutbox.next_attempt_at <= now,
        )
        .order_by(NotificationOutbox.next_attempt_at.asc())
        .limit(batch_size)
        .with_for_update()
        .all()
    )

    sent_count = 0
    failed_count = 0
    dead_letter_count = 0

    for item in due:
        item.attempts += 1
        try:
            if item.channel == "agency_in_app":
                if not item.agency_id:
                    raise ValueError("agency_id is required for agency_in_app channel.")
                notify_agency(
                    db,
                    item.agency_id,
                    item.event_type,
                    item.title,
                    item.message,
                    connection_id=item.connection_id,
                    property_id=item.property_id,
                    payload=item.payload,
                    idempotency_key=f"outbox:{item.id}",
                )
            elif item.channel == "in_app":
                if not item.tenant_id or not item.recipient_user_id:
                    raise ValueError("tenant_id and recipient_user_id are required for in_app channel.")
                db.add(
                    Notification(
                        tenant_id=item.tenant_id,
                        recipient_user_id=item.recipient_user_id,
                        title=item.title,
                        message=item.message,
                        related_module=item.event_type,
                        related_record_id=item.connection_id or item.property_id,
                    )
                )
            elif item.channel == "email":
                if email_sender is not None:
                    email_sender(item)
                elif item.recipient_email:
                    from app.services.email_service import send_notification_email

                    send_notification_email(item.recipient_email, item.title, item.message)
            item.status = "Sent"
            item.sent_at = now
            item.last_error = None
            sent_count += 1
        except Exception as exc:
            item.last_error = str(exc)[:1000]
            if item.attempts >= item.max_attempts:
                item.status = "DeadLetter"
                dead_letter_count += 1
            else:
                item.status = "Failed"
                backoff_minutes = min(60, 2 ** item.attempts)
                item.next_attempt_at = now + timedelta(minutes=backoff_minutes)
                failed_count += 1
        db.flush()

    return {"processed": len(due), "sent": sent_count, "failed": failed_count, "dead_letter": dead_letter_count}


def expire_stale_agency_invitations_and_connections(
    db: Session, *, now: datetime | None = None, today: date | None = None
) -> dict:
    """Idempotent worker job expiring stale invitation links and expired company-agency connections."""
    now = now or _utc_now()
    today = today or now.date()

    expired_invites = (
        db.query(AgencyInvitation)
        .filter(
            AgencyInvitation.status.in_(("Sent", "Opened")),
            AgencyInvitation.expires_at <= now,
        )
        .update({AgencyInvitation.status: "Expired", AgencyInvitation.updated_at: now}, synchronize_session=False)
    )

    expired_conns = (
        db.query(CompanyAgencyConnection)
        .filter(
            CompanyAgencyConnection.status == "Active",
            CompanyAgencyConnection.expires_at.isnot(None),
            CompanyAgencyConnection.expires_at < today,
        )
        .with_for_update()
        .all()
    )
    for conn in expired_conns:
        conn.status = "Expired"
        conn.updated_at = now
        db.query(AgencyPropertyAccess).filter(
            AgencyPropertyAccess.connection_id == conn.id,
            AgencyPropertyAccess.access_status == "Active",
        ).update(
            {AgencyPropertyAccess.access_status: "Revoked", AgencyPropertyAccess.revoked_at: now},
            synchronize_session=False,
        )
        enqueue_outbox_event(
            db,
            channel="agency_in_app",
            event_type="connection_expired",
            agency_id=conn.agency_id,
            connection_id=conn.id,
            title="Company connection expired",
            message="Your company-agency connection reached its expiry date. Historical records and earned commissions remain preserved.",
            idempotency_key=f"conn_expired:{conn.id}",
        )

    db.flush()
    return {"expired_invitations": int(expired_invites or 0), "expired_connections": len(expired_conns)}