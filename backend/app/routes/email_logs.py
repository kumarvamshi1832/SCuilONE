import logging
from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from pydantic import AliasChoices, BaseModel, ConfigDict, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_active_user
from app.core.permissions import require_permission
from app.core.rate_limiter import limiter
from app.database.connection import settings
from app.models.email_log import EmailLog
from app.models.tenant import Tenant
from app.services import email_log_service as svc
from app.services.audit_service import log_audit

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/emails", tags=["Emails"])
webhook_router = APIRouter(prefix="/api/v1/webhooks/email", tags=["Email Webhook"])


class EmailLinks(BaseModel):
    lead_id: UUID | None = None
    contact_id: UUID | None = None
    account_id: UUID | None = None
    deal_id: UUID | None = None

    def as_dict(self) -> dict:
        return {k: v for k, v in self.model_dump().items() if v}


class EmailLogCreate(EmailLinks):
    direction: Literal["Inbound", "Outbound"]
    subject: str = Field(default="", max_length=500)
    body_text: str = Field(default="", max_length=svc.MAX_BODY_CHARS)
    from_email: str | None = Field(default=None, max_length=255)
    to_emails: list[str] = Field(min_length=1, max_length=20)
    cc_emails: list[str] = Field(default_factory=list, max_length=20)
    message_id: str | None = Field(default=None, max_length=255)
    in_reply_to: str | None = Field(default=None, max_length=255)
    occurred_at: datetime | None = None


class EmailSend(EmailLinks):
    to: list[str] = Field(min_length=1, max_length=10)
    cc: list[str] = Field(default_factory=list, max_length=10)
    subject: str = Field(min_length=1, max_length=200)
    body: str = Field(min_length=1, max_length=20_000)
    in_reply_to_email_id: UUID | None = None


class EmailRelink(EmailLinks):
    pass


def _require_links_valid(db: Session, tenant_id: UUID, links: dict) -> None:
    svc.validate_links(db, tenant_id, **links)


def _get_email(db: Session, tenant_id: UUID, email_id: UUID) -> EmailLog:
    row = db.query(EmailLog).filter(EmailLog.id == email_id, EmailLog.tenant_id == tenant_id).first()
    if not row:
        raise HTTPException(status_code=404, detail="Email not found")
    return row


# ---------------------------------------------------------------- staff endpoints
@router.get("/webhook-info")
def webhook_info(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("email.manage")),
):
    """Shows this tenant's inbound-email webhook URL path and token (treat the token like a password)."""
    tenant_id = UUID(str(current_user["tenant_id"]))
    token = svc.webhook_token(tenant_id)
    if token is None:
        raise HTTPException(status_code=503, detail="Inbound email webhook is not configured on this server.")
    return {
        "method": "POST",
        "path": f"/api/v1/webhooks/email/inbound/{tenant_id}",
        "auth_header": "X-Webhook-Token",
        "token": token,
        "payload_example": {
            "from": "customer@example.com", "to": ["sales@yourcompany.com"], "subject": "Re: Quote",
            "text": "Plain text body", "message_id": "<abc123@mail.example.com>", "in_reply_to": "<xyz@yourcompany.com>",
        },
    }


