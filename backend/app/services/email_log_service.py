"""Email timeline: log, send and receive emails and attach them to CRM records."""
import hashlib
import hmac
import html
import re
import uuid
from datetime import datetime
from email.message import EmailMessage
from email.utils import make_msgid, parseaddr

from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database.connection import settings
from app.models.account import Account
from app.models.contact import Contact
from app.models.deal import Deal
from app.models.email_log import EmailLog
from app.models.lead import Lead

_EMAIL_RE = re.compile(r"^[^@\s<>]+@[^@\s<>]+\.[^@\s<>]+$")
_SUBJECT_PREFIX_RE = re.compile(r"^\s*((re|fwd?|fw)\s*:\s*)+", re.IGNORECASE)
MAX_BODY_CHARS = 100_000


# ----------------------------------------------------------------- webhook auth
def webhook_token(tenant_id: uuid.UUID) -> str | None:
    # A dedicated webhook secret is preferred. The required JWT secret is a safe
    # fallback so /api/v1/emails/webhook-info does not fail with 503 on existing
    # installations that have not yet added EMAIL_WEBHOOK_SECRET to .env.
    secret = settings.EMAIL_WEBHOOK_SECRET or settings.JWT_SECRET_KEY
    if not secret:
        return None
    return hmac.new(secret.encode(), f"email-inbound:{tenant_id}".encode(), hashlib.sha256).hexdigest()


def verify_webhook_token(tenant_id: uuid.UUID, token: str | None) -> bool:
    expected = webhook_token(tenant_id)
    return bool(expected and token and hmac.compare_digest(expected, token.strip()))


# ----------------------------------------------------------------- cleaning
def clean_address(value: str | None) -> str | None:
    if not value:
        return None
    _, addr = parseaddr(str(value))
    addr = addr.strip().lower()
    return addr if _EMAIL_RE.match(addr) and len(addr) <= 255 else None


def clean_addresses(values, max_items: int = 20) -> list[str]:
    if isinstance(values, str):
        values = re.split(r"[;,]", values)
    cleaned: list[str] = []
    for v in values or []:
        addr = clean_address(v)
        if addr and addr not in cleaned:
            cleaned.append(addr)
    return cleaned[:max_items]


def clean_message_id(value: str | None) -> str | None:
    if not value:
        return None
    v = re.sub(r"[\r\n\s]+", "", str(value))[:255]
    return v or None


