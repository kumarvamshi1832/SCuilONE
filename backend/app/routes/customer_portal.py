import hashlib
import secrets
import uuid
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import jwt
from sqlalchemy import func
from sqlalchemy.orm import Session, selectinload

from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.core.security import create_access_token, decode_access_token, hash_password, verify_password
from app.core.password_policy import ensure_password_policy
from app.core.rate_limiter import limiter
from app.database.connection import SessionLocal, settings
from app.models.account import Account
from app.models.contact import Contact
from app.models.customer_portal import CustomerPortalInvitation, CustomerPortalSession, CustomerPortalUser
from app.models.support_ticket import SupportTicket, SupportTicketComment
from app.models.user import User
from app.schemas.customer_portal import (
    PortalActivateRequest, PortalCommentCreate, PortalCommentResponse,
    PortalInviteCreate, PortalInviteResponse, PortalLoginRequest,
    PortalLogoutRequest, PortalRefreshRequest, PortalTicketCreate,
    PortalTicketDetailResponse, PortalTicketListResponse, PortalTicketResponse,
)
from app.services.email_service import send_customer_portal_invitation_email

router = APIRouter(prefix="/api/v1/customer-portal", tags=["Customer Portal"])
portal_security = HTTPBearer(auto_error=False)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def now_utc():
    return datetime.now(timezone.utc)


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def staff_context(current_user: dict) -> tuple[UUID, UUID]:
    try:
        return UUID(str(current_user["tenant_id"])), UUID(str(current_user["user_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid user or tenant information.")


def require_portal_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(portal_security),
    db: Session = Depends(get_db),
) -> dict:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Customer portal authentication required.")
    payload = decode_access_token(credentials.credentials)
    if payload.get("portal_type") != "customer" or payload.get("token_type") != "access":
        raise HTTPException(status_code=401, detail="Invalid customer portal token.")
    try:
        portal_user_id = UUID(str(payload["portal_user_id"]))
        tenant_id = UUID(str(payload["tenant_id"]))
        account_id = UUID(str(payload["account_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid customer portal token data.")
    portal_user = db.query(CustomerPortalUser).filter(
        CustomerPortalUser.id == portal_user_id,
        CustomerPortalUser.tenant_id == tenant_id,
        CustomerPortalUser.account_id == account_id,
        CustomerPortalUser.status == "Active",
    ).first()
    if not portal_user:
        raise HTTPException(status_code=401, detail="Customer portal account is inactive or unavailable.")
    contact = db.query(Contact).filter(
        Contact.id == portal_user.contact_id, Contact.tenant_id == portal_user.tenant_id,
        Contact.account_id == portal_user.account_id,
    ).first()
    account = db.query(Account).filter(
        Account.id == portal_user.account_id, Account.tenant_id == portal_user.tenant_id,
    ).first()
    if not contact or not account:
        raise HTTPException(status_code=403, detail="Your contact is no longer associated with an available Account.")
    return {"portal_user_id": portal_user.id, "tenant_id": portal_user.tenant_id,
            "account_id": portal_user.account_id, "contact_id": portal_user.contact_id,
            "email": portal_user.email}


def make_access_token(portal_user: CustomerPortalUser) -> str:
    return create_access_token({
        "portal_type": "customer", "token_type": "access",
        "portal_user_id": str(portal_user.id), "tenant_id": str(portal_user.tenant_id),
        "account_id": str(portal_user.account_id), "contact_id": str(portal_user.contact_id),
    })


def make_refresh_token(portal_user: CustomerPortalUser, db: Session) -> str:
    raw = secrets.token_urlsafe(48)
    session = CustomerPortalSession(
        portal_user_id=portal_user.id, tenant_id=portal_user.tenant_id,
        token_hash=token_hash(raw), expires_at=now_utc() + timedelta(days=30),
    )
    db.add(session)
    db.flush()
    return raw


def invite_response(portal_user: CustomerPortalUser, invitation: CustomerPortalInvitation) -> PortalInviteResponse:
    return PortalInviteResponse(
        portal_user_id=portal_user.id, contact_id=portal_user.contact_id,
        account_id=portal_user.account_id, email=portal_user.email,
        status=portal_user.status, invitation_expires_at=invitation.expires_at,
    )


@router.post("/invitations", response_model=PortalInviteResponse, status_code=201,
             dependencies=[Depends(require_permission("customer_portal.invite"))])
async def invite_customer_contact(payload: PortalInviteCreate,
                                  current_user: dict = Depends(require_active_user),
                                  db: Session = Depends(get_db)):
    tenant_id, staff_user_id = staff_context(current_user)
    contact = db.query(Contact).filter(Contact.id == payload.contact_id, Contact.tenant_id == tenant_id).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found in this tenant.")
    if not contact.account_id:
        raise HTTPException(status_code=400, detail="The contact must belong to an Account before portal access can be invited.")
    account = db.query(Account).filter(Account.id == contact.account_id, Account.tenant_id == tenant_id).first()
    if not account:
        raise HTTPException(status_code=400, detail="Contact Account is not available in this tenant.")
    if not contact.email or not contact.email.strip():
        raise HTTPException(status_code=400, detail="The contact needs an email address before an invitation can be sent.")
    email = contact.email.strip().lower()
    portal_user = db.query(CustomerPortalUser).filter(
        CustomerPortalUser.tenant_id == tenant_id, CustomerPortalUser.contact_id == contact.id
    ).first()
    duplicate_email_query = db.query(CustomerPortalUser).filter(
        CustomerPortalUser.tenant_id == tenant_id, func.lower(CustomerPortalUser.email) == email
    )
    if portal_user:
        duplicate_email_query = duplicate_email_query.filter(CustomerPortalUser.id != portal_user.id)
    if duplicate_email_query.first():
        raise HTTPException(status_code=409, detail="This email is already linked to another portal contact in this tenant.")
    if portal_user and portal_user.status == "Active":
        raise HTTPException(status_code=409, detail="This contact already has an active customer portal account.")
    if portal_user:
        portal_user.email = email
        portal_user.account_id = account.id
        portal_user.status = "Invited"
    else:
        portal_user = CustomerPortalUser(tenant_id=tenant_id, account_id=account.id, contact_id=contact.id, email=email, status="Invited")
        db.add(portal_user)
        db.flush()
    db.query(CustomerPortalInvitation).filter(
        CustomerPortalInvitation.portal_user_id == portal_user.id,
        CustomerPortalInvitation.used_at.is_(None), CustomerPortalInvitation.revoked.is_(False),
    ).update({"revoked": True}, synchronize_session=False)
    raw_token = secrets.token_urlsafe(40)
    invitation = CustomerPortalInvitation(
        tenant_id=tenant_id, portal_user_id=portal_user.id, token_hash=token_hash(raw_token),
        expires_at=now_utc() + timedelta(hours=48), invited_by_user_id=staff_user_id,
    )
    db.add(invitation)
    try:
        db.flush()
        await send_customer_portal_invitation_email(email, contact.full_name, raw_token, str(tenant_id))
        db.commit()
        db.refresh(portal_user)
        db.refresh(invitation)
        return invite_response(portal_user, invitation)
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=502, detail="Invitation could not be completed. Check the email service and try again.") from exc


@router.post("/auth/activate", status_code=200)
@limiter.limit("5/minute")
def activate_customer_portal(request: Request, payload: PortalActivateRequest, db: Session = Depends(get_db)):
    invitation = db.query(CustomerPortalInvitation).filter(
        CustomerPortalInvitation.token_hash == token_hash(payload.token),
        CustomerPortalInvitation.revoked.is_(False), CustomerPortalInvitation.used_at.is_(None),
        CustomerPortalInvitation.expires_at > now_utc(),
    ).first()
    if not invitation:
        raise HTTPException(status_code=400, detail="Invitation token is invalid, expired, or already used.")
    portal_user = db.query(CustomerPortalUser).filter(
        CustomerPortalUser.id == invitation.portal_user_id,
        CustomerPortalUser.tenant_id == invitation.tenant_id,
        CustomerPortalUser.status == "Invited",
    ).first()
    if not portal_user:
        raise HTTPException(status_code=400, detail="This invitation is no longer valid.")
    ensure_password_policy(payload.password, [portal_user.email])
    portal_user.password_hash = hash_password(payload.password)
    portal_user.status = "Active"
    portal_user.activated_at = now_utc()
    invitation.used_at = now_utc()
    db.query(CustomerPortalInvitation).filter(
        CustomerPortalInvitation.portal_user_id == portal_user.id,
        CustomerPortalInvitation.id != invitation.id,
        CustomerPortalInvitation.used_at.is_(None),
    ).update({"revoked": True}, synchronize_session=False)
    try:
        db.commit()
        return {"message": "Customer portal account activated. You can now sign in.", "tenant_id": str(portal_user.tenant_id)}
    except Exception:
        db.rollback()
        raise


@router.post("/auth/login")
@limiter.limit("5/minute")
def customer_portal_login(request: Request, payload: PortalLoginRequest, db: Session = Depends(get_db)):
    email = str(payload.email).strip().lower()
    portal_user = db.query(CustomerPortalUser).filter(CustomerPortalUser.tenant_id == payload.tenant_id, func.lower(CustomerPortalUser.email) == email).first()
    if not portal_user or portal_user.status != "Active" or not portal_user.password_hash or not verify_password(payload.password, portal_user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    portal_user.last_login_at = now_utc()
    try:
        refresh_token = make_refresh_token(portal_user, db)
        db.commit()
        return {"access_token": make_access_token(portal_user), "token_type": "bearer", "refresh_token": refresh_token,
                "expires_in_minutes": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES,
                "customer": {"id": str(portal_user.id), "email": portal_user.email,
                             "tenant_id": str(portal_user.tenant_id), "account_id": str(portal_user.account_id),
                             "contact_id": str(portal_user.contact_id)}}
    except Exception:
        db.rollback()
        raise


@router.post("/auth/refresh")
def customer_portal_refresh(payload: PortalRefreshRequest, db: Session = Depends(get_db)):
    session = db.query(CustomerPortalSession).filter(
        CustomerPortalSession.token_hash == token_hash(payload.refresh_token),
        CustomerPortalSession.revoked.is_(False), CustomerPortalSession.expires_at > now_utc(),
    ).first()
    if not session:
        raise HTTPException(status_code=401, detail="Refresh token is invalid, expired, or revoked.")
    portal_user = db.query(CustomerPortalUser).filter(
        CustomerPortalUser.id == session.portal_user_id, CustomerPortalUser.tenant_id == session.tenant_id,
        CustomerPortalUser.status == "Active",
    ).first()
    if not portal_user:
        session.revoked = True
        db.commit()
        raise HTTPException(status_code=401, detail="Customer portal account is inactive.")
    session.revoked = True
    new_refresh = make_refresh_token(portal_user, db)
    try:
        db.commit()
        return {"access_token": make_access_token(portal_user), "token_type": "bearer", "refresh_token": new_refresh,
                "expires_in_minutes": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES}
    except Exception:
        db.rollback()
        raise


@router.post("/auth/logout", status_code=200)
def customer_portal_logout(payload: PortalLogoutRequest, db: Session = Depends(get_db)):
    session = db.query(CustomerPortalSession).filter(
        CustomerPortalSession.token_hash == token_hash(payload.refresh_token),
        CustomerPortalSession.revoked.is_(False),
    ).first()
    if session:
        session.revoked = True
        db.commit()
    return {"message": "Logged out."}


@router.get("/me")
def customer_portal_me(portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    contact = db.query(Contact).filter(Contact.id == portal["contact_id"], Contact.tenant_id == portal["tenant_id"]).first()
    account = db.query(Account).filter(Account.id == portal["account_id"], Account.tenant_id == portal["tenant_id"]).first()
    return {"id": str(portal["portal_user_id"]), "email": portal["email"],
            "contact": {"id": str(contact.id), "full_name": contact.full_name} if contact else None,
            "account": {"id": str(account.id), "name": account.name} if account else None}


def portal_ticket_query(db: Session, portal: dict):
    # Account-wide sharing is deliberate: all portal contacts for this same Account see the same tickets.
    return db.query(SupportTicket).filter(
        SupportTicket.tenant_id == portal["tenant_id"],
        SupportTicket.account_id == portal["account_id"],
    )


@router.post("/tickets", response_model=PortalTicketResponse, status_code=201)
def create_portal_ticket(payload: PortalTicketCreate, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    if payload.category not in {"General", "Bug", "Technical Support", "Billing", "Feature Request", "Account Access", "Other"}:
        raise HTTPException(status_code=422, detail="Unsupported ticket category.")
    if payload.priority not in {"Low", "Medium", "High", "Urgent"}:
        raise HTTPException(status_code=422, detail="Unsupported ticket priority.")
    contact = db.query(Contact).filter(Contact.id == portal["contact_id"], Contact.tenant_id == portal["tenant_id"]).first()
    if not contact or contact.account_id != portal["account_id"]:
        raise HTTPException(status_code=403, detail="Your contact is no longer associated with this Account.")
    ticket = SupportTicket(
        tenant_id=portal["tenant_id"], ticket_number=f"SUP-{datetime.utcnow():%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        subject=payload.subject, description=payload.description, category=payload.category,
        status="Open", priority=payload.priority, source="Client Portal", requester_name=contact.full_name,
        requester_email=portal["email"], account_id=portal["account_id"], contact_id=portal["contact_id"],
    )
    try:
        db.add(ticket)
        db.commit()
        db.refresh(ticket)
        return ticket
    except Exception:
        db.rollback()
        raise


@router.get("/tickets", response_model=PortalTicketListResponse)
def list_portal_tickets(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0),
                        portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    query = portal_ticket_query(db, portal)
    total = query.count()
    items = query.order_by(SupportTicket.updated_at.desc()).offset(offset).limit(limit).all()
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/tickets/{ticket_id}", response_model=PortalTicketDetailResponse)
def get_portal_ticket(ticket_id: UUID, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    ticket = portal_ticket_query(db, portal).options(selectinload(SupportTicket.comments)).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found for your Account.")
    visible_comments = [comment for comment in ticket.comments if not comment.is_internal]
    return {
        "id": ticket.id, "ticket_number": ticket.ticket_number, "subject": ticket.subject,
        "description": ticket.description, "category": ticket.category, "status": ticket.status,
        "priority": ticket.priority, "requester_name": ticket.requester_name,
        "account_id": ticket.account_id, "contact_id": ticket.contact_id,
        "software_project_id": ticket.software_project_id, "resolution": ticket.resolution,
        "resolved_at": ticket.resolved_at, "closed_at": ticket.closed_at,
        "created_at": ticket.created_at, "updated_at": ticket.updated_at,
        "comments": visible_comments,
    }


@router.get("/tickets/{ticket_id}/comments", response_model=list[PortalCommentResponse])
def list_portal_ticket_comments(ticket_id: UUID, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    ticket = portal_ticket_query(db, portal).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found for your Account.")
    return db.query(SupportTicketComment).filter(
        SupportTicketComment.ticket_id == ticket.id, SupportTicketComment.tenant_id == portal["tenant_id"],
        SupportTicketComment.is_internal.is_(False),
    ).order_by(SupportTicketComment.created_at.asc()).all()


@router.post("/tickets/{ticket_id}/comments", response_model=PortalCommentResponse, status_code=201)
def add_portal_ticket_comment(ticket_id: UUID, payload: PortalCommentCreate,
                              portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    ticket = portal_ticket_query(db, portal).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found for your Account.")
    if ticket.status == "Closed":
        raise HTTPException(status_code=409, detail="Closed tickets cannot receive new comments.")
    comment = SupportTicketComment(
        tenant_id=portal["tenant_id"], ticket_id=ticket.id,
        author_customer_portal_user_id=portal["portal_user_id"], body=payload.body, is_internal=False,
    )
    try:
        db.add(comment)
        ticket.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(comment)
        return comment
    except Exception:
        db.rollback()
        raise


@router.get("/invitations", dependencies=[Depends(require_permission("customer_portal.invite"))])
def list_customer_portal_users(current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, _ = staff_context(current_user)
    rows = db.query(CustomerPortalUser, Contact, Account).join(
        Contact, (Contact.id == CustomerPortalUser.contact_id) & (Contact.tenant_id == CustomerPortalUser.tenant_id)
    ).join(
        Account, (Account.id == CustomerPortalUser.account_id) & (Account.tenant_id == CustomerPortalUser.tenant_id)
    ).filter(CustomerPortalUser.tenant_id == tenant_id).order_by(CustomerPortalUser.created_at.desc()).all()
    return [{"portal_user_id": str(user.id), "contact_id": str(contact.id), "contact_name": contact.full_name,
             "account_id": str(account.id), "account_name": account.name, "email": user.email,
             "status": user.status, "created_at": user.created_at, "activated_at": user.activated_at,
             "last_login_at": user.last_login_at} for user, contact, account in rows]


@router.patch("/users/{portal_user_id}/status", dependencies=[Depends(require_permission("customer_portal.manage"))])
def update_portal_user_status(portal_user_id: UUID, status_value: str = Query(..., alias="status", pattern="^(Active|Suspended)$"),
                              current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, _ = staff_context(current_user)
    portal_user = db.query(CustomerPortalUser).filter(
        CustomerPortalUser.id == portal_user_id, CustomerPortalUser.tenant_id == tenant_id
    ).first()
    if not portal_user:
        raise HTTPException(status_code=404, detail="Customer portal user not found.")
    if status_value == "Active" and not portal_user.password_hash:
        raise HTTPException(status_code=409, detail="A portal user must activate their invitation before being enabled.")
    portal_user.status = status_value
    if status_value == "Suspended":
        db.query(CustomerPortalSession).filter(CustomerPortalSession.portal_user_id == portal_user.id).update({"revoked": True}, synchronize_session=False)
    db.commit()
    return {"id": str(portal_user.id), "status": portal_user.status}