@router.get("")
def list_emails(
    lead_id: UUID | None = None,
    contact_id: UUID | None = None,
    account_id: UUID | None = None,
    deal_id: UUID | None = None,
    direction: Literal["Inbound", "Outbound"] | None = None,
    unlinked: bool = False,
    q: str | None = Query(default=None, max_length=100),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("email.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    query = db.query(EmailLog).filter(EmailLog.tenant_id == tenant_id)
    for col, val in ((EmailLog.lead_id, lead_id), (EmailLog.contact_id, contact_id),
                     (EmailLog.account_id, account_id), (EmailLog.deal_id, deal_id)):
        if val:
            query = query.filter(col == val)
    if direction:
        query = query.filter(EmailLog.direction == direction)
    if unlinked:
        query = query.filter(
            EmailLog.lead_id.is_(None), EmailLog.contact_id.is_(None),
            EmailLog.account_id.is_(None), EmailLog.deal_id.is_(None),
        )
    if q:
        like = "%" + q.replace("%", r"\%").replace("_", r"\_") + "%"
        query = query.filter(EmailLog.subject.ilike(like, escape="\\"))
    rows = query.order_by(EmailLog.occurred_at.desc()).offset(skip).limit(limit).all()
    return [svc.summary(r) for r in rows]


@router.get("/threads/{thread_id}")
def get_thread(
    thread_id: str,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("email.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    rows = (
        db.query(EmailLog)
        .filter(EmailLog.tenant_id == tenant_id, EmailLog.thread_id == thread_id)
        .order_by(EmailLog.occurred_at.asc())
        .limit(200)
        .all()
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Thread not found")
    return [svc.detail(r) for r in rows]


@router.get("/{email_id}")
def get_email(
    email_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("email.view")),
    db: Session = Depends(get_db),
):
    return svc.detail(_get_email(db, UUID(str(current_user["tenant_id"])), email_id))


@router.post("/log", status_code=status.HTTP_201_CREATED)
def log_email_manually(
    payload: EmailLogCreate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("email.create")),
    db: Session = Depends(get_db),
):
    """Record an email that was sent or received outside the CRM (e.g. from your own mailbox)."""
    tenant_id = UUID(str(current_user["tenant_id"]))
    links = payload.as_dict()
    _require_links_valid(db, tenant_id, links)
    to_emails = svc.clean_addresses(payload.to_emails)
    if not to_emails:
        raise HTTPException(status_code=422, detail="At least one valid recipient address is required.")
    from_email = svc.clean_address(payload.from_email)
    if not links:
        links = svc.auto_link(db, tenant_id, [from_email] if payload.direction == "Inbound" and from_email else to_emails)
    row, created = svc.record_email(
        db, tenant_id, direction=payload.direction, status="Logged", source="manual",
        subject=payload.subject, body_text=payload.body_text, from_email=from_email,
        to_emails=to_emails, cc_emails=svc.clean_addresses(payload.cc_emails),
        message_id=svc.clean_message_id(payload.message_id),
        in_reply_to=svc.clean_message_id(payload.in_reply_to),
        links=links, sent_by=UUID(str(current_user["user_id"])), occurred_at=payload.occurred_at,
    )
    if not created:
        raise HTTPException(status_code=409, detail="An email with this Message-ID is already logged.")
    log_audit(db, tenant_id, current_user["user_id"], "CREATE", "email", row.id, description="Logged an email manually")
    db.commit()
    return svc.detail(row)


@router.post("/send", status_code=status.HTTP_201_CREATED)
@limiter.limit("20/minute")
def send_email(
    request: Request,
    response: Response,
    payload: EmailSend,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("email.create")),
    db: Session = Depends(get_db),
):
    """Send a plain-text email from the CRM and attach it to the related records."""
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))
    links = payload.as_dict()
    _require_links_valid(db, tenant_id, links)
    invalid = [a for a in [*payload.to, *payload.cc] if not svc.clean_address(a)]
    if invalid:
        raise HTTPException(status_code=422, detail=f"Invalid email address: {invalid[0][:80]}")
    to = svc.clean_addresses(payload.to, 10)
    cc = svc.clean_addresses(payload.cc, 10)
    if not links:
        links = svc.auto_link(db, tenant_id, to)

    in_reply_to = None
    if payload.in_reply_to_email_id:
        parent = _get_email(db, tenant_id, payload.in_reply_to_email_id)
        in_reply_to = parent.message_id
        for key in ("lead_id", "contact_id", "account_id", "deal_id"):
            links.setdefault(key, getattr(parent, key))
        links = {k: v for k, v in links.items() if v}

    subject = payload.subject.strip()
    try:
        message_id = svc.send_via_smtp(to, cc, subject, payload.body)
    except Exception as exc:  # SMTP failure: keep a record so the user can see it failed
        logger.warning("CRM email send failed: %s", type(exc).__name__)
        svc.record_email(
            db, tenant_id, direction="Outbound", status="Failed", source="smtp", subject=subject,
            body_text=payload.body, from_email=svc.clean_address(settings.SMTP_FROM_EMAIL), to_emails=to,
            cc_emails=cc, in_reply_to=in_reply_to, links=links, sent_by=user_id,
            error_message=f"{type(exc).__name__}",
        )
        db.commit()
        raise HTTPException(status_code=502, detail="The email could not be sent. It was saved as Failed in the timeline.")

    row, _created = svc.record_email(
        db, tenant_id, direction="Outbound", status="Sent", source="smtp", subject=subject,
        body_text=payload.body, from_email=svc.clean_address(settings.SMTP_FROM_EMAIL), to_emails=to,
        cc_emails=cc, message_id=svc.clean_message_id(message_id), in_reply_to=in_reply_to,
        links=links, sent_by=user_id,
    )
    log_audit(db, tenant_id, user_id, "SEND", "email", row.id, description=f"Sent email to {len(to)} recipient(s)")
    db.commit()
    return svc.detail(row)