def html_to_text(raw: str) -> str:
    text = re.sub(r"(?is)<(script|style).*?>.*?</\1>", " ", raw)
    text = re.sub(r"(?i)<br\s*/?>|</p>|</div>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    return re.sub(r"\n{3,}", "\n\n", html.unescape(text)).strip()


def normalize_subject(subject: str | None) -> str:
    return _SUBJECT_PREFIX_RE.sub("", subject or "").strip()


# ----------------------------------------------------------------- linking
def validate_links(db: Session, tenant_id: uuid.UUID, *, lead_id=None, contact_id=None, account_id=None, deal_id=None) -> None:
    for model, rid, name in ((Lead, lead_id, "Lead"), (Contact, contact_id, "Contact"),
                             (Account, account_id, "Account"), (Deal, deal_id, "Deal")):
        if rid and not db.query(model.id).filter(model.id == rid, model.tenant_id == tenant_id).first():
            raise HTTPException(status_code=404, detail=f"{name} not found")


def auto_link(db: Session, tenant_id: uuid.UUID, addresses: list[str]) -> dict:
    """Find the most recently updated contact / lead whose email matches one of the addresses."""
    links: dict = {}
    for addr in addresses:
        if "contact_id" not in links:
            contact = (
                db.query(Contact)
                .filter(Contact.tenant_id == tenant_id, func.lower(Contact.email) == addr)
                .order_by(Contact.updated_at.desc())
                .first()
            )
            if contact:
                links["contact_id"] = contact.id
                if contact.account_id:
                    links["account_id"] = contact.account_id
        if "lead_id" not in links:
            lead = (
                db.query(Lead)
                .filter(Lead.tenant_id == tenant_id, func.lower(Lead.email) == addr)
                .order_by(Lead.updated_at.desc())
                .first()
            )
            if lead:
                links["lead_id"] = lead.id
    return links


# ----------------------------------------------------------------- persistence
def resolve_thread_id(db: Session, tenant_id: uuid.UUID, in_reply_to: str | None) -> str:
    if in_reply_to:
        row = (
            db.query(EmailLog.thread_id)
            .filter(EmailLog.tenant_id == tenant_id, EmailLog.message_id == in_reply_to)
            .first()
        )
        if row:
            return row[0]
    return uuid.uuid4().hex


def record_email(
    db: Session,
    tenant_id: uuid.UUID,
    *,
    direction: str,
    status: str,
    source: str,
    subject: str,
    body_text: str,
    from_email: str | None,
    to_emails: list[str],
    cc_emails: list[str] | None = None,
    message_id: str | None = None,
    in_reply_to: str | None = None,
    links: dict | None = None,
    sent_by: uuid.UUID | None = None,
    occurred_at: datetime | None = None,
    error_message: str | None = None,
) -> tuple[EmailLog, bool]:
    """Create an email log row. Returns (row, created). A repeated message_id returns the existing row."""
    if message_id:
        existing = (
            db.query(EmailLog)
            .filter(EmailLog.tenant_id == tenant_id, EmailLog.message_id == message_id)
            .first()
        )
        if existing:
            return existing, False

    links = links or {}
    row = EmailLog(
        tenant_id=tenant_id,
        direction=direction,
        status=status,
        source=source,
        subject=(subject or "")[:500],
        body_text=(body_text or "")[:MAX_BODY_CHARS],
        from_email=from_email,
        to_emails=to_emails,
        cc_emails=cc_emails or [],
        message_id=message_id,
        in_reply_to=in_reply_to,
        thread_id=resolve_thread_id(db, tenant_id, in_reply_to),
        error_message=(error_message or None) and error_message[:500],
        lead_id=links.get("lead_id"),
        contact_id=links.get("contact_id"),
        account_id=links.get("account_id"),
        deal_id=links.get("deal_id"),
        sent_by=sent_by,
        occurred_at=occurred_at or datetime.utcnow(),
    )
    db.add(row)
    db.flush()
    return row, True


# ----------------------------------------------------------------- sending
def send_via_smtp(to: list[str], cc: list[str], subject: str, body: str) -> str:
    """Send a plain-text email through the platform SMTP relay. Returns the Message-ID used."""
    from app.services.email_service import _deliver_smtp_message  # shared SMTP sender (supports test hooks)

    message_id = make_msgid(domain=(settings.SMTP_FROM_EMAIL.split("@")[-1] or "scuilone.local"))
    msg = EmailMessage()
    msg["From"] = settings.SMTP_FROM_EMAIL
    msg["To"] = ", ".join(to)
    if cc:
        msg["Cc"] = ", ".join(cc)
    msg["Subject"] = re.sub(r"[\r\n]+", " ", subject).strip()
    msg["Message-ID"] = message_id
    msg.set_content(body)
    _deliver_smtp_message(msg, {"type": "crm_email"})
    return message_id


def summary(row: EmailLog) -> dict:
    return {
        "id": row.id, "direction": row.direction, "status": row.status, "source": row.source,
        "subject": row.subject, "body_preview": (row.body_text or "")[:200],
        "from_email": row.from_email, "to_emails": row.to_emails, "cc_emails": row.cc_emails,
        "thread_id": row.thread_id, "occurred_at": row.occurred_at,
        "lead_id": row.lead_id, "contact_id": row.contact_id,
        "account_id": row.account_id, "deal_id": row.deal_id, "sent_by": row.sent_by,
    }


def detail(row: EmailLog) -> dict:
    return {**summary(row), "body_text": row.body_text, "message_id": row.message_id,
            "in_reply_to": row.in_reply_to, "error_message": row.error_message}