@router.put("/{email_id}/link")
def relink_email(
    email_id: UUID,
    payload: EmailRelink,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("email.create")),
    db: Session = Depends(get_db),
):
    """Attach (or change) the records an email belongs to, e.g. for unmatched inbound mail."""
    tenant_id = UUID(str(current_user["tenant_id"]))
    row = _get_email(db, tenant_id, email_id)
    links = payload.as_dict()
    _require_links_valid(db, tenant_id, links)
    for key in ("lead_id", "contact_id", "account_id", "deal_id"):
        setattr(row, key, links.get(key))
    log_audit(db, tenant_id, current_user["user_id"], "UPDATE", "email", row.id, description="Changed email links")
    db.commit()
    return svc.summary(row)


@router.delete("/{email_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_email(
    email_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("email.delete")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    row = _get_email(db, tenant_id, email_id)
    log_audit(db, tenant_id, current_user["user_id"], "DELETE", "email", row.id,
              description="Deleted an email from the timeline", before_data={"subject": row.subject, "direction": row.direction})
    db.delete(row)
    db.commit()


# ---------------------------------------------------------------- inbound webhook
class InboundEmail(BaseModel):
    """Generic JSON shape; common field-name variants are accepted."""

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    from_email: str = Field(validation_alias=AliasChoices("from_email", "from", "sender"), max_length=500)
    to: list[str] | str = Field(default_factory=list, validation_alias=AliasChoices("to", "recipient", "recipients"))
    cc: list[str] | str = Field(default_factory=list)
    subject: str = Field(default="", max_length=1000)
    text: str | None = Field(default=None, validation_alias=AliasChoices("text", "body_text", "body-plain", "plain"), max_length=500_000)
    html: str | None = Field(default=None, validation_alias=AliasChoices("html", "body_html", "body-html"), max_length=1_000_000)
    message_id: str | None = Field(default=None, validation_alias=AliasChoices("message_id", "Message-Id", "message-id"), max_length=500)
    in_reply_to: str | None = Field(default=None, validation_alias=AliasChoices("in_reply_to", "In-Reply-To", "in-reply-to"), max_length=500)
    date: datetime | None = None


@webhook_router.post("/inbound/{tenant_id}")
@limiter.limit("120/minute")
def inbound_email_webhook(
    request: Request,
    response: Response,
    tenant_id: UUID,
    payload: InboundEmail,
    x_webhook_token: str | None = Header(default=None),
    token: str | None = Query(default=None),
    db: Session = Depends(get_db),
):
    if settings.EMAIL_WEBHOOK_SECRET is None:
        raise HTTPException(status_code=503, detail="Inbound email webhook is not configured.")
    if not svc.verify_webhook_token(tenant_id, x_webhook_token or token):
        raise HTTPException(status_code=401, detail="Invalid webhook token.")
    if not db.query(Tenant.id).filter(Tenant.id == tenant_id).first():
        raise HTTPException(status_code=404, detail="Unknown workspace.")

    from_email = svc.clean_address(payload.from_email)
    if not from_email:
        raise HTTPException(status_code=422, detail="A valid sender address is required.")
    to_emails = svc.clean_addresses(payload.to)
    body = payload.text if payload.text is not None else svc.html_to_text(payload.html or "")
    occurred = None
    if payload.date:
        from datetime import timezone
        occurred = (
            payload.date.astimezone(timezone.utc).replace(tzinfo=None)
            if payload.date.tzinfo else payload.date
        )

    try:
        row, created = svc.record_email(
            db, tenant_id, direction="Inbound", status="Received", source="webhook",
            subject=payload.subject, body_text=body, from_email=from_email, to_emails=to_emails,
            cc_emails=svc.clean_addresses(payload.cc),
            message_id=svc.clean_message_id(payload.message_id),
            in_reply_to=svc.clean_message_id(payload.in_reply_to),
            links=svc.auto_link(db, tenant_id, [from_email]), occurred_at=occurred,
        )
        db.commit()
    except IntegrityError:  # same Message-ID delivered twice at the same moment
        db.rollback()
        return {"status": "duplicate"}
    return {"status": "created" if created else "duplicate", "id": row.id, "linked": bool(row.contact_id or row.lead_id)}
