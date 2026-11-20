import calendar
import hashlib
import hmac
import logging
import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID
from fastapi import Response
from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.core.dependencies import require_active_user
from app.core.password_policy import ensure_password_policy
from app.core.permissions import require_permission
# from app.core.platform_rbac import auto_route_support_ticket
from app.models.role import Role
from app.models.user_role import UserRole
from app.core.rate_limiter import limiter
from app.core.security import (
    create_access_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.database.connection import SessionLocal, settings
from app.models.account import Account
from app.models.booking import Booking
from app.models.buyer_requirement import BuyerRequirement
from app.models.contact import Contact
from app.models.customer_portal import (
    CustomerPortalInvitation,
    CustomerPortalPasswordReset,
    CustomerPortalSession,
    CustomerPortalUser,
)
from app.models.deal import Deal
from app.models.document import Document
from app.models.lead import Lead
from app.models.notification import Notification
from app.models.payment import Payment
from app.models.payment_refund import PaymentRefund
from app.models.payment_plan import PaymentPlan, PaymentPlanInstallment
from app.models.property import Property
from app.models.rental import (
    RentalAgreement, RentalPaymentSchedule, RentalPayment, RentalExitRequest, RentalAgreementRevision, RentalInspection, RentalSettlement
)
from app.models.property_image import PropertyImage
from app.models.customer_property_shortlist import CustomerPropertyShortlist
from app.models.customer_booking_journey import CustomerSiteVisitFeedback
from app.models.property_match import PropertyMatch
from app.models.property_offer import PropertyOffer
from app.models.site_visit import SiteVisit
from app.models.software_contract import SoftwareContract
from app.models.software_estimate import SoftwareEstimate
from app.models.software_invoice import SoftwareInvoice
from app.models.software_project import SoftwareProject
from app.models.software_sprint import SoftwareSprint
from app.models.support_ticket import SupportTicket, SupportTicketComment
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.customer_portal import (
    PortalActivateRequest,
    PortalChangePasswordRequest,
    PortalCommentCreate,
    PortalBuyerRequirementCreate,
    PortalCommentResponse,
    PortalContractResponse,
    PortalContractSignRequest,
    PortalDocumentResponse,
    PortalEstimateDecisionRequest,
    PortalEstimateResponse,
    PortalForgotPasswordRequest,
    PortalInviteCreate,
    PortalInviteResponse,
    PortalInvoiceResponse,
    PortalLoginRequest,
    PortalLogoutRequest,
    PortalProfileUpdateRequest,
    PortalProjectDetailResponse,
    PortalProjectResponse,
    PortalSiteVisitRequest,
    PortalShortlistAddRequest,
    PortalRefreshRequest,
    PortalResetPasswordRequest,
    PortalSwitchWorkspaceRequest,
    PortalTicketCreate,
    PortalTicketDecisionRequest,
    PortalTicketDetailResponse,
    PortalTicketListResponse,
    PortalTicketResponse,
)
from app.schemas.property_offer import PropertyOfferCreate, PropertyOfferDecision, PropertyOfferResponse
from app.schemas.rental import RentalPaymentCreate, RentalExitRequestCreate, RentalRenewalCreate, RentalAgreementSignRequest, RentalInspectionAcknowledge
from app.services.audit_service import log_audit
from app.services.customer_chat_service import ensure_invitation_conversation
from app.services.email_service import (
    send_customer_portal_invitation_email,
    send_customer_portal_password_reset_email,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/v1/customer-portal", tags=["Customer Portal"])
portal_security = HTTPBearer(auto_error=False)

CENT = Decimal("0.01")
VISIBLE_ESTIMATE_STATUSES = {"Sent", "Accepted", "Rejected", "Expired"}
VISIBLE_CONTRACT_STATUSES = {"Sent", "Under Review", "Signed", "Active", "Completed", "Terminated", "Expired"}
VISIBLE_INVOICE_STATUSES = {"Sent", "Partially Paid", "Paid", "Credited"}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_naive_utc() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def money(value: Decimal | float | int | None) -> Decimal:
    if value is None:
        return Decimal("0.00")
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def token_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def staff_context(current_user: dict) -> tuple[UUID, UUID]:
    try:
        return UUID(str(current_user["tenant_id"])), UUID(str(current_user["user_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid user or tenant information.")


def _notify_staff_user(
    db: Session,
    tenant_id: UUID,
    recipient_user_id: UUID | None,
    title: str,
    message: str,
    related_module: str,
    related_record_id: UUID,
) -> None:
    if not recipient_user_id:
        return
    recipient = db.query(User).filter(
        User.id == recipient_user_id,
        User.tenant_id == tenant_id,
        User.status == "Active",
    ).first()
    if not recipient:
        return
    db.add(
        Notification(
            tenant_id=tenant_id,
            recipient_user_id=recipient.id,
            workflow_id=None,
            title=title[:200],
            message=message,
            notification_type="customer_portal",
            related_module=related_module,
            related_record_id=related_record_id,
            is_read=False,
        )
    )


ACTIVE_TENANT_STATUS = "Active"


def _assign_portal_ticket_to_tenant_support(
    db: Session,
    ticket: SupportTicket,
) -> UUID | None:
    """
    Assign a customer-portal ticket only to an active employee
    belonging to the customer's own tenant.

    Priority:
    1. Support User
    2. Operations User
    3. Tenant Admin
    4. Tenant Owner
    5. Manager

    Platform employees are never considered.
    """

    role_priority = {
        "Support User": 0,
        "Operations User": 1,
        "Tenant Admin": 2,
        "Tenant Owner": 3,
        "Manager": 4,
    }

    candidates = (
        db.query(User, Role.name)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .filter(
            User.tenant_id == ticket.tenant_id,
            User.status == "Active",
            Role.name.in_(role_priority.keys()),
        )
        .all()
    )

    # Keep each user once, using their highest-priority role.
    by_user: dict[UUID, tuple[User, int]] = {}

    for user, role_name in candidates:
        priority = role_priority[role_name]
        existing = by_user.get(user.id)

        if existing is None or priority < existing[1]:
            by_user[user.id] = (user, priority)

    if not by_user:
        return None

    # Select users with the highest available role priority.
    best_priority = min(
        priority for _, priority in by_user.values()
    )

    eligible = [
        user
        for user, priority in by_user.values()
        if priority == best_priority
    ]

    # Count each eligible employee's active ticket workload.
    loads = dict(
        db.query(
            SupportTicket.assigned_to,
            func.count(SupportTicket.id),
        )
        .filter(
            SupportTicket.tenant_id == ticket.tenant_id,
            SupportTicket.assigned_to.in_(
                [user.id for user in eligible]
            ),
            SupportTicket.status.notin_(["Resolved", "Closed"]),
        )
        .group_by(SupportTicket.assigned_to)
        .all()
    )

    # Choose the employee with the lowest workload.
    selected = min(
        eligible,
        key=lambda user: (
            loads.get(user.id, 0),
            user.created_at,
            str(user.id),
        ),
    )

    return selected.id


def tenant_is_active(db: Session, tenant_id: UUID) -> bool:
    """Customers may only use the portal while their workspace is Active."""
    return (
        db.query(Tenant.id)
        .filter(Tenant.id == tenant_id, Tenant.status == ACTIVE_TENANT_STATUS)
        .first()
        is not None
    )


def ensure_tenant_active(db: Session, tenant_id: UUID) -> None:
    if not tenant_is_active(db, tenant_id):
        raise HTTPException(status_code=403, detail="This workspace is currently unavailable.")


def require_portal_user(
    request: Request,
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
    request.state.portal_user_id = str(portal_user_id)  # used by the rate limiter key
    portal_user = db.query(CustomerPortalUser).filter(
        CustomerPortalUser.id == portal_user_id,
        CustomerPortalUser.tenant_id == tenant_id,
        CustomerPortalUser.account_id == account_id,
        CustomerPortalUser.status == "Active",
    ).first()
    if not portal_user:
        raise HTTPException(status_code=401, detail="Customer portal account is inactive or unavailable.")
    ensure_tenant_active(db, portal_user.tenant_id)
    contact = db.query(Contact).filter(
        Contact.id == portal_user.contact_id,
        Contact.tenant_id == portal_user.tenant_id,
        Contact.account_id == portal_user.account_id,
    ).first()
    account = db.query(Account).filter(
        Account.id == portal_user.account_id,
        Account.tenant_id == portal_user.tenant_id,
    ).first()
    if not contact or not account:
        raise HTTPException(status_code=403, detail="Your contact is no longer associated with an available Account.")
    return {
        "portal_user_id": portal_user.id,
        "tenant_id": portal_user.tenant_id,
        "account_id": portal_user.account_id,
        "contact_id": portal_user.contact_id,
        "email": portal_user.email,
        "linked": payload.get("linked") or {},
    }


def password_fingerprint(portal_user: CustomerPortalUser) -> str:
    """Changes whenever the user's password changes, so old links stop working."""
    return hmac.new(
        settings.JWT_SECRET_KEY.encode("utf-8"),
        (portal_user.password_hash or "").encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()[:24]


def build_linked_workspaces(users: list[CustomerPortalUser]) -> dict | None:
    """Workspaces whose password was proven in this login (needs 2+ to be useful)."""
    if len(users) < 2:
        return None
    return {str(u.id): password_fingerprint(u) for u in users}


def make_access_token(portal_user: CustomerPortalUser, linked: dict | None = None) -> str:
    claims = {
        "portal_type": "customer",
        "token_type": "access",
        "portal_user_id": str(portal_user.id),
        "tenant_id": str(portal_user.tenant_id),
        "account_id": str(portal_user.account_id),
        "contact_id": str(portal_user.contact_id),
    }
    if linked:
        claims["linked"] = linked
    return create_access_token(claims)


def make_refresh_token(portal_user: CustomerPortalUser, db: Session, linked: dict | None = None) -> str:
    raw = secrets.token_urlsafe(48)
    session = CustomerPortalSession(
        portal_user_id=portal_user.id,
        tenant_id=portal_user.tenant_id,
        token_hash=token_hash(raw),
        expires_at=now_utc() + timedelta(days=30),
        linked_workspaces=linked or None,
    )
    db.add(session)
    db.flush()
    return raw


def invite_response(portal_user: CustomerPortalUser, invitation: CustomerPortalInvitation) -> PortalInviteResponse:
    return PortalInviteResponse(
        portal_user_id=portal_user.id,
        contact_id=portal_user.contact_id,
        account_id=portal_user.account_id,
        email=portal_user.email,
        status=portal_user.status,
        invitation_expires_at=invitation.expires_at,
    )


def _issue_portal_invitation(
    db: Session,
    tenant_id: UUID,
    staff_user_id: UUID,
    portal_user: CustomerPortalUser,
) -> tuple[CustomerPortalInvitation, str]:
    db.query(CustomerPortalInvitation).filter(
        CustomerPortalInvitation.portal_user_id == portal_user.id,
        CustomerPortalInvitation.used_at.is_(None),
        CustomerPortalInvitation.revoked.is_(False),
    ).update({"revoked": True}, synchronize_session=False)

    raw_token = secrets.token_urlsafe(40)
    invitation = CustomerPortalInvitation(
        tenant_id=tenant_id,
        portal_user_id=portal_user.id,
        token_hash=token_hash(raw_token),
        expires_at=now_utc() + timedelta(hours=48),
        invited_by_user_id=staff_user_id,
    )
    db.add(invitation)
    db.flush()
    return invitation, raw_token


# ==============================================================================
# 1. STAFF INVITATION & PORTAL USER MANAGEMENT ENDPOINTS
# ==============================================================================

@router.post(
    "/invitations",
    response_model=PortalInviteResponse,
    status_code=201,
    dependencies=[Depends(require_permission("customer_portal.invite"))],
)
async def invite_customer_contact(
    payload: PortalInviteCreate,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, staff_user_id = staff_context(current_user)
    contact = db.query(Contact).filter(
        Contact.id == payload.contact_id,
        Contact.tenant_id == tenant_id,
    ).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found in this tenant.")
    if not contact.account_id:
        raise HTTPException(
            status_code=400,
            detail="The contact must belong to an Account before portal access can be invited.",
        )
    account = db.query(Account).filter(
        Account.id == contact.account_id,
        Account.tenant_id == tenant_id,
    ).first()
    if not account:
        raise HTTPException(status_code=400, detail="Contact Account is not available in this tenant.")
    if not contact.email or not contact.email.strip():
        raise HTTPException(
            status_code=400,
            detail="The contact needs an email address before an invitation can be sent.",
        )
    email = contact.email.strip().lower()
    portal_user = db.query(CustomerPortalUser).filter(
        CustomerPortalUser.tenant_id == tenant_id,
        CustomerPortalUser.contact_id == contact.id,
    ).first()
    duplicate_email_query = db.query(CustomerPortalUser).filter(
        CustomerPortalUser.tenant_id == tenant_id,
        func.lower(CustomerPortalUser.email) == email,
    )
    if portal_user:
        duplicate_email_query = duplicate_email_query.filter(CustomerPortalUser.id != portal_user.id)
    if duplicate_email_query.first():
        raise HTTPException(
            status_code=409,
            detail="This email is already linked to another portal contact in this tenant.",
        )
    if portal_user and portal_user.status == "Active":
        raise HTTPException(
            status_code=409,
            detail="This contact already has an active customer portal account.",
        )
    if portal_user:
        portal_user.email = email
        portal_user.account_id = account.id
        portal_user.status = "Invited"
    else:
        portal_user = CustomerPortalUser(
            tenant_id=tenant_id,
            account_id=account.id,
            contact_id=contact.id,
            email=email,
            status="Invited",
        )
        db.add(portal_user)
        db.flush()

    invitation, raw_token = _issue_portal_invitation(db, tenant_id, staff_user_id, portal_user)
    ensure_invitation_conversation(db, tenant_id=tenant_id, portal_user=portal_user, inviter_user_id=staff_user_id)
    try:
        log_audit(
            db,
            tenant_id=tenant_id,
            user_id=staff_user_id,
            action="INVITE",
            module="customer_portal",
            record_id=portal_user.id,
            description=f"Invited customer contact {contact.full_name} ({email}) to customer portal",
            after_data={"contact_id": str(contact.id), "account_id": str(account.id), "email": email},
        )
        await send_customer_portal_invitation_email(email, contact.full_name, raw_token, str(tenant_id))
        db.commit()
        db.refresh(portal_user)
        db.refresh(invitation)
        return invite_response(portal_user, invitation)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail="Invitation could not be completed. Check the email service and try again.",
        ) from exc


@router.post(
    "/invitations/{portal_user_id}/resend",
    response_model=PortalInviteResponse,
    status_code=200,
    dependencies=[Depends(require_permission("customer_portal.invite"))],
)
async def resend_customer_portal_invitation(
    portal_user_id: UUID,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, staff_user_id = staff_context(current_user)
    portal_user = db.query(CustomerPortalUser).filter(
        CustomerPortalUser.id == portal_user_id,
        CustomerPortalUser.tenant_id == tenant_id,
    ).first()
    if not portal_user:
        raise HTTPException(status_code=404, detail="Customer portal user not found.")
    if portal_user.status == "Active":
        raise HTTPException(status_code=409, detail="This portal account is already active.")
    contact = db.query(Contact).filter(
        Contact.id == portal_user.contact_id,
        Contact.tenant_id == tenant_id,
    ).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Linked contact not found.")
    portal_user.status = "Invited"
    invitation, raw_token = _issue_portal_invitation(db, tenant_id, staff_user_id, portal_user)
    try:
        log_audit(
            db,
            tenant_id=tenant_id,
            user_id=staff_user_id,
            action="RESEND_INVITE",
            module="customer_portal",
            record_id=portal_user.id,
            description=f"Resent customer portal invitation to {portal_user.email}",
        )
        await send_customer_portal_invitation_email(
            portal_user.email,
            contact.full_name,
            raw_token,
            str(tenant_id),
        )
        db.commit()
        db.refresh(portal_user)
        db.refresh(invitation)
        return invite_response(portal_user, invitation)
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail="Invitation could not be resent. Check the email service and try again.",
        ) from exc


@router.delete(
    "/invitations/{portal_user_id}",
    status_code=200,
    dependencies=[Depends(require_permission("customer_portal.manage"))],
)
def revoke_customer_portal_invitation(
    portal_user_id: UUID,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, staff_user_id = staff_context(current_user)
    portal_user = db.query(CustomerPortalUser).filter(
        CustomerPortalUser.id == portal_user_id,
        CustomerPortalUser.tenant_id == tenant_id,
    ).first()
    if not portal_user:
        raise HTTPException(status_code=404, detail="Customer portal user not found.")
    db.query(CustomerPortalInvitation).filter(
        CustomerPortalInvitation.portal_user_id == portal_user.id,
        CustomerPortalInvitation.used_at.is_(None),
        CustomerPortalInvitation.revoked.is_(False),
    ).update({"revoked": True}, synchronize_session=False)
    if portal_user.status == "Invited":
        portal_user.status = "Suspended"
    log_audit(
        db,
        tenant_id=tenant_id,
        user_id=staff_user_id,
        action="REVOKE_INVITE",
        module="customer_portal",
        record_id=portal_user.id,
        description=f"Revoked pending customer portal invitations for {portal_user.email}",
    )
    db.commit()
    return {"message": "Pending portal invitations revoked.", "portal_user_id": str(portal_user.id), "status": portal_user.status}


@router.get("/invitations", dependencies=[Depends(require_permission("customer_portal.invite"))])
def list_customer_portal_users(
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, _ = staff_context(current_user)
    rows = (
        db.query(CustomerPortalUser, Contact, Account)
        .join(
            Contact,
            (Contact.id == CustomerPortalUser.contact_id)
            & (Contact.tenant_id == CustomerPortalUser.tenant_id),
        )
        .join(
            Account,
            (Account.id == CustomerPortalUser.account_id)
            & (Account.tenant_id == CustomerPortalUser.tenant_id),
        )
        .filter(CustomerPortalUser.tenant_id == tenant_id)
        .order_by(CustomerPortalUser.created_at.desc())
        .all()
    )
    return [
        {
            "portal_user_id": str(user.id),
            "contact_id": str(contact.id),
            "contact_name": contact.full_name,
            "account_id": str(account.id),
            "account_name": account.name,
            "email": user.email,
            "status": user.status,
            "created_at": user.created_at,
            "activated_at": user.activated_at,
            "last_login_at": user.last_login_at,
        }
        for user, contact, account in rows
    ]


@router.patch(
    "/users/{portal_user_id}/status",
    dependencies=[Depends(require_permission("customer_portal.manage"))],
)
def update_portal_user_status(
    portal_user_id: UUID,
    status_value: str = Query(..., alias="status", pattern="^(Active|Suspended)$"),
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, staff_user_id = staff_context(current_user)
    portal_user = db.query(CustomerPortalUser).filter(
        CustomerPortalUser.id == portal_user_id,
        CustomerPortalUser.tenant_id == tenant_id,
    ).first()
    if not portal_user:
        raise HTTPException(status_code=404, detail="Customer portal user not found.")
    if status_value == "Active" and not portal_user.password_hash:
        raise HTTPException(
            status_code=409,
            detail="A portal user must activate their invitation before being enabled.",
        )
    before_status = portal_user.status
    portal_user.status = status_value
    if status_value == "Suspended":
        db.query(CustomerPortalSession).filter(
            CustomerPortalSession.portal_user_id == portal_user.id
        ).update({"revoked": True}, synchronize_session=False)
    log_audit(
        db,
        tenant_id=tenant_id,
        user_id=staff_user_id,
        action="UPDATE_STATUS",
        module="customer_portal",
        record_id=portal_user.id,
        description=f"Changed customer portal user status from {before_status} to {status_value}",
        before_data={"status": before_status},
        after_data={"status": status_value},
    )
    db.commit()
    return {"id": str(portal_user.id), "status": portal_user.status}


# ==============================================================================
# 2. CUSTOMER PORTAL AUTHENTICATION & PASSWORD LIFECYCLE
# ==============================================================================

@router.post("/auth/activate", status_code=200)
@limiter.limit("5/minute")
def activate_customer_portal(
    request: Request,
    response: Response,
    payload: PortalActivateRequest,
    db: Session = Depends(get_db),
):
    invitation = db.query(CustomerPortalInvitation).filter(
        CustomerPortalInvitation.token_hash == token_hash(payload.token),
        CustomerPortalInvitation.revoked.is_(False),
        CustomerPortalInvitation.used_at.is_(None),
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
    if not tenant_is_active(db, portal_user.tenant_id):
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
        log_audit(
            db,
            tenant_id=portal_user.tenant_id,
            user_id=None,
            action="ACTIVATE",
            module="customer_portal",
            record_id=portal_user.id,
            description=f"Customer portal user {portal_user.email} activated their account",
        )
        db.commit()
        return {
            "message": "Customer portal account activated. You can now sign in.",
            "tenant_id": str(portal_user.tenant_id),
        }
    except Exception:
        db.rollback()
        raise


@router.post("/auth/login")
@limiter.limit("5/minute")
def customer_portal_login(
    request: Request,
    response: Response,
    payload: PortalLoginRequest,
    db: Session = Depends(get_db),
):
    email = str(payload.email).strip().lower()
    query = db.query(CustomerPortalUser).join(
        Tenant, Tenant.id == CustomerPortalUser.tenant_id
    ).filter(
        func.lower(CustomerPortalUser.email) == email,
        CustomerPortalUser.status == "Active",
        Tenant.status == ACTIVE_TENANT_STATUS,
    )
    candidates = query.all()  # all workspaces for this email; tenant_id only picks the target
    matched_users = [
        u for u in candidates
        if u.password_hash and verify_password(payload.password, u.password_hash)
    ]
    if not matched_users:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if payload.tenant_id is not None:
        matched_target = [u for u in matched_users if u.tenant_id == payload.tenant_id]
        if not matched_target:
            raise HTTPException(status_code=401, detail="Invalid email or password.")
    else:
        matched_target = matched_users
    if len(matched_target) > 1 and payload.tenant_id is None:
        rows = (
            db.query(CustomerPortalUser, Tenant, Account)
            .join(Tenant, Tenant.id == CustomerPortalUser.tenant_id)
            .join(Account, Account.id == CustomerPortalUser.account_id)
            .filter(CustomerPortalUser.id.in_([u.id for u in matched_users]))
            .all()
        )
        return {
            "requires_tenant_selection": True,
            "message": "Your email is linked to multiple workspaces. Please select one to continue.",
            "workspaces": [
                {
                    "tenant_id": str(t.id),
                    "tenant_name": t.name,
                    "account_id": str(a.id),
                    "account_name": a.name,
                }
                for _u, t, a in rows
            ],
        }
    portal_user = matched_target[0]
    linked = build_linked_workspaces(matched_users)
    portal_user.last_login_at = now_utc()
    try:
        refresh_token = make_refresh_token(portal_user, db, linked=linked)
        db.commit()
        return {
            "access_token": make_access_token(portal_user, linked),
            "token_type": "bearer",
            "refresh_token": refresh_token,
            "expires_in_minutes": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES,
            "customer": {
                "id": str(portal_user.id),
                "email": portal_user.email,
                "tenant_id": str(portal_user.tenant_id),
                "account_id": str(portal_user.account_id),
                "contact_id": str(portal_user.contact_id),
            },
        }
    except Exception:
        db.rollback()
        raise


@router.post("/auth/refresh")
@limiter.limit("10/minute")
def customer_portal_refresh(
    request: Request,
    response: Response,
    payload: PortalRefreshRequest,
    db: Session = Depends(get_db),
):
    session = db.query(CustomerPortalSession).filter(
        CustomerPortalSession.token_hash == token_hash(payload.refresh_token),
        CustomerPortalSession.revoked.is_(False),
        CustomerPortalSession.expires_at > now_utc(),
    ).first()
    if not session:
        raise HTTPException(status_code=401, detail="Refresh token is invalid, expired, or revoked.")
    portal_user = db.query(CustomerPortalUser).filter(
        CustomerPortalUser.id == session.portal_user_id,
        CustomerPortalUser.tenant_id == session.tenant_id,
        CustomerPortalUser.status == "Active",
    ).first()
    if not portal_user:
        session.revoked = True
        db.commit()
        raise HTTPException(status_code=401, detail="Customer portal account is inactive.")
    if not tenant_is_active(db, portal_user.tenant_id):
        raise HTTPException(status_code=401, detail="This workspace is currently unavailable.")
    linked = session.linked_workspaces
    session.revoked = True
    new_refresh = make_refresh_token(portal_user, db, linked=linked)
    try:
        db.commit()
        return {
            "access_token": make_access_token(portal_user, linked),
            "token_type": "bearer",
            "refresh_token": new_refresh,
            "expires_in_minutes": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES,
        }
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


def _workspace_rows(db: Session, user_ids: list[UUID]):
    if not user_ids:
        return []
    return (
        db.query(CustomerPortalUser, Tenant, Account)
        .join(Tenant, Tenant.id == CustomerPortalUser.tenant_id)
        .join(
            Account,
            (Account.id == CustomerPortalUser.account_id)
            & (Account.tenant_id == CustomerPortalUser.tenant_id),
        )
        .filter(
            CustomerPortalUser.id.in_(user_ids),
            CustomerPortalUser.status == "Active",
            Tenant.status == ACTIVE_TENANT_STATUS,
        )
        .all()
    )


def _linked_workspaces(db: Session, portal: dict):
    """Workspaces this login may switch into: password proven at login, same email,
    still Active, and password unchanged since."""
    linked = portal.get("linked") or {}
    ids = []
    for key in linked:
        try:
            ids.append(UUID(str(key)))
        except ValueError:
            continue
    email = (portal.get("email") or "").strip().lower()
    result = []
    for user, tenant, account in _workspace_rows(db, ids):
        if (user.email or "").strip().lower() != email or not user.password_hash:
            continue
        if not hmac.compare_digest(str(linked.get(str(user.id), "")), password_fingerprint(user)):
            continue
        result.append((user, tenant, account))
    return result


@router.get("/auth/workspaces")
def customer_portal_workspaces(portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    """Companies the customer can switch between without logging in again."""
    rows = _linked_workspaces(db, portal)
    if not any(u.id == portal["portal_user_id"] for u, _t, _a in rows):
        rows += _workspace_rows(db, [portal["portal_user_id"]])
    return {
        "current_tenant_id": str(portal["tenant_id"]),
        "workspaces": [
            {
                "tenant_id": str(t.id),
                "tenant_name": t.name,
                "account_id": str(a.id),
                "account_name": a.name,
                "is_current": u.id == portal["portal_user_id"],
            }
            for u, t, a in rows
        ],
    }


@router.post("/auth/switch-workspace")
@limiter.limit("20/minute")
def customer_portal_switch_workspace(
    request: Request,
    response: Response,
    payload: PortalSwitchWorkspaceRequest,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    if payload.tenant_id == portal["tenant_id"]:
        raise HTTPException(status_code=400, detail="You are already in this workspace.")
    match = next(
        (
            (u, t)
            for u, t, _a in _linked_workspaces(db, portal)
            if u.tenant_id == payload.tenant_id and u.id != portal["portal_user_id"]
        ),
        None,
    )
    if not match:
        raise HTTPException(
            status_code=403,
            detail="You cannot switch to that workspace. Sign in to it directly with its own password.",
        )
    target, tenant = match
    contact = db.query(Contact).filter(
        Contact.id == target.contact_id,
        Contact.tenant_id == target.tenant_id,
        Contact.account_id == target.account_id,
    ).first()
    if not contact:
        raise HTTPException(status_code=403, detail="Your contact is no longer associated with an available Account.")
    linked = portal.get("linked") or None
    target.last_login_at = now_utc()
    try:
        refresh_token = make_refresh_token(target, db, linked=linked)
        log_audit(
            db,
            tenant_id=target.tenant_id,
            user_id=None,
            action="SWITCH_WORKSPACE",
            module="customer_portal",
            record_id=target.id,
            description=f"Customer portal user {target.email} switched into this workspace without re-entering a password",
        )
        db.commit()
        return {
            "access_token": make_access_token(target, linked),
            "token_type": "bearer",
            "refresh_token": refresh_token,
            "expires_in_minutes": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES,
            "customer": {
                "id": str(target.id),
                "email": target.email,
                "tenant_id": str(target.tenant_id),
                "account_id": str(target.account_id),
                "contact_id": str(target.contact_id),
            },
            "workspace": {"tenant_id": str(tenant.id), "tenant_name": tenant.name},
        }
    except Exception:
        db.rollback()
        raise


@router.post("/auth/forgot-password", status_code=200)
@limiter.limit("3/hour")
async def customer_portal_forgot_password(
    request: Request,
    response: Response,
    payload: PortalForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    generic_message = {
        "message": "If an active portal account exists for this email, a password reset link has been sent."
    }
    email = str(payload.email).strip().lower()
    query = db.query(CustomerPortalUser).join(
        Tenant, Tenant.id == CustomerPortalUser.tenant_id
    ).filter(
        func.lower(CustomerPortalUser.email) == email,
        CustomerPortalUser.status == "Active",
        Tenant.status == ACTIVE_TENANT_STATUS,
    )
    if payload.tenant_id is not None:
        query = query.filter(CustomerPortalUser.tenant_id == payload.tenant_id)
    portal_user = query.order_by(CustomerPortalUser.last_login_at.desc().nullslast()).first()
    if not portal_user:
        return generic_message

    contact = db.query(Contact).filter(
        Contact.id == portal_user.contact_id,
        Contact.tenant_id == portal_user.tenant_id,
    ).first()
    full_name = contact.full_name if contact else "Customer"

    db.query(CustomerPortalPasswordReset).filter(
        CustomerPortalPasswordReset.portal_user_id == portal_user.id,
        CustomerPortalPasswordReset.used_at.is_(None),
        CustomerPortalPasswordReset.revoked.is_(False),
    ).update({"revoked": True}, synchronize_session=False)

    raw_token = secrets.token_urlsafe(40)
    reset_row = CustomerPortalPasswordReset(
        tenant_id=portal_user.tenant_id,
        portal_user_id=portal_user.id,
        token_hash=token_hash(raw_token),
        expires_at=now_utc() + timedelta(hours=1),
    )
    db.add(reset_row)
    try:
        db.flush()
        await send_customer_portal_password_reset_email(
            portal_user.email,
            full_name,
            raw_token,
            str(portal_user.tenant_id),
        )
        db.commit()
    except Exception as exc:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail="Unable to send password reset email right now. Please try again later.",
        ) from exc

    return generic_message


@router.post("/auth/reset-password", status_code=200)
@limiter.limit("5/minute")
def customer_portal_reset_password(
    request: Request,
    response: Response,
    payload: PortalResetPasswordRequest,
    db: Session = Depends(get_db),
):
    reset_row = db.query(CustomerPortalPasswordReset).filter(
        CustomerPortalPasswordReset.token_hash == token_hash(payload.token),
        CustomerPortalPasswordReset.revoked.is_(False),
        CustomerPortalPasswordReset.used_at.is_(None),
        CustomerPortalPasswordReset.expires_at > now_utc(),
    ).first()
    if not reset_row:
        raise HTTPException(status_code=400, detail="Password reset token is invalid, expired, or already used.")
    portal_user = db.query(CustomerPortalUser).filter(
        CustomerPortalUser.id == reset_row.portal_user_id,
        CustomerPortalUser.tenant_id == reset_row.tenant_id,
        CustomerPortalUser.status == "Active",
    ).first()
    if not portal_user:
        raise HTTPException(status_code=400, detail="Portal account is no longer active.")
    if not tenant_is_active(db, portal_user.tenant_id):
        raise HTTPException(status_code=400, detail="Portal account is no longer active.")

    ensure_password_policy(payload.new_password, [portal_user.email])
    portal_user.password_hash = hash_password(payload.new_password)
    reset_row.used_at = now_utc()
    db.query(CustomerPortalPasswordReset).filter(
        CustomerPortalPasswordReset.portal_user_id == portal_user.id,
        CustomerPortalPasswordReset.id != reset_row.id,
        CustomerPortalPasswordReset.used_at.is_(None),
    ).update({"revoked": True}, synchronize_session=False)
    db.query(CustomerPortalSession).filter(
        CustomerPortalSession.portal_user_id == portal_user.id,
        CustomerPortalSession.revoked.is_(False),
    ).update({"revoked": True}, synchronize_session=False)

    log_audit(
        db,
        tenant_id=portal_user.tenant_id,
        user_id=None,
        action="PASSWORD_RESET",
        module="customer_portal",
        record_id=portal_user.id,
        description=f"Customer portal user {portal_user.email} reset their password",
    )
    db.commit()
    return {"message": "Password has been reset successfully. Please sign in with your new password."}


@router.post("/auth/change-password", status_code=200)
@limiter.limit("5/minute")
def customer_portal_change_password(
    request: Request,
    response: Response,
    payload: PortalChangePasswordRequest,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    portal_user = db.query(CustomerPortalUser).filter(
        CustomerPortalUser.id == portal["portal_user_id"],
        CustomerPortalUser.tenant_id == portal["tenant_id"],
        CustomerPortalUser.status == "Active",
    ).first()
    if not portal_user or not portal_user.password_hash:
        raise HTTPException(status_code=401, detail="Customer portal account is unavailable.")
    if not verify_password(payload.current_password, portal_user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect.")
    if payload.current_password == payload.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from your current password.")

    ensure_password_policy(payload.new_password, [portal_user.email])
    portal_user.password_hash = hash_password(payload.new_password)
    db.query(CustomerPortalSession).filter(
        CustomerPortalSession.portal_user_id == portal_user.id,
        CustomerPortalSession.revoked.is_(False),
    ).update({"revoked": True}, synchronize_session=False)

    log_audit(
        db,
        tenant_id=portal_user.tenant_id,
        user_id=None,
        action="CHANGE_PASSWORD",
        module="customer_portal",
        record_id=portal_user.id,
        description=f"Customer portal user {portal_user.email} changed their password",
    )
    db.commit()
    return {"message": "Password changed successfully. Please sign in again."}


# ==============================================================================
# 3. CUSTOMER PORTAL PROFILE & UNIFIED DASHBOARD
# ==============================================================================

@router.get("/me")
def customer_portal_me(portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    contact = db.query(Contact).filter(
        Contact.id == portal["contact_id"],
        Contact.tenant_id == portal["tenant_id"],
    ).first()
    account = db.query(Account).filter(
        Account.id == portal["account_id"],
        Account.tenant_id == portal["tenant_id"],
    ).first()
    tenant = db.query(Tenant).filter(Tenant.id == portal["tenant_id"]).first()
    return {
        "id": str(portal["portal_user_id"]),
        "email": portal["email"],
        "tenant": {
            "id": str(tenant.id),
            "name": tenant.name,
            "industry": tenant.industry,
        } if tenant else None,
        "contact": {
            "id": str(contact.id),
            "full_name": contact.full_name,
            "email": contact.email,
            "phone": contact.phone,
            "job_title": contact.job_title,
            "address": contact.address,
        } if contact else None,
        "account": {
            "id": str(account.id),
            "name": account.name,
            "industry": account.industry,
            "website": account.website,
            "phone": account.phone,
            "city": account.city,
            "state": account.state,
            "country": account.country,
        } if account else None,
    }


@router.patch("/me")
def update_customer_portal_profile(
    payload: PortalProfileUpdateRequest,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    contact = db.query(Contact).filter(
        Contact.id == portal["contact_id"],
        Contact.tenant_id == portal["tenant_id"],
        Contact.account_id == portal["account_id"],
    ).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Contact profile not found.")
    changes = payload.model_dump(exclude_unset=True)
    if "full_name" in changes and not changes["full_name"]:
        raise HTTPException(status_code=422, detail="Full name cannot be blank.")
    for field, value in changes.items():
        setattr(contact, field, value)
    contact.updated_at = now_naive_utc()
    db.commit()
    db.refresh(contact)
    return {
        "message": "Profile updated successfully.",
        "contact": {
            "id": str(contact.id),
            "full_name": contact.full_name,
            "email": contact.email,
            "phone": contact.phone,
            "job_title": contact.job_title,
            "address": contact.address,
        },
    }


def _account_booking_filter(db: Session, portal: dict):
    """Restrict booking visibility to this exact portal contact and its verified email.

    Account-wide lead/deal matching is intentionally excluded because an Account can
    contain multiple unrelated contacts and must not expose another buyer's booking.
    """
    tenant_id = portal["tenant_id"]
    contact_id = portal["contact_id"]
    email = (portal.get("email") or "").strip().lower()

    req_ids = [
        r[0]
        for r in db.query(BuyerRequirement.id).filter(
            BuyerRequirement.tenant_id == tenant_id,
            BuyerRequirement.contact_id == contact_id,
        ).all()
    ]
    deal_booking_ids = [
        r[0]
        for r in db.query(Deal.booking_id).filter(
            Deal.tenant_id == tenant_id,
            Deal.booking_id.isnot(None),
            Deal.contact_id == contact_id,
        ).all()
    ]

    clauses = []
    if email:
        contact = db.query(Contact).filter(
            Contact.id == contact_id,
            Contact.tenant_id == tenant_id,
        ).first()
        same_email_contacts = db.query(func.count(Contact.id)).filter(
            Contact.tenant_id == tenant_id,
            func.lower(Contact.email) == email,
        ).scalar() or 0
        if contact and (contact.email or "").strip().lower() == email and same_email_contacts == 1:
            clauses.append(func.lower(Booking.buyer_email) == email)
    if req_ids:
        clauses.append(Booking.buyer_requirement_id.in_(req_ids))
    if deal_booking_ids:
        clauses.append(Booking.id.in_(deal_booking_ids))
    if not clauses:
        return db.query(Booking).filter(Booking.id == None)
    return db.query(Booking).filter(Booking.tenant_id == tenant_id, or_(*clauses))


def _serialize_portal_invoice(invoice: SoftwareInvoice) -> dict:
    received = money(
        sum(
            (Decimal(str(p.amount)) for p in invoice.payments if p.status == "Received"),
            Decimal("0.00"),
        )
    )
    credited = money(
        sum((Decimal(str(n.amount)) for n in invoice.credit_notes), Decimal("0.00"))
    )
    balance = (
        Decimal("0.00")
        if invoice.status == "Void"
        else max(money(Decimal(str(invoice.total_amount)) - received - credited), Decimal("0.00"))
    )
    today = date.today()
    is_overdue = (
        invoice.status in {"Sent", "Partially Paid"}
        and invoice.due_date is not None
        and invoice.due_date < today
        and balance > 0
    )
    return {
        "id": invoice.id,
        "project_id": invoice.project_id,
        "software_contract_id": invoice.software_contract_id,
        "invoice_number": invoice.invoice_number,
        "currency": invoice.currency,
        "issue_date": invoice.issue_date,
        "due_date": invoice.due_date,
        "status": invoice.status,
        "subtotal": money(invoice.subtotal),
        "tax_total": money(invoice.tax_total),
        "total_amount": money(invoice.total_amount),
        "amount_paid": received,
        "credited_amount": credited,
        "balance_due": balance,
        "is_overdue": is_overdue,
        "days_overdue": (today - invoice.due_date).days if is_overdue else 0,
        "notes": invoice.notes,
        "sent_at": invoice.sent_at,
        "created_at": invoice.created_at,
        "updated_at": invoice.updated_at,
        "items": invoice.items,
        "payments": invoice.payments,
        "credit_notes": invoice.credit_notes,
    }


@router.get("/dashboard")
def customer_portal_dashboard(portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    tenant_id = portal["tenant_id"]
    account_id = portal["account_id"]
    contact_id = portal["contact_id"]

    tickets = db.query(SupportTicket).filter(
        SupportTicket.tenant_id == tenant_id,
        SupportTicket.account_id == account_id,
    ).all()
    open_tickets = sum(1 for t in tickets if t.status in {"Open", "In Progress", "Waiting on Customer"})
    waiting_on_customer = sum(1 for t in tickets if t.status == "Waiting on Customer")
    resolved_tickets = sum(1 for t in tickets if t.status in {"Resolved", "Closed"})

    estimates = db.query(SoftwareEstimate).filter(
        SoftwareEstimate.tenant_id == tenant_id,
        SoftwareEstimate.account_id == account_id,
        SoftwareEstimate.status.in_(VISIBLE_ESTIMATE_STATUSES),
    ).all()
    pending_estimates = sum(1 for e in estimates if e.status == "Sent")

    contracts = db.query(SoftwareContract).filter(
        SoftwareContract.tenant_id == tenant_id,
        SoftwareContract.account_id == account_id,
        SoftwareContract.status.in_(VISIBLE_CONTRACT_STATUSES),
    ).all()
    pending_contracts = sum(1 for c in contracts if c.status in {"Sent", "Under Review"})
    active_contracts = sum(1 for c in contracts if c.status in {"Signed", "Active"})

    contract_ids = [c.id for c in contracts]
    projects = (
        db.query(SoftwareProject).filter(
            SoftwareProject.tenant_id == tenant_id,
            SoftwareProject.software_contract_id.in_(contract_ids),
        ).all()
        if contract_ids
        else []
    )
    active_projects = sum(1 for p in projects if p.status in {"Planned", "Active", "In Progress", "On Hold"})

    invoices = (
        db.query(SoftwareInvoice)
        .options(
            selectinload(SoftwareInvoice.payments),
            selectinload(SoftwareInvoice.credit_notes),
        )
        .filter(
            SoftwareInvoice.tenant_id == tenant_id,
            SoftwareInvoice.software_contract_id.in_(contract_ids),
            SoftwareInvoice.status.in_(VISIBLE_INVOICE_STATUSES),
        )
        .all()
        if contract_ids
        else []
    )
    total_invoiced = Decimal("0.00")
    total_paid = Decimal("0.00")
    outstanding_balance = Decimal("0.00")
    overdue_invoices_count = 0
    for inv in invoices:
        serialized = _serialize_portal_invoice(inv)
        total_invoiced += serialized["total_amount"]
        total_paid += serialized["amount_paid"]
        outstanding_balance += serialized["balance_due"]
        if serialized["is_overdue"]:
            overdue_invoices_count += 1

    bookings = _account_booking_filter(db, portal).all()
    shared_docs_count = db.query(Document).filter(
        Document.tenant_id == tenant_id,
        Document.is_deleted.is_(False),
        Document.shared_with_customer.is_(True),
        Document.is_confidential.is_(False),
        or_(Document.account_id == account_id, Document.contact_id == contact_id),
    ).count()

    return {
        "support": {
            "total_tickets": len(tickets),
            "open_tickets": open_tickets,
            "waiting_on_customer": waiting_on_customer,
            "resolved_or_closed_tickets": resolved_tickets,
        },
        "commercial_and_delivery": {
            "total_estimates": len(estimates),
            "pending_approval_estimates": pending_estimates,
            "total_contracts": len(contracts),
            "pending_signature_contracts": pending_contracts,
            "active_contracts": active_contracts,
            "total_projects": len(projects),
            "active_projects": active_projects,
        },
        "billing": {
            "total_invoices": len(invoices),
            "overdue_invoices": overdue_invoices_count,
            "total_invoiced": str(money(total_invoiced)),
            "total_paid": str(money(total_paid)),
            "outstanding_balance": str(money(outstanding_balance)),
        },
        "real_estate": {
            "total_bookings": len(bookings),
            "active_bookings": sum(1 for b in bookings if b.status in {"Pending", "Confirmed", "Completed"}),
        },
        "documents": {
            "shared_documents": shared_docs_count,
        },
    }


# ==============================================================================
# 4. SUPPORT TICKETS & SELF-SERVICE RESOLUTION / REOPENING
# ==============================================================================

def portal_ticket_query(db: Session, portal: dict):
    # Account-wide sharing is deliberate: all portal contacts for this same Account see the same tickets.
    return db.query(SupportTicket).filter(
        SupportTicket.tenant_id == portal["tenant_id"],
        SupportTicket.account_id == portal["account_id"],
    )


@router.post("/tickets", response_model=PortalTicketResponse, status_code=201)
def create_portal_ticket(
    payload: PortalTicketCreate,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    if payload.category not in {
        "General",
        "Bug",
        "Technical Support",
        "Billing",
        "Feature Request",
        "Account Access",
        "Other",
    }:
        raise HTTPException(status_code=422, detail="Unsupported ticket category.")
    if payload.priority not in {"Low", "Medium", "High", "Urgent"}:
        raise HTTPException(status_code=422, detail="Unsupported ticket priority.")
    contact = db.query(Contact).filter(
        Contact.id == portal["contact_id"],
        Contact.tenant_id == portal["tenant_id"],
    ).first()
    if not contact or contact.account_id != portal["account_id"]:
        raise HTTPException(status_code=403, detail="Your contact is no longer associated with this Account.")

    if payload.software_project_id is not None:
        project = (
            db.query(SoftwareProject)
            .join(SoftwareContract, SoftwareContract.id == SoftwareProject.software_contract_id)
            .filter(
                SoftwareProject.id == payload.software_project_id,
                SoftwareProject.tenant_id == portal["tenant_id"],
                SoftwareContract.account_id == portal["account_id"],
            )
            .first()
        )
        if not project:
            raise HTTPException(status_code=404, detail="Selected software project was not found for your Account.")

    now = now_naive_utc()
    ticket = SupportTicket(
        tenant_id=portal["tenant_id"],
        ticket_number=f"SUP-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}",
        subject=payload.subject,
        description=payload.description,
        category=payload.category,
        status="Open",
        priority=payload.priority,
        source="Client Portal",
        requester_name=contact.full_name,
        requester_email=portal["email"],
        account_id=portal["account_id"],
        contact_id=portal["contact_id"],
        software_project_id=payload.software_project_id,
    )
    try:
        db.add(ticket)
        db.flush()
        # Customer Portal tickets belong to the customer's tenant
        # # Never route these tickets to SCuilONE Platform Support.
        ticket.assigned_to = _assign_portal_ticket_to_tenant_support(
            db,
            ticket,
        )

        _notify_staff_user(
            db,
            tenant_id=portal["tenant_id"],
            recipient_user_id=ticket.assigned_to,
            title=f"New Portal Ticket {ticket.ticket_number}",
            message=(
                f"{contact.full_name} submitted "
                f"'{ticket.subject}' ({ticket.priority})."
            ),
            related_module="support_tickets",
            related_record_id=ticket.id,

            )
        log_audit(
            db,
            tenant_id=portal["tenant_id"],
            user_id=None,
            action="PORTAL_CREATE_TICKET",
            module="support_tickets",
            record_id=ticket.id,
            description=f"Customer portal user {portal['email']} created ticket {ticket.ticket_number}",
            after_data={"ticket_number": ticket.ticket_number, "subject": ticket.subject, "priority": ticket.priority},
        )
        db.commit()
        db.refresh(ticket)
        return ticket
    except Exception:
        db.rollback()
        raise


@router.get("/tickets", response_model=PortalTicketListResponse)
def list_portal_tickets(
    ticket_status: str | None = Query(default=None, alias="status"),
    priority: str | None = Query(default=None),
    category: str | None = Query(default=None),
    search: str | None = Query(default=None, min_length=1, max_length=200),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    query = portal_ticket_query(db, portal)
    if ticket_status:
        query = query.filter(SupportTicket.status == ticket_status)
    if priority:
        query = query.filter(SupportTicket.priority == priority)
    if category:
        query = query.filter(SupportTicket.category == category)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            or_(
                SupportTicket.subject.ilike(pattern),
                SupportTicket.ticket_number.ilike(pattern),
                SupportTicket.description.ilike(pattern),
            )
        )
    total = query.count()
    items = query.order_by(SupportTicket.updated_at.desc()).offset(offset).limit(limit).all()
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/tickets/{ticket_id}", response_model=PortalTicketDetailResponse)
def get_portal_ticket(
    ticket_id: UUID,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    ticket = (
        portal_ticket_query(db, portal)
        .options(selectinload(SupportTicket.comments))
        .filter(SupportTicket.id == ticket_id)
        .first()
    )
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found for your Account.")
    visible_comments = [comment for comment in ticket.comments if not comment.is_internal]
    return {
        "id": ticket.id,
        "ticket_number": ticket.ticket_number,
        "subject": ticket.subject,
        "description": ticket.description,
        "category": ticket.category,
        "status": ticket.status,
        "priority": ticket.priority,
        "requester_name": ticket.requester_name,
        "account_id": ticket.account_id,
        "contact_id": ticket.contact_id,
        "software_project_id": ticket.software_project_id,
        "resolution": ticket.resolution,
        "resolved_at": ticket.resolved_at,
        "closed_at": ticket.closed_at,
        "created_at": ticket.created_at,
        "updated_at": ticket.updated_at,
        "comments": visible_comments,
    }


@router.get("/tickets/{ticket_id}/comments", response_model=list[PortalCommentResponse])
def list_portal_ticket_comments(
    ticket_id: UUID,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    ticket = portal_ticket_query(db, portal).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found for your Account.")
    return (
        db.query(SupportTicketComment)
        .filter(
            SupportTicketComment.ticket_id == ticket.id,
            SupportTicketComment.tenant_id == portal["tenant_id"],
            SupportTicketComment.is_internal.is_(False),
        )
        .order_by(SupportTicketComment.created_at.asc())
        .all()
    )


@router.post("/tickets/{ticket_id}/comments", response_model=PortalCommentResponse, status_code=201)
def add_portal_ticket_comment(
    ticket_id: UUID,
    payload: PortalCommentCreate,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    ticket = portal_ticket_query(db, portal).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found for your Account.")
    if ticket.status == "Closed":
        raise HTTPException(status_code=409, detail="Closed tickets cannot receive new comments.")
    comment = SupportTicketComment(
        tenant_id=portal["tenant_id"],
        ticket_id=ticket.id,
        author_customer_portal_user_id=portal["portal_user_id"],
        body=payload.body,
        is_internal=False,
    )
    try:
        db.add(comment)
        if ticket.status == "Waiting on Customer":
            ticket.status = "In Progress"
        ticket.updated_at = now_naive_utc()
        _notify_staff_user(
            db,
            tenant_id=portal["tenant_id"],
            recipient_user_id=ticket.assigned_to,
            title=f"Customer replied on {ticket.ticket_number}",
            message=f"New customer comment on '{ticket.subject}': {payload.body[:120]}",
            related_module="support_tickets",
            related_record_id=ticket.id,
        )
        db.commit()
        db.refresh(comment)
        return comment
    except Exception:
        db.rollback()
        raise


@router.post("/tickets/{ticket_id}/close", response_model=PortalTicketResponse)
def close_portal_ticket(
    ticket_id: UUID,
    payload: PortalTicketDecisionRequest | None = None,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    ticket = portal_ticket_query(db, portal).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found for your Account.")
    if ticket.status == "Closed":
        return ticket
    now = now_naive_utc()
    if payload and payload.comment and payload.comment.strip():
        db.add(
            SupportTicketComment(
                tenant_id=portal["tenant_id"],
                ticket_id=ticket.id,
                author_customer_portal_user_id=portal["portal_user_id"],
                body=payload.comment.strip(),
                is_internal=False,
            )
        )
    if not ticket.resolution:
        ticket.resolution = "Closed by customer via Customer Portal."
    if not ticket.resolved_at:
        ticket.resolved_at = now
    ticket.status = "Closed"
    ticket.closed_at = now
    ticket.updated_at = now
    log_audit(
        db,
        tenant_id=portal["tenant_id"],
        user_id=None,
        action="PORTAL_CLOSE_TICKET",
        module="support_tickets",
        record_id=ticket.id,
        description=f"Customer {portal['email']} closed ticket {ticket.ticket_number}",
    )
    db.commit()
    db.refresh(ticket)
    return ticket


@router.post("/tickets/{ticket_id}/reopen", response_model=PortalTicketResponse)
def reopen_portal_ticket(
    ticket_id: UUID,
    payload: PortalTicketDecisionRequest,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    ticket = portal_ticket_query(db, portal).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Ticket not found for your Account.")
    if ticket.status not in {"Resolved", "Closed"}:
        raise HTTPException(status_code=409, detail="Only Resolved or Closed tickets can be reopened.")
    now = now_naive_utc()
    reason = (payload.comment or "").strip() or "Customer requested to reopen the ticket."
    db.add(
        SupportTicketComment(
            tenant_id=portal["tenant_id"],
            ticket_id=ticket.id,
            author_customer_portal_user_id=portal["portal_user_id"],
            body=f"[Reopened by customer] {reason}",
            is_internal=False,
        )
    )
    ticket.status = "Open"
    ticket.resolved_at = None
    ticket.closed_at = None
    ticket.updated_at = now
    _notify_staff_user(
        db,
        tenant_id=portal["tenant_id"],
        recipient_user_id=ticket.assigned_to,
        title=f"Ticket {ticket.ticket_number} Reopened by Customer",
        message=f"Customer reopened '{ticket.subject}': {reason[:120]}",
        related_module="support_tickets",
        related_record_id=ticket.id,
    )
    log_audit(
        db,
        tenant_id=portal["tenant_id"],
        user_id=None,
        action="PORTAL_REOPEN_TICKET",
        module="support_tickets",
        record_id=ticket.id,
        description=f"Customer {portal['email']} reopened ticket {ticket.ticket_number}",
    )
    db.commit()
    db.refresh(ticket)
    return ticket


# ==============================================================================
# 5. ESTIMATES / PROPOSALS REVIEW & APPROVAL
# ==============================================================================

@router.get("/estimates", response_model=list[PortalEstimateResponse])
def list_portal_estimates(
    estimate_status: str | None = Query(default=None, alias="status"),
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(SoftwareEstimate)
        .options(selectinload(SoftwareEstimate.items))
        .filter(
            SoftwareEstimate.tenant_id == portal["tenant_id"],
            SoftwareEstimate.account_id == portal["account_id"],
            SoftwareEstimate.status.in_(VISIBLE_ESTIMATE_STATUSES),
        )
    )
    if estimate_status:
        query = query.filter(SoftwareEstimate.status == estimate_status)
    return query.order_by(SoftwareEstimate.created_at.desc()).all()


@router.get("/estimates/{estimate_id}", response_model=PortalEstimateResponse)
def get_portal_estimate(
    estimate_id: UUID,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    estimate = (
        db.query(SoftwareEstimate)
        .options(selectinload(SoftwareEstimate.items))
        .filter(
            SoftwareEstimate.id == estimate_id,
            SoftwareEstimate.tenant_id == portal["tenant_id"],
            SoftwareEstimate.account_id == portal["account_id"],
            SoftwareEstimate.status.in_(VISIBLE_ESTIMATE_STATUSES),
        )
        .first()
    )
    if not estimate:
        raise HTTPException(status_code=404, detail="Estimate not found for your Account.")
    return estimate


@router.post("/estimates/{estimate_id}/accept", response_model=PortalEstimateResponse)
def accept_portal_estimate(
    estimate_id: UUID,
    payload: PortalEstimateDecisionRequest | None = None,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    estimate = (
        db.query(SoftwareEstimate)
        .options(selectinload(SoftwareEstimate.items))
        .filter(
            SoftwareEstimate.id == estimate_id,
            SoftwareEstimate.tenant_id == portal["tenant_id"],
            SoftwareEstimate.account_id == portal["account_id"],
        )
        .with_for_update()
        .first()
    )
    if not estimate or estimate.status not in VISIBLE_ESTIMATE_STATUSES:
        raise HTTPException(status_code=404, detail="Estimate not found for your Account.")
    if estimate.status != "Sent":
        raise HTTPException(
            status_code=409,
            detail=f"Only 'Sent' estimates can be accepted; current status is '{estimate.status}'.",
        )
    if estimate.expiry_date and estimate.expiry_date < date.today():
        raise HTTPException(
            status_code=409,
            detail=f"This estimate expired on {estimate.expiry_date} and can no longer be accepted.",
        )
    has_revision = db.query(SoftwareEstimate.id).filter(
        SoftwareEstimate.tenant_id == portal["tenant_id"],
        SoftwareEstimate.parent_estimate_id == estimate.id,
    ).first()
    if has_revision:
        raise HTTPException(
            status_code=409,
            detail="This estimate has been superseded by a newer revision and cannot be accepted.",
        )

    estimate.status = "Accepted"
    estimate.updated_at = now_naive_utc()
    if payload and payload.notes and payload.notes.strip():
        note_line = f"[Customer Accepted {now_utc():%Y-%m-%d %H:%M UTC}]: {payload.notes.strip()}"
        estimate.notes = f"{estimate.notes}\n{note_line}".strip() if estimate.notes else note_line

    if estimate.deal_id:
        deal = db.query(Deal).filter(
            Deal.id == estimate.deal_id,
            Deal.tenant_id == portal["tenant_id"],
        ).with_for_update().first()
        if deal:
            deal.amount = estimate.total_amount
            deal.updated_at = now_naive_utc()

    _notify_staff_user(
        db,
        tenant_id=portal["tenant_id"],
        recipient_user_id=estimate.assigned_to or estimate.created_by,
        title=f"Estimate {estimate.estimate_number} Accepted",
        message=f"Customer ({portal['email']}) accepted estimate '{estimate.title}'.",
        related_module="software_estimates",
        related_record_id=estimate.id,
    )
    log_audit(
        db,
        tenant_id=portal["tenant_id"],
        user_id=None,
        action="PORTAL_ACCEPT_ESTIMATE",
        module="software_estimate",
        record_id=estimate.id,
        description=f"Customer {portal['email']} accepted estimate {estimate.estimate_number}",
        after_data={"status": "Accepted", "total_amount": str(estimate.total_amount)},
    )
    db.commit()
    db.refresh(estimate)
    return estimate


@router.post("/estimates/{estimate_id}/reject", response_model=PortalEstimateResponse)
def reject_portal_estimate(
    estimate_id: UUID,
    payload: PortalEstimateDecisionRequest,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    estimate = (
        db.query(SoftwareEstimate)
        .options(selectinload(SoftwareEstimate.items))
        .filter(
            SoftwareEstimate.id == estimate_id,
            SoftwareEstimate.tenant_id == portal["tenant_id"],
            SoftwareEstimate.account_id == portal["account_id"],
        )
        .with_for_update()
        .first()
    )
    if not estimate or estimate.status not in VISIBLE_ESTIMATE_STATUSES:
        raise HTTPException(status_code=404, detail="Estimate not found for your Account.")
    if estimate.status != "Sent":
        raise HTTPException(
            status_code=409,
            detail=f"Only 'Sent' estimates can be rejected; current status is '{estimate.status}'.",
        )
    estimate.status = "Rejected"
    estimate.updated_at = now_naive_utc()
    if payload.notes and payload.notes.strip():
        note_line = f"[Customer Feedback {now_utc():%Y-%m-%d %H:%M UTC}]: {payload.notes.strip()}"
        estimate.notes = f"{estimate.notes}\n{note_line}".strip() if estimate.notes else note_line

    _notify_staff_user(
        db,
        tenant_id=portal["tenant_id"],
        recipient_user_id=estimate.assigned_to or estimate.created_by,
        title=f"Estimate {estimate.estimate_number} Rejected",
        message=f"Customer ({portal['email']}) rejected estimate '{estimate.title}'.",
        related_module="software_estimates",
        related_record_id=estimate.id,
    )
    log_audit(
        db,
        tenant_id=portal["tenant_id"],
        user_id=None,
        action="PORTAL_REJECT_ESTIMATE",
        module="software_estimate",
        record_id=estimate.id,
        description=f"Customer {portal['email']} rejected estimate {estimate.estimate_number}",
        after_data={"status": "Rejected", "notes": payload.notes},
    )
    db.commit()
    db.refresh(estimate)
    return estimate


# ==============================================================================
# 6. CONTRACTS & MILESTONES REVIEW + E-SIGNING
# ==============================================================================

@router.get("/contracts", response_model=list[PortalContractResponse])
def list_portal_contracts(
    contract_status: str | None = Query(default=None, alias="status"),
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(SoftwareContract)
        .options(selectinload(SoftwareContract.payment_milestones))
        .filter(
            SoftwareContract.tenant_id == portal["tenant_id"],
            SoftwareContract.account_id == portal["account_id"],
            SoftwareContract.status.in_(VISIBLE_CONTRACT_STATUSES),
        )
    )
    if contract_status:
        query = query.filter(SoftwareContract.status == contract_status)
    return query.order_by(SoftwareContract.created_at.desc()).all()


@router.get("/contracts/{contract_id}", response_model=PortalContractResponse)
def get_portal_contract(
    contract_id: UUID,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    contract = (
        db.query(SoftwareContract)
        .options(selectinload(SoftwareContract.payment_milestones))
        .filter(
            SoftwareContract.id == contract_id,
            SoftwareContract.tenant_id == portal["tenant_id"],
            SoftwareContract.account_id == portal["account_id"],
            SoftwareContract.status.in_(VISIBLE_CONTRACT_STATUSES),
        )
        .first()
    )
    if not contract:
        raise HTTPException(status_code=404, detail="Contract not found for your Account.")
    return contract


@router.post("/contracts/{contract_id}/sign", response_model=PortalContractResponse)
def sign_portal_contract(
    contract_id: UUID,
    payload: PortalContractSignRequest,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    contract = (
        db.query(SoftwareContract)
        .options(selectinload(SoftwareContract.payment_milestones))
        .filter(
            SoftwareContract.id == contract_id,
            SoftwareContract.tenant_id == portal["tenant_id"],
            SoftwareContract.account_id == portal["account_id"],
        )
        .with_for_update()
        .first()
    )
    if not contract or contract.status not in VISIBLE_CONTRACT_STATUSES:
        raise HTTPException(status_code=404, detail="Contract not found for your Account.")
    if contract.status not in {"Sent", "Under Review"}:
        raise HTTPException(
            status_code=409,
            detail=f"Only 'Sent' or 'Under Review' contracts can be signed; current status is '{contract.status}'.",
        )

    contract.status = "Signed"
    contract.signed_date = date.today()
    contract.updated_at = now_naive_utc()
    signer_summary = f"Signed via Customer Portal by {payload.signer_name.strip()}"
    if payload.signer_title and payload.signer_title.strip():
        signer_summary += f" ({payload.signer_title.strip()})"
    signer_summary += f" <{portal['email']}> on {now_utc():%Y-%m-%d %H:%M UTC}."
    if payload.notes and payload.notes.strip():
        signer_summary += f" Notes: {payload.notes.strip()}"
    contract.notes = f"{contract.notes}\n{signer_summary}".strip() if contract.notes else signer_summary

    if contract.payment_milestones:
        first_milestone = min(contract.payment_milestones, key=lambda item: item.sequence)
        if first_milestone.status == "Pending":
            first_milestone.status = "Ready"

    _notify_staff_user(
        db,
        tenant_id=portal["tenant_id"],
        recipient_user_id=contract.assigned_to or contract.created_by,
        title=f"Contract {contract.contract_number} Signed",
        message=f"{payload.signer_name.strip()} ({portal['email']}) signed contract '{contract.title}'.",
        related_module="software_contracts",
        related_record_id=contract.id,
    )
    log_audit(
        db,
        tenant_id=portal["tenant_id"],
        user_id=None,
        action="PORTAL_SIGN_CONTRACT",
        module="software_contracts",
        record_id=contract.id,
        description=f"Customer {portal['email']} signed contract {contract.contract_number}",
        after_data={
            "status": "Signed",
            "signed_date": contract.signed_date.isoformat(),
            "signer_name": payload.signer_name.strip(),
            "signer_title": payload.signer_title,
        },
    )
    db.commit()
    db.refresh(contract)
    return contract


# ==============================================================================
# 7. SOFTWARE PROJECTS & SPRINT DELIVERY VISIBILITY
# ==============================================================================

@router.get("/projects", response_model=list[PortalProjectResponse])
def list_portal_projects(
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(SoftwareProject)
        .join(SoftwareContract, SoftwareContract.id == SoftwareProject.software_contract_id)
        .filter(
            SoftwareProject.tenant_id == portal["tenant_id"],
            SoftwareContract.tenant_id == portal["tenant_id"],
            SoftwareContract.account_id == portal["account_id"],
        )
        .order_by(SoftwareProject.created_at.desc())
        .all()
    )


@router.get("/projects/{project_id}", response_model=PortalProjectDetailResponse)
def get_portal_project(
    project_id: UUID,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    project = (
        db.query(SoftwareProject)
        .join(SoftwareContract, SoftwareContract.id == SoftwareProject.software_contract_id)
        .filter(
            SoftwareProject.id == project_id,
            SoftwareProject.tenant_id == portal["tenant_id"],
            SoftwareContract.tenant_id == portal["tenant_id"],
            SoftwareContract.account_id == portal["account_id"],
        )
        .first()
    )
    if not project:
        raise HTTPException(status_code=404, detail="Project not found for your Account.")
    sprints = (
        db.query(SoftwareSprint)
        .filter(
            SoftwareSprint.tenant_id == portal["tenant_id"],
            SoftwareSprint.software_project_id == project.id,
        )
        .order_by(SoftwareSprint.start_date.asc())
        .all()
    )
    return {
        "id": project.id,
        "project_number": project.project_number,
        "software_contract_id": project.software_contract_id,
        "name": project.name,
        "description": project.description,
        "scope_of_work": project.scope_of_work,
        "deliverables": project.deliverables,
        "status": project.status,
        "priority": project.priority,
        "currency": project.currency,
        "start_date": project.start_date,
        "target_end_date": project.target_end_date,
        "actual_end_date": project.actual_end_date,
        "created_at": project.created_at,
        "updated_at": project.updated_at,
        "sprints": sprints,
    }


# ==============================================================================
# 8. INVOICES, PAYMENTS & CREDIT NOTES
# ==============================================================================

@router.get("/invoices", response_model=list[PortalInvoiceResponse])
def list_portal_invoices(
    invoice_status: str | None = Query(default=None, alias="status"),
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    query = (
        db.query(SoftwareInvoice)
        .join(SoftwareContract, SoftwareContract.id == SoftwareInvoice.software_contract_id)
        .options(
            selectinload(SoftwareInvoice.items),
            selectinload(SoftwareInvoice.payments),
            selectinload(SoftwareInvoice.credit_notes),
        )
        .filter(
            SoftwareInvoice.tenant_id == portal["tenant_id"],
            SoftwareContract.tenant_id == portal["tenant_id"],
            SoftwareContract.account_id == portal["account_id"],
            SoftwareInvoice.status.in_(VISIBLE_INVOICE_STATUSES),
        )
    )
    if invoice_status:
        query = query.filter(SoftwareInvoice.status == invoice_status)
    invoices = query.order_by(SoftwareInvoice.issue_date.desc(), SoftwareInvoice.created_at.desc()).all()
    return [_serialize_portal_invoice(inv) for inv in invoices]


@router.get("/invoices/{invoice_id}", response_model=PortalInvoiceResponse)
def get_portal_invoice(
    invoice_id: UUID,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    invoice = (
        db.query(SoftwareInvoice)
        .join(SoftwareContract, SoftwareContract.id == SoftwareInvoice.software_contract_id)
        .options(
            selectinload(SoftwareInvoice.items),
            selectinload(SoftwareInvoice.payments),
            selectinload(SoftwareInvoice.credit_notes),
        )
        .filter(
            SoftwareInvoice.id == invoice_id,
            SoftwareInvoice.tenant_id == portal["tenant_id"],
            SoftwareContract.tenant_id == portal["tenant_id"],
            SoftwareContract.account_id == portal["account_id"],
            SoftwareInvoice.status.in_(VISIBLE_INVOICE_STATUSES),
        )
        .first()
    )
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found for your Account.")
    return _serialize_portal_invoice(invoice)


# ==============================================================================
# 9. REAL ESTATE BOOKINGS, INSTALLMENT PLANS & SITE VISITS
# ==============================================================================

from app.services.payment_allocation import installment_position


def _serialize_portal_installment(inst, payments, processed_refunds, plan_status: str) -> dict:
    """One schedule row as the customer sees it: the stored fields plus installment-wise paid / pending / remaining.

    Only VERIFIED money counts as paid.  `pending_amount` is submitted money still awaiting finance and
    `payable_amount` is the most a new payment for this installment may be.  Nothing staff-only is exposed.
    """
    pos = installment_position(inst, payments, processed_refunds, plan_status=plan_status)
    linked = sorted((p for p in payments if p.installment_id == inst.id), key=lambda p: p.payment_date or p.created_at, reverse=True)
    return {
        "id": str(inst.id),
        "sequence": inst.sequence,
        "name": inst.name,
        "amount": str(money(inst.amount)),
        "due_date": inst.due_date,
        "status": inst.status,
        "payment_state": pos["state"],
        "paid_amount": str(pos["paid"]),
        "pending_amount": str(pos["pending"]),
        "outstanding_amount": str(pos["outstanding"]),
        "payable_amount": str(pos["payable"]),
        "payments": [
            {
                "id": str(p.id),
                "amount": str(money(p.amount)),
                "status": p.status,
                "payment_method": p.payment_method,
                "transaction_reference": p.transaction_reference,
                "payment_date": p.payment_date,
                "verified_at": p.verified_at,
            }
            for p in linked
        ],
    }


def _serialize_portal_booking(db: Session, tenant_id: UUID, booking: Booking) -> dict:
    prop = db.query(Property).filter(
        Property.id == booking.property_id,
        Property.tenant_id == tenant_id,
    ).first()
    plan = db.query(PaymentPlan).filter(
        PaymentPlan.booking_id == booking.id,
        PaymentPlan.tenant_id == tenant_id,
    ).first()
    installments = (
        db.query(PaymentPlanInstallment)
        .filter(
            PaymentPlanInstallment.payment_plan_id == plan.id,
            PaymentPlanInstallment.tenant_id == tenant_id,
        )
        .order_by(PaymentPlanInstallment.sequence.asc())
        .all()
        if plan
        else []
    )
    payments = (
        db.query(Payment)
        .filter(
            Payment.booking_id == booking.id,
            Payment.tenant_id == tenant_id,
        )
        .order_by(Payment.payment_date.desc())
        .all()
    )
    verified_paid_gross = money(
        sum((Decimal(str(p.amount)) for p in payments if p.status == "Verified"), Decimal("0.00"))
    )
    processed_refunds = db.query(PaymentRefund).filter(
        PaymentRefund.tenant_id == tenant_id,
        PaymentRefund.booking_id == booking.id,
        PaymentRefund.status == "Processed",
    ).all()
    refunded_total = money(sum((Decimal(str(r.amount)) for r in processed_refunds), Decimal("0.00")))
    verified_paid = max(Decimal("0.00"), verified_paid_gross - refunded_total)
    agreed = money(booking.agreed_price)
    remaining = max(agreed - verified_paid, Decimal("0.00"))

    return {
        "id": str(booking.id),
        "status": booking.status,
        "booking_date": booking.booking_date,
        "buyer_name": booking.buyer_name,
        "buyer_email": booking.buyer_email,
        "buyer_phone": booking.buyer_phone,
        "payment_preference": booking.payment_preference,
        "booking_amount": str(money(booking.booking_amount)),
        "agreed_price": str(agreed),
        "verified_paid_amount": str(verified_paid),
        "refunded_amount": str(refunded_total),
        "remaining_balance": str(remaining),
        "refund_amount": str(money(booking.refund_amount)),
        "cancellation_reason": booking.cancellation_reason,
        "property": {
            "id": str(prop.id),
            "name": prop.name,
            "property_type": prop.property_type,
            "listing_type": prop.listing_type,
            "unit_number": prop.unit_number,
            "address": prop.address,
            "city": prop.city,
            "state": prop.state,
            "country": prop.country,
            "area": str(prop.area) if prop.area is not None else None,
            "area_unit": prop.area_unit,
            "currency": prop.currency,
        } if prop else None,
        "payment_plan": {
            "id": str(plan.id),
            "total_amount": str(money(plan.total_amount)),
            "status": plan.status,
            "installments": [
                _serialize_portal_installment(inst, payments, processed_refunds, plan.status)
                for inst in installments
            ],
        } if plan else None,
        "payments": [
            {
                "id": str(p.id),
                "installment_id": str(p.installment_id) if p.installment_id else None,
                "amount": str(money(p.amount)),
                "payment_method": p.payment_method,
                "transaction_reference": p.transaction_reference,
                "status": p.status,
                "payment_date": p.payment_date,
                "verified_at": p.verified_at,
            }
            for p in payments
        ],
    }


@router.get("/bookings")
def list_portal_bookings(
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    bookings = _account_booking_filter(db, portal).order_by(Booking.created_at.desc()).all()
    return [_serialize_portal_booking(db, portal["tenant_id"], b) for b in bookings]


@router.get("/bookings/{booking_id}")
def get_portal_booking(
    booking_id: UUID,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    booking = _account_booking_filter(db, portal).filter(Booking.id == booking_id).first()
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found for your Account.")
    return _serialize_portal_booking(db, portal["tenant_id"], booking)


@router.get("/site-visits")
def list_portal_site_visits(
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    tenant_id = portal["tenant_id"]
    account_id = portal["account_id"]
    contact_id = portal["contact_id"]
    email = (portal.get("email") or "").strip().lower()

    req_filters = [BuyerRequirement.contact_id == contact_id]

    rows = (
        db.query(SiteVisit, PropertyMatch, Property)
        .join(PropertyMatch, PropertyMatch.id == SiteVisit.property_match_id)
        .join(BuyerRequirement, BuyerRequirement.id == PropertyMatch.buyer_requirement_id)
        .join(Property, Property.id == PropertyMatch.property_id)
        .filter(
            SiteVisit.tenant_id == tenant_id,
            PropertyMatch.tenant_id == tenant_id,
            BuyerRequirement.tenant_id == tenant_id,
            Property.tenant_id == tenant_id,
            or_(*req_filters),
        )
        .order_by(SiteVisit.scheduled_start.desc())
        .all()
    )
    result = []
    for visit, match, prop in rows:
        customer_feedback = db.query(CustomerSiteVisitFeedback).filter(
            CustomerSiteVisitFeedback.tenant_id == tenant_id,
            CustomerSiteVisitFeedback.portal_user_id == portal["portal_user_id"],
            CustomerSiteVisitFeedback.site_visit_id == visit.id,
        ).first()
        result.append({
            "id": str(visit.id),
            "scheduled_start": visit.scheduled_start,
            "scheduled_end": visit.scheduled_end,
            "status": visit.status,
            "outcome": visit.outcome,
            "staff_feedback": visit.buyer_feedback,
            "interest_level": visit.interest_level,
            "follow_up_required": visit.follow_up_required,
            "follow_up_date": visit.follow_up_date,
            "customer_feedback": customer_feedback.feedback if customer_feedback else None,
            "customer_rating": customer_feedback.rating if customer_feedback else None,
            "customer_decision": customer_feedback.decision if customer_feedback else None,
            "property": {
                "id": str(prop.id),
                "name": prop.name,
                "property_type": prop.property_type,
                "address": prop.address,
                "city": prop.city,
                "state": prop.state,
            },
        })
    return result


# ==============================================================================
# 10. SHARED CUSTOMER DOCUMENTS (NON-CONFIDENTIAL)
# ==============================================================================

@router.get("/documents", response_model=list[PortalDocumentResponse])
def list_portal_documents(
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    return (
        db.query(Document)
        .filter(
            Document.tenant_id == portal["tenant_id"],
            Document.is_deleted.is_(False),
            Document.shared_with_customer.is_(True),
            Document.is_confidential.is_(False),
            or_(
                Document.account_id == portal["account_id"],
                Document.contact_id == portal["contact_id"],
            ),
        )
        .order_by(Document.created_at.desc())
        .all()
    )



# ==============================================================================
# 11. LOCAL OLLAMA AI REQUIREMENT COLLECTION & CONFIRMATION (PHASE 3)
# ==============================================================================

from app.models.ai_conversation import AIConversation
from app.schemas.ai_conversation import (
    AIConversationResponse,
    AIConversationStartRequest,
    AIConversationSummaryResponse,
    AIMessageSendRequest,
    AIRequirementConfirmRequest,
    AIRequirementReviseRequest,
    PortalAIStatusResponse,
    StaffAIDiagnosticsResponse,
)
from app.services.ai_conversation_service import (
    confirm_ai_requirement,
    get_owned_conversation_or_404,
    process_customer_ai_message,
    revise_ai_requirement,
    start_or_resume_ai_conversation,
)
from app.services.ai_conversation_service import (
    resolve_active_assignee,
    resolve_tenant_ai_industry,
    verify_portal_customer_relationships,
)
from app.services.ollama_service import check_ollama_health


@router.get("/ai/status", response_model=PortalAIStatusResponse)
@limiter.limit("30/minute")
async def customer_portal_ai_status(
    request: Request,
    response: Response,
    portal: dict = Depends(require_portal_user),
):
    """Customer-safe AI readiness check (never exposes server version, URLs, or model lists)."""
    health = await check_ollama_health()
    ready = bool(health.get("available") and health.get("model_present"))
    return PortalAIStatusResponse(
        available=bool(health.get("available")),
        assistant_ready=ready,
        message=(
            "AI requirement assistant is available."
            if ready
            else "AI requirement assistant is temporarily offline; structured requirement collection remains available."
        ),
    )


@router.get(
    "/ai/diagnostics",
    response_model=StaffAIDiagnosticsResponse,
    dependencies=[Depends(require_permission("audit.view"))],
)
async def staff_ai_diagnostics(
    current_user: dict = Depends(require_active_user),
):
    """Staff/Admin-only Ollama diagnostics endpoint."""
    health = await check_ollama_health()
    return StaffAIDiagnosticsResponse(**health)


@router.post(
    "/ai/conversations",
    response_model=AIConversationResponse,
    status_code=201,
)
@limiter.limit("20/minute")
async def start_portal_ai_conversation(
    request: Request,
    response: Response,
    payload: AIConversationStartRequest | None = None,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    req_body = payload or AIConversationStartRequest()
    return await start_or_resume_ai_conversation(
        db=db,
        portal=portal,
        force_new=req_body.force_new,
        initial_message=req_body.initial_message,
    )


@router.get(
    "/ai/conversations",
    response_model=list[AIConversationSummaryResponse],
)
def list_portal_ai_conversations(
    conversation_status: str | None = Query(default=None, alias="status"),
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    query = db.query(AIConversation).filter(
        AIConversation.tenant_id == portal["tenant_id"],
        AIConversation.portal_user_id == portal["portal_user_id"],
    )
    if conversation_status:
        query = query.filter(AIConversation.status == conversation_status)
    return query.order_by(AIConversation.updated_at.desc()).all()


@router.get(
    "/ai/conversations/{conversation_id}",
    response_model=AIConversationResponse,
)
def get_portal_ai_conversation(
    conversation_id: UUID,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    return get_owned_conversation_or_404(
        db=db,
        tenant_id=portal["tenant_id"],
        portal_user_id=portal["portal_user_id"],
        conversation_id=conversation_id,
    )


@router.post(
    "/ai/conversations/{conversation_id}/messages",
    response_model=AIConversationResponse,
)
@limiter.limit("15/minute")
async def send_portal_ai_message(
    request: Request,
    response: Response,
    conversation_id: UUID,
    payload: AIMessageSendRequest,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    return await process_customer_ai_message(
        db=db,
        portal=portal,
        conversation_id=conversation_id,
        message_text=payload.message,
    )


@router.post(
    "/ai/conversations/{conversation_id}/confirm",
    response_model=AIConversationResponse,
)
@limiter.limit("10/minute")
def confirm_portal_ai_requirement(
    request: Request,
    response: Response,
    conversation_id: UUID,
    payload: AIRequirementConfirmRequest,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    return confirm_ai_requirement(
        db=db,
        portal=portal,
        conversation_id=conversation_id,
        confirmed=payload.confirmed,
        customer_notes=payload.customer_notes,
    )


@router.post(
    "/ai/conversations/{conversation_id}/revise",
    response_model=AIConversationResponse,
)
@limiter.limit("10/minute")
async def revise_portal_ai_requirement(
    request: Request,
    response: Response,
    conversation_id: UUID,
    payload: AIRequirementReviseRequest,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    return await revise_ai_requirement(
        db=db,
        portal=portal,
        conversation_id=conversation_id,
        correction_message=payload.correction_message,
        field_updates=payload.field_updates,
    )


# ==============================================================================
# CUSTOMER REAL ESTATE JOURNEY
# These endpoints are portal-user scoped. Staff property-match/site-visit APIs
# remain staff-only and are deliberately not reused here.
# ==============================================================================

def _portal_buyer_requirement_or_404(db: Session, portal: dict, requirement_id: UUID) -> BuyerRequirement:
    requirement = db.query(BuyerRequirement).filter(
        BuyerRequirement.id == requirement_id,
        BuyerRequirement.tenant_id == portal["tenant_id"],
        BuyerRequirement.contact_id == portal["contact_id"],
    ).first()
    if not requirement:
        raise HTTPException(status_code=404, detail="Buyer requirement not found for your portal account.")
    return requirement


def _portal_property_payload(db: Session, prop: Property, match: PropertyMatch) -> dict:
    images = db.query(PropertyImage).filter(
        PropertyImage.tenant_id == prop.tenant_id,
        PropertyImage.property_id == prop.id,
    ).order_by(PropertyImage.is_primary.desc(), PropertyImage.sort_order.asc()).all()
    return {
        "match_id": str(match.id),
        "match_status": match.status,
        "property": {
            "id": str(prop.id),
            "name": prop.name,
            "unit_number": prop.unit_number,
            "property_type": prop.property_type,
            "listing_type": prop.listing_type,
            "description": prop.description,
            "address": prop.address,
            "city": prop.city,
            "state": prop.state,
            "country": prop.country,
            "postal_code": prop.postal_code,
            "price": str(prop.price),
            "price_frequency": prop.price_frequency,
            "security_deposit": str(prop.security_deposit) if prop.security_deposit is not None else None,
            "minimum_term_months": prop.minimum_term_months,
            "maximum_term_months": prop.maximum_term_months,
            "currency": prop.currency,
            "area": str(prop.area) if prop.area is not None else None,
            "area_unit": prop.area_unit,
            "bedrooms": prop.bedrooms,
            "bathrooms": prop.bathrooms,
            "furnishing": prop.furnishing,
            "status": prop.status,
            "images": [
                {"image_url": image.image_url, "image_type": image.image_type, "is_primary": image.is_primary}
                for image in images
            ],
        },
    }


@router.post(
    "/buyer-requirements",
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit("10/minute")
def create_portal_buyer_requirement(
    request: Request,
    response: Response,
    payload: PortalBuyerRequirementCreate,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    """Create a real-estate BuyerRequirement directly from the customer portal.

    The authenticated portal identity supplies tenant/contact/account ownership;
    the request body cannot choose another customer, staff assignee, or status.
    """
    industry_type = resolve_tenant_ai_industry(db, portal["tenant_id"])
    if industry_type != "real_estate":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Manual buyer requirements are available only for Real Estate customers.",
        )

    _account, contact, lead = verify_portal_customer_relationships(db, portal)
    assigned_to = resolve_active_assignee(db, portal["tenant_id"], lead, portal=portal)

    customer_notes = payload.notes.strip() if payload.notes else None
    notes = (
        f"Manually submitted through Customer Portal by {portal['email']}."
        + (f"\nAdditional preferences: {customer_notes}" if customer_notes else "")
    )

    requirement = BuyerRequirement(
        tenant_id=portal["tenant_id"],
        created_by=None,
        lead_id=lead.id if lead else None,
        contact_id=contact.id,
        assigned_to=assigned_to,
        requirement_type=payload.requirement_type,
        property_type=payload.property_type,
        preferred_city=payload.preferred_city,
        preferred_location=payload.preferred_location,
        budget_frequency=payload.budget_frequency or ("One-time" if payload.requirement_type == "Buy" else "Monthly"),
        min_duration_months=payload.min_duration_months,
        max_duration_months=payload.max_duration_months,
        min_budget=payload.min_budget,
        max_budget=payload.max_budget,
        bedrooms=payload.bedrooms,
        min_area=payload.min_area,
        max_area=payload.max_area,
        area_unit=payload.area_unit,
        status="New",
        notes=notes,
    )

    try:
        db.add(requirement)
        db.flush()

        if assigned_to:
            _notify_staff_user(
                db=db,
                tenant_id=portal["tenant_id"],
                recipient_user_id=assigned_to,
                title="New customer buyer requirement",
                message=(
                    f"{contact.full_name} ({portal['email']}) submitted a manual "
                    f"{payload.requirement_type.lower()} requirement for {payload.property_type} "
                    f"in {payload.preferred_city}. Please review and match properties."
                ),
                related_module="buyer_requirements",
                related_record_id=requirement.id,
            )
        else:
            manager_rows = (
                db.query(User.id)
                .join(UserRole, UserRole.user_id == User.id)
                .join(Role, Role.id == UserRole.role_id)
                .filter(
                    User.tenant_id == portal["tenant_id"],
                    User.status == "Active",
                    Role.name.in_(("Tenant Owner", "Tenant Admin", "Manager")),
                )
                .distinct()
                .all()
            )
            for (manager_id,) in manager_rows:
                db.add(Notification(
                    tenant_id=portal["tenant_id"],
                    recipient_user_id=manager_id,
                    workflow_id=None,
                    title="Customer submitted a buyer requirement",
                    message=(
                        f"{contact.full_name} ({portal['email']}) submitted a manual "
                        f"{payload.requirement_type.lower()} requirement for {payload.property_type} "
                        f"in {payload.preferred_city}. Please assign it and arrange property matching."
                    ),
                    notification_type="customer_portal",
                    related_module="buyer_requirements",
                    related_record_id=requirement.id,
                    is_read=False,
                ))

        log_audit(
            db=db,
            tenant_id=portal["tenant_id"],
            user_id=None,
            action="CUSTOMER_PORTAL_MANUAL_CREATE",
            module="buyer_requirements",
            record_id=requirement.id,
            description=f"Customer {portal['email']} submitted a manual buyer requirement.",
            after_data={
                "id": str(requirement.id),
                "contact_id": str(contact.id),
                "lead_id": str(lead.id) if lead else None,
                "requirement_type": requirement.requirement_type,
                "budget_frequency": requirement.budget_frequency,
                "min_duration_months": requirement.min_duration_months,
                "max_duration_months": requirement.max_duration_months,
                "property_type": requirement.property_type,
                "preferred_city": requirement.preferred_city,
                "preferred_location": requirement.preferred_location,
                "min_budget": str(requirement.min_budget) if requirement.min_budget is not None else None,
                "max_budget": str(requirement.max_budget) if requirement.max_budget is not None else None,
                "bedrooms": requirement.bedrooms,
                "min_area": str(requirement.min_area) if requirement.min_area is not None else None,
                "max_area": str(requirement.max_area) if requirement.max_area is not None else None,
                "area_unit": requirement.area_unit,
                "status": requirement.status,
                "assigned_to": str(assigned_to) if assigned_to else None,
            },
        )
        db.commit()
        db.refresh(requirement)
    except Exception:
        db.rollback()
        raise

    return {
        "id": str(requirement.id),
        "requirement_type": requirement.requirement_type,
        "budget_frequency": requirement.budget_frequency,
        "min_duration_months": requirement.min_duration_months,
        "max_duration_months": requirement.max_duration_months,
        "property_type": requirement.property_type,
        "preferred_city": requirement.preferred_city,
        "preferred_location": requirement.preferred_location,
        "min_budget": str(requirement.min_budget) if requirement.min_budget is not None else None,
        "max_budget": str(requirement.max_budget) if requirement.max_budget is not None else None,
        "bedrooms": requirement.bedrooms,
        "min_area": str(requirement.min_area) if requirement.min_area is not None else None,
        "max_area": str(requirement.max_area) if requirement.max_area is not None else None,
        "area_unit": requirement.area_unit,
        "status": requirement.status,
        "created_at": requirement.created_at,
        "updated_at": requirement.updated_at,
    }


@router.get("/buyer-requirements")
def list_portal_buyer_requirements(
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    requirements = db.query(BuyerRequirement).filter(
        BuyerRequirement.tenant_id == portal["tenant_id"],
        BuyerRequirement.contact_id == portal["contact_id"],
    ).order_by(BuyerRequirement.created_at.desc()).all()
    return [
        {
            "id": str(item.id),
            "requirement_type": item.requirement_type,
            "budget_frequency": item.budget_frequency,
            "min_duration_months": item.min_duration_months,
            "max_duration_months": item.max_duration_months,
            "property_type": item.property_type,
            "preferred_city": item.preferred_city,
            "preferred_location": item.preferred_location,
            "min_budget": str(item.min_budget) if item.min_budget is not None else None,
            "max_budget": str(item.max_budget) if item.max_budget is not None else None,
            "bedrooms": item.bedrooms,
            "min_area": str(item.min_area) if item.min_area is not None else None,
            "max_area": str(item.max_area) if item.max_area is not None else None,
            "area_unit": item.area_unit,
            "status": item.status,
            "created_at": item.created_at,
            "updated_at": item.updated_at,
        }
        for item in requirements
    ]


@router.get("/buyer-requirements/{requirement_id}")
def get_portal_buyer_requirement(
    requirement_id: UUID,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    item = _portal_buyer_requirement_or_404(db, portal, requirement_id)
    return {
        "id": str(item.id),
        "requirement_type": item.requirement_type,
        "budget_frequency": item.budget_frequency,
        "min_duration_months": item.min_duration_months,
        "max_duration_months": item.max_duration_months,
        "property_type": item.property_type,
        "preferred_city": item.preferred_city,
        "preferred_location": item.preferred_location,
        "min_budget": str(item.min_budget) if item.min_budget is not None else None,
        "max_budget": str(item.max_budget) if item.max_budget is not None else None,
        "bedrooms": item.bedrooms,
        "min_area": str(item.min_area) if item.min_area is not None else None,
        "max_area": str(item.max_area) if item.max_area is not None else None,
        "area_unit": item.area_unit,
        "status": item.status,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
    }


@router.get("/buyer-requirements/{requirement_id}/matches")
def list_portal_requirement_matches(
    requirement_id: UUID,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    _portal_buyer_requirement_or_404(db, portal, requirement_id)
    rows = db.query(PropertyMatch, Property).join(
        Property, Property.id == PropertyMatch.property_id
    ).filter(
        PropertyMatch.tenant_id == portal["tenant_id"],
        PropertyMatch.buyer_requirement_id == requirement_id,
        Property.tenant_id == portal["tenant_id"],
        Property.status == "Available",
        PropertyMatch.status.in_(["Matched", "Viewed", "Shortlisted"]),
    ).order_by(PropertyMatch.created_at.desc()).all()
    return [_portal_property_payload(db, prop, match) for match, prop in rows]


@router.get("/buyer-requirements/{requirement_id}/shortlist")
def list_portal_shortlisted_properties(
    requirement_id: UUID,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    _portal_buyer_requirement_or_404(db, portal, requirement_id)
    rows = db.query(CustomerPropertyShortlist, PropertyMatch, Property).join(
        PropertyMatch, PropertyMatch.id == CustomerPropertyShortlist.property_match_id
    ).join(Property, Property.id == PropertyMatch.property_id).filter(
        CustomerPropertyShortlist.tenant_id == portal["tenant_id"],
        CustomerPropertyShortlist.portal_user_id == portal["portal_user_id"],
        CustomerPropertyShortlist.buyer_requirement_id == requirement_id,
        PropertyMatch.tenant_id == portal["tenant_id"],
        Property.tenant_id == portal["tenant_id"],
        Property.status == "Available",
    ).order_by(CustomerPropertyShortlist.created_at.desc()).all()
    return [_portal_property_payload(db, prop, match) for _saved, match, prop in rows]


@router.post("/buyer-requirements/{requirement_id}/shortlist", status_code=status.HTTP_201_CREATED)
def add_portal_property_to_shortlist(
    requirement_id: UUID,
    payload: PortalShortlistAddRequest,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    _portal_buyer_requirement_or_404(db, portal, requirement_id)
    row = db.query(PropertyMatch, Property).join(
        Property, Property.id == PropertyMatch.property_id
    ).filter(
        PropertyMatch.id == payload.property_match_id,
        PropertyMatch.tenant_id == portal["tenant_id"],
        PropertyMatch.buyer_requirement_id == requirement_id,
        Property.status == "Available",
        Property.tenant_id == portal["tenant_id"],
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Available matched property not found for this requirement.")
    saved = db.query(CustomerPropertyShortlist).filter(
        CustomerPropertyShortlist.tenant_id == portal["tenant_id"],
        CustomerPropertyShortlist.portal_user_id == portal["portal_user_id"],
        CustomerPropertyShortlist.buyer_requirement_id == requirement_id,
        CustomerPropertyShortlist.property_match_id == payload.property_match_id,
    ).first()
    if not saved:
        saved = CustomerPropertyShortlist(
            tenant_id=portal["tenant_id"],
            portal_user_id=portal["portal_user_id"],
            buyer_requirement_id=requirement_id,
            property_match_id=payload.property_match_id,
        )
        db.add(saved)
        db.commit()
        db.refresh(saved)
    return {"id": str(saved.id), "buyer_requirement_id": str(requirement_id), "property_match_id": str(payload.property_match_id), "created_at": saved.created_at}


@router.delete("/buyer-requirements/{requirement_id}/shortlist/{property_match_id}")
def remove_portal_property_from_shortlist(
    requirement_id: UUID,
    property_match_id: UUID,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    _portal_buyer_requirement_or_404(db, portal, requirement_id)
    saved = db.query(CustomerPropertyShortlist).filter(
        CustomerPropertyShortlist.tenant_id == portal["tenant_id"],
        CustomerPropertyShortlist.portal_user_id == portal["portal_user_id"],
        CustomerPropertyShortlist.buyer_requirement_id == requirement_id,
        CustomerPropertyShortlist.property_match_id == property_match_id,
    ).first()
    if not saved:
        raise HTTPException(status_code=404, detail="Property is not in your shortlist.")
    db.delete(saved)
    db.commit()
    return {"message": "Property removed from your shortlist."}


@router.post("/site-visits/requests", status_code=status.HTTP_201_CREATED)
def request_portal_site_visit(
    payload: PortalSiteVisitRequest,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    match_row = db.query(PropertyMatch, BuyerRequirement).join(
        BuyerRequirement, BuyerRequirement.id == PropertyMatch.buyer_requirement_id
    ).join(Property, Property.id == PropertyMatch.property_id).filter(
        PropertyMatch.id == payload.property_match_id,
        PropertyMatch.tenant_id == portal["tenant_id"],
        BuyerRequirement.tenant_id == portal["tenant_id"],
        BuyerRequirement.contact_id == portal["contact_id"],
        Property.tenant_id == portal["tenant_id"],
        Property.status == "Available",
    ).first()
    if not match_row:
        raise HTTPException(status_code=404, detail="Matched property not found for your portal account.")
    match, requirement = match_row
    shortlisted = db.query(CustomerPropertyShortlist.id).filter(
        CustomerPropertyShortlist.tenant_id == portal["tenant_id"],
        CustomerPropertyShortlist.portal_user_id == portal["portal_user_id"],
        CustomerPropertyShortlist.buyer_requirement_id == match.buyer_requirement_id,
        CustomerPropertyShortlist.property_match_id == match.id,
    ).first()
    if not shortlisted:
        raise HTTPException(status_code=409, detail="Add this property to your shortlist before requesting a site visit.")
    duplicate = db.query(SiteVisit.id).filter(
        SiteVisit.tenant_id == portal["tenant_id"],
        SiteVisit.property_match_id == match.id,
        SiteVisit.status.in_(["Requested", "Scheduled", "Rescheduled"]),
    ).first()
    if duplicate:
        raise HTTPException(status_code=409, detail="A site visit is already requested or scheduled for this property.")

    start = payload.scheduled_start
    end = payload.scheduled_end
    if start.tzinfo is not None:
        start = start.astimezone(timezone.utc).replace(tzinfo=None)
    if end.tzinfo is not None:
        end = end.astimezone(timezone.utc).replace(tzinfo=None)
    visit = SiteVisit(
        tenant_id=portal["tenant_id"],
        property_match_id=match.id,
        assigned_to=match.assigned_to or requirement.assigned_to,
        created_by=None,
        scheduled_start=start,
        scheduled_end=end,
        status="Requested",
    )
    try:
        db.add(visit)
        db.flush()
        _notify_staff_user(
            db=db,
            tenant_id=portal["tenant_id"],
            recipient_user_id=match.assigned_to or requirement.assigned_to,
            title="Customer requested a property site visit",
            message="A customer has requested a site visit. Please review the requested time and confirm or reschedule it.",
            related_module="site_visits",
            related_record_id=visit.id,
        )
        log_audit(
            db=db,
            tenant_id=portal["tenant_id"],
            user_id=None,
            action="CREATE",
            module="site_visits",
            record_id=visit.id,
            description="Customer portal user requested a property site visit.",
            after_data={
                "id": visit.id,
                "property_match_id": visit.property_match_id,
                "scheduled_start": visit.scheduled_start,
                "scheduled_end": visit.scheduled_end,
                "status": visit.status,
            },
        )
        db.commit()
        db.refresh(visit)
    except Exception:
        db.rollback()
        raise
    return {
        "id": str(visit.id),
        "property_match_id": str(visit.property_match_id),
        "scheduled_start": visit.scheduled_start,
        "scheduled_end": visit.scheduled_end,
        "status": visit.status,
        "message": "Your site-visit request has been submitted. The property team must confirm the appointment.",
    }


# ==============================================================================


# ---------------------------------------------------------------------------
# Customer-side property offer negotiation
# ---------------------------------------------------------------------------

def _portal_owned_match(db: Session, portal: dict, match_id: UUID, lock: bool = False) -> tuple[PropertyMatch, BuyerRequirement]:
    query = db.query(PropertyMatch).filter(
        PropertyMatch.id == match_id,
        PropertyMatch.tenant_id == portal["tenant_id"],
    )
    if lock:
        query = query.with_for_update()
    match = query.first()
    if not match:
        raise HTTPException(status_code=404, detail="Property match not found for this customer.")
    requirement = db.query(BuyerRequirement).filter(
        BuyerRequirement.id == match.buyer_requirement_id,
        BuyerRequirement.tenant_id == portal["tenant_id"],
        BuyerRequirement.contact_id == portal["contact_id"],
    ).first()
    if not requirement:
        raise HTTPException(status_code=404, detail="Property match not found for this customer.")
    return match, requirement


def _portal_offer_or_404(db: Session, portal: dict, offer_id: UUID) -> PropertyOffer:
    offer = db.query(PropertyOffer).filter(
        PropertyOffer.id == offer_id,
        PropertyOffer.tenant_id == portal["tenant_id"],
    ).first()
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found.")
    _portal_owned_match(db, portal, offer.property_match_id)
    return offer


@router.get("/property-matches/{match_id}/offers", response_model=list[PropertyOfferResponse])
def portal_list_property_offers(
    match_id: UUID,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    _portal_owned_match(db, portal, match_id)
    return db.query(PropertyOffer).filter(
        PropertyOffer.tenant_id == portal["tenant_id"],
        PropertyOffer.property_match_id == match_id,
    ).order_by(PropertyOffer.created_at.asc()).all()


@router.post("/property-offers", response_model=PropertyOfferResponse, status_code=status.HTTP_201_CREATED)
def portal_create_property_offer(
    payload: PropertyOfferCreate,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    match, _requirement = _portal_owned_match(db, portal, payload.property_match_id, lock=True)
    prop = db.query(Property).filter(
        Property.id == match.property_id, Property.tenant_id == portal["tenant_id"]
    ).with_for_update().first()
    if not prop:
        raise HTTPException(status_code=404, detail="Matched property not found.")
    if prop.listing_type not in ("Rent", "Lease", "Sale"):
        raise HTTPException(status_code=400, detail="Customer portal offers are available only for Sale, Rent, and Lease listings.")
    unresolved = db.query(PropertyOffer.id).filter(
        PropertyOffer.tenant_id == portal["tenant_id"],
        PropertyOffer.property_match_id == match.id,
        PropertyOffer.status.in_(("Submitted", "Countered")),
    ).first()
    if unresolved:
        raise HTTPException(status_code=409, detail="An offer is already waiting for the other party. Respond to it before submitting another offer.")
    row = PropertyOffer(
        tenant_id=portal["tenant_id"], property_match_id=match.id,
        offered_price=payload.offered_price, price_frequency=prop.price_frequency or "Monthly",
        terms=payload.terms, expires_at=payload.expires_at or now_naive_utc() + timedelta(days=7), created_by=None, status="Submitted", offer_type="Buyer",
    )
    db.add(row)
    db.flush()
    recipient = match.assigned_to or _requirement.assigned_to or _requirement.created_by
    _notify_staff_user(db, portal["tenant_id"], recipient, "Customer submitted a property offer",
        f"A customer submitted an offer of {payload.offered_price} for property match {match.id}. Please review and respond.",
        "property_offers", row.id)
    log_audit(db, portal["tenant_id"], None, "CUSTOMER_CREATE", "property_offers", row.id,
        f"Customer {portal['email']} submitted an offer", after_data={"offered_price": str(row.offered_price), "property_match_id": str(match.id), "offer_type": "Buyer"})
    db.commit(); db.refresh(row)
    return row


@router.post("/property-offers/{offer_id}/decision", response_model=PropertyOfferResponse)
def portal_decide_property_offer(
    offer_id: UUID,
    payload: PropertyOfferDecision,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    row = _portal_offer_or_404(db, portal, offer_id)
    if row.offer_type != "Seller":
        raise HTTPException(status_code=403, detail="Customers can respond only to offers or counteroffers created by staff.")
    if row.status not in ("Submitted", "Countered"):
        raise HTTPException(status_code=409, detail="Only submitted offers can receive a customer decision.")
    if row.expires_at and row.expires_at <= now_naive_utc():
        row.status = "Expired"
        db.commit()
        raise HTTPException(status_code=409, detail="This offer has expired and can no longer be accepted or countered.")
    if payload.decision == "Withdrawn":
        raise HTTPException(status_code=400, detail="A customer cannot withdraw a staff offer. Accept, reject, or counter it.")
    if payload.decision == "Countered" and payload.counter_price is None:
        raise HTTPException(status_code=400, detail="counter_price is required for a counteroffer.")
    match, requirement = _portal_owned_match(db, portal, row.property_match_id)
    prop = db.query(Property).filter(Property.id == match.property_id, Property.tenant_id == portal["tenant_id"]).with_for_update().first()
    if payload.decision == "Accepted":
        if not prop:
            raise HTTPException(status_code=404, detail="Property not found.")
        if prop.offer_hold_expires_at and prop.offer_hold_expires_at <= now_naive_utc():
            prop.status = "Available"
            prop.offer_hold_expires_at = None
        if prop.status != "Available":
            raise HTTPException(status_code=409, detail="This property is no longer available for a new accepted offer.")
        if prop.minimum_acceptable_price is not None and row.offered_price < prop.minimum_acceptable_price:
            raise HTTPException(status_code=409, detail=f"Offer is below the property's minimum acceptable price ({prop.minimum_acceptable_price}).")
        competing = db.query(PropertyOffer.id).join(PropertyMatch, PropertyMatch.id == PropertyOffer.property_match_id).filter(
            PropertyOffer.tenant_id == portal["tenant_id"], PropertyMatch.tenant_id == portal["tenant_id"],
            PropertyMatch.property_id == prop.id, PropertyOffer.id != row.id,
            PropertyOffer.status.in_(("Accepted", "Pending Owner Approval")),
            (PropertyOffer.expires_at.is_(None) | (PropertyOffer.expires_at > now_naive_utc())),
            (PropertyOffer.hold_expires_at.is_(None) | (PropertyOffer.hold_expires_at > now_naive_utc())),
        ).first()
        if competing:
            raise HTTPException(status_code=409, detail="Another buyer already has an accepted or owner-pending offer on this property.")
        row.status = "Pending Owner Approval" if prop.require_owner_approval else "Accepted"
        if row.status == "Accepted":
            match.status = "Offer Accepted"
            if requirement.lead_id:
                lead = db.query(Lead).filter(Lead.id == requirement.lead_id, Lead.tenant_id == portal["tenant_id"]).first()
                if lead:
                    lead.status = "Offer Accepted"
            if prop.hold_on_offer_acceptance:
                from datetime import timedelta
                prop.offer_hold_expires_at = now_naive_utc() + timedelta(hours=max(1, prop.offer_hold_hours or 48))
                row.hold_expires_at = prop.offer_hold_expires_at
                row.expires_at = min(row.expires_at, row.hold_expires_at) if row.expires_at else row.hold_expires_at
                prop.status = "Reserved"
    else:
        row.status = payload.decision
    row.response_notes = payload.response_notes
    row.responded_by = None
    row.responded_at = now_naive_utc()
    row.updated_at = now_naive_utc()
    db.flush()
    if payload.decision == "Countered":
        counter = PropertyOffer(
            tenant_id=portal["tenant_id"], property_match_id=row.property_match_id,
            parent_offer_id=row.id, offered_price=payload.counter_price,
            price_frequency=row.price_frequency, terms=payload.counter_terms or row.terms,
            expires_at=now_naive_utc() + timedelta(days=7), created_by=None, status="Submitted", offer_type="Buyer",
        )
        db.add(counter)
        db.flush()
        _notify_staff_user(db, portal["tenant_id"], match.assigned_to or requirement.assigned_to or requirement.created_by,
            "Customer sent a property counteroffer", f"The customer countered with {payload.counter_price}. Please review the property counteroffer.",
            "property_offers", counter.id)
    else:
        # An accepted offer is the commercial source of truth for the agreement.
        _notify_staff_user(db, portal["tenant_id"], match.assigned_to or requirement.assigned_to or requirement.created_by,
            f"Customer {payload.decision.lower()} the rental offer",
            f"The customer {payload.decision.lower()} offer {row.id}.", "property_offers", row.id)
    log_audit(db, portal["tenant_id"], None, "CUSTOMER_DECISION", "property_offers", row.id,
        f"Customer {portal['email']} {payload.decision.lower()} offer", after_data={"status": row.status, "response_notes": row.response_notes, "counter_price": str(payload.counter_price) if payload.counter_price is not None else None})
    db.commit(); db.refresh(row)
    return row


# ---------------------------------------------------------------------------
# Rental and lease customer-portal lifecycle
# ---------------------------------------------------------------------------

def _portal_rental_agreement(db: Session, portal: dict, agreement_id: UUID) -> RentalAgreement:
    row = db.query(RentalAgreement).filter(
        RentalAgreement.id == agreement_id,
        RentalAgreement.tenant_id == portal["tenant_id"],
        RentalAgreement.contact_id == portal["contact_id"],
    ).first()
    if not row or row.status in ("Draft", "Cancelled"):
        raise HTTPException(status_code=404, detail="Rental agreement not found for this customer.")
    return row


def _portal_rental_agreement_payload(row: RentalAgreement) -> dict:
    return {
        "id": str(row.id), "property_id": str(row.property_id),
        "agreement_type": row.agreement_type, "status": row.status,
        "customer_name": row.customer_name, "customer_email": row.customer_email,
        "customer_phone": row.customer_phone, "rent_amount": str(row.rent_amount),
        "rent_frequency": row.rent_frequency, "deposit_amount": str(row.deposit_amount),
        "maintenance_amount": str(row.maintenance_amount),
        "maintenance_frequency": row.maintenance_frequency,
        "agreement_start": row.agreement_start, "agreement_end": row.agreement_end,
        "lock_in_months": row.lock_in_months, "notice_period_days": row.notice_period_days,
        "due_day": row.due_day, "late_fee_type": row.late_fee_type,
        "late_fee_amount": str(row.late_fee_amount), "late_fee_grace_days": row.late_fee_grace_days,
        "escalation_percentage": str(row.escalation_percentage) if row.escalation_percentage is not None else None,
        "escalation_interval_months": row.escalation_interval_months,
        "agreement_document_url": row.agreement_document_url,
        "signed_at": row.signed_at, "customer_signed_at": row.customer_signed_at,
        "customer_signature_name": row.customer_signature_name,
        "customer_signature_method": row.customer_signature_method,
        "customer_signature_document_url": row.customer_signature_document_url,
        "customer_signature_ip": row.customer_signature_ip,
        "customer_signature_user_agent": row.customer_signature_user_agent,
        "activated_at": row.activated_at,
        "notes": row.notes, "created_at": row.created_at, "updated_at": row.updated_at,
    }


def _portal_rental_payment_payload(row: RentalPayment) -> dict:
    return {
        "id": str(row.id), "agreement_id": str(row.agreement_id),
        "schedule_id": str(row.schedule_id) if row.schedule_id else None,
        "settlement_id": str(row.settlement_id) if row.settlement_id else None,
        "payment_type": row.payment_type, "amount": str(row.amount),
        "payment_method": row.payment_method, "transaction_reference": row.transaction_reference,
        "proof_document_url": row.proof_document_url, "receipt_number": row.receipt_number,
        "payment_date": row.payment_date, "status": row.status,
        "verified_at": row.verified_at, "notes": row.notes, "created_at": row.created_at,
    }


@router.get("/rental-agreements")
def portal_list_rental_agreements(
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    rows = db.query(RentalAgreement).filter(
        RentalAgreement.tenant_id == portal["tenant_id"],
        RentalAgreement.contact_id == portal["contact_id"],
        RentalAgreement.status.notin_(("Draft", "Cancelled")),
    ).order_by(RentalAgreement.created_at.desc()).all()
    return [_portal_rental_agreement_payload(row) for row in rows]


@router.get("/rental-agreements/{agreement_id}")
def portal_read_rental_agreement(
    agreement_id: UUID,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    row = _portal_rental_agreement(db, portal, agreement_id)
    schedules = db.query(RentalPaymentSchedule).filter(
        RentalPaymentSchedule.tenant_id == portal["tenant_id"],
        RentalPaymentSchedule.agreement_id == row.id,
    ).order_by(RentalPaymentSchedule.sequence.asc()).all()
    payments = db.query(RentalPayment).filter(
        RentalPayment.tenant_id == portal["tenant_id"],
        RentalPayment.agreement_id == row.id,
    ).order_by(RentalPayment.created_at.desc()).all()
    inspections = db.query(RentalInspection).filter(
        RentalInspection.tenant_id == portal["tenant_id"],
        RentalInspection.agreement_id == row.id,
    ).order_by(RentalInspection.inspected_at.asc()).all()
    settlement = db.query(RentalSettlement).filter(
        RentalSettlement.tenant_id == portal["tenant_id"], RentalSettlement.agreement_id == row.id,
    ).first()
    schedule_payload = []
    for item in schedules:
        paid = money(db.query(func.coalesce(func.sum(RentalPayment.amount), 0)).filter(
            RentalPayment.tenant_id == portal["tenant_id"], RentalPayment.schedule_id == item.id,
            RentalPayment.status == "Verified",
        ).scalar())
        if item.charge_type == "Rent" and row.late_fee_amount > 0 and date.today() > item.due_date + timedelta(days=row.late_fee_grace_days or 0) and item.late_fee_applied_at is None and paid < money(item.amount):
            if row.late_fee_type == "Percentage":
                item.late_fee_amount = money(money(item.amount) * money(row.late_fee_amount) / Decimal("100"))
            else:
                item.late_fee_amount = money(row.late_fee_amount)
            item.late_fee_applied_at = now_naive_utc()
        total_due = money(item.amount) + money(item.late_fee_amount)
        item.status = "Paid" if paid >= total_due else ("Partially Paid" if paid > 0 else ("Overdue" if item.due_date < date.today() else "Pending"))
        schedule_payload.append({
            "id": str(item.id), "sequence": item.sequence, "charge_type": item.charge_type,
            "period_start": item.period_start, "period_end": item.period_end,
            "due_date": item.due_date, "amount": str(item.amount), "late_fee_amount": str(item.late_fee_amount),
            "total_due": str(total_due), "paid": str(paid),
            "outstanding": str(max(Decimal("0.00"), total_due - paid)), "status": item.status,
        })
    db.commit()
    inspection_payload = [{
        "id": str(item.id), "inspection_type": item.inspection_type, "condition": item.condition,
        "damage_details": item.damage_details, "damage_amount": str(item.damage_amount),
        "photographs": item.photographs or [], "meter_readings": item.meter_readings,
        "inspected_at": item.inspected_at, "tenant_acknowledged": item.tenant_acknowledged,
        "tenant_acknowledgement_notes": item.tenant_acknowledgement_notes,
        "tenant_acknowledged_at": item.tenant_acknowledged_at, "notes": item.notes,
    } for item in inspections]
    settlement_payload = None if not settlement else {
        "id": str(settlement.id), "status": settlement.status,
        "deposit_balance": str(settlement.deposit_balance), "rent_arrears": str(settlement.rent_arrears),
        "utility_charges": str(settlement.utility_charges), "damage_charges": str(settlement.damage_charges),
        "early_exit_charge": str(settlement.early_exit_charge), "notice_shortfall_charge": str(settlement.notice_shortfall_charge),
        "other_charges": str(settlement.other_charges), "deductions_total": str(settlement.deductions_total),
        "refund_amount": str(settlement.refund_amount), "amount_due_from_tenant": str(settlement.amount_due_from_tenant),
        "approved_at": settlement.approved_at, "refunded_at": settlement.refunded_at,
    }
    return {"agreement": _portal_rental_agreement_payload(row), "payment_schedule": schedule_payload,
            "payments": [_portal_rental_payment_payload(item) for item in payments],
            "inspections": inspection_payload, "settlement": settlement_payload}


@router.post("/rental-agreements/{agreement_id}/sign")
def portal_sign_rental_agreement(
    agreement_id: UUID,
    payload: RentalAgreementSignRequest,
    request: Request,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    agreement = _portal_rental_agreement(db, portal, agreement_id)
    if agreement.status != "Pending Signature":
        raise HTTPException(status_code=409, detail="Only a pending-signature rental agreement can be signed.")
    if not agreement.agreement_document_url:
        raise HTTPException(status_code=409, detail="The agreement document is not available for review.")
    contact = db.query(Contact).filter(Contact.id == portal["contact_id"], Contact.tenant_id == portal["tenant_id"]).first()
    if not contact:
        raise HTTPException(status_code=404, detail="Customer contact was not found.")
    if agreement.customer_signed_at:
        raise HTTPException(status_code=409, detail="This customer has already signed the agreement.")
    typed_name = payload.signature_name.strip()
    if typed_name.casefold() != contact.full_name.strip().casefold():
        raise HTTPException(status_code=400, detail="Typed signature name must match the authenticated contact's full name.")
    agreement.customer_signed_at = now_naive_utc()
    agreement.customer_signature_name = typed_name
    agreement.customer_signature_method = "Typed Name + Affirmative Consent"
    agreement.customer_signature_ip = request.client.host if request and request.client else None
    agreement.customer_signature_user_agent = (request.headers.get("user-agent", "")[:500] if request else None)
    _notify_staff_user(db, portal["tenant_id"], agreement.created_by, "Customer signed rental agreement",
        f"{contact.full_name} accepted and signed rental agreement {agreement.id}. Please verify the owner signature and deposit before activation.",
        "rental_agreements", agreement.id)
    log_audit(db, portal["tenant_id"], None, "CUSTOMER_SIGN", "rental_agreements", agreement.id,
        f"Customer {portal['email']} signed the rental agreement", after_data={
            "customer_signed_at": agreement.customer_signed_at.isoformat(),
            "customer_signature_name": typed_name,
            "signature_method": agreement.customer_signature_method,
            "signature_ip": agreement.customer_signature_ip,
            "signature_user_agent": agreement.customer_signature_user_agent,
            "accepted_terms": payload.accepted_terms,
        })
    db.commit()
    return {"agreement_id": str(agreement.id), "customer_signed_at": agreement.customer_signed_at,
            "customer_signature_name": agreement.customer_signature_name,
            "signature_method": agreement.customer_signature_method}


@router.post("/rental-agreements/{agreement_id}/inspections/{inspection_id}/acknowledge")
def portal_acknowledge_rental_inspection(
    agreement_id: UUID,
    inspection_id: UUID,
    payload: RentalInspectionAcknowledge,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    agreement = _portal_rental_agreement(db, portal, agreement_id)
    inspection = db.query(RentalInspection).filter(
        RentalInspection.id == inspection_id,
        RentalInspection.tenant_id == portal["tenant_id"],
        RentalInspection.agreement_id == agreement.id,
    ).with_for_update().first()
    if not inspection:
        raise HTTPException(status_code=404, detail="Inspection not found for this agreement.")
    if inspection.tenant_acknowledged:
        raise HTTPException(status_code=409, detail="This inspection has already been acknowledged.")
    inspection.tenant_acknowledged = True
    inspection.tenant_acknowledgement_notes = payload.notes
    inspection.tenant_acknowledged_at = now_naive_utc()
    _notify_staff_user(db, portal["tenant_id"], agreement.created_by, "Customer acknowledged rental inspection",
        f"{agreement.customer_name} acknowledged the {inspection.inspection_type.lower()} inspection for agreement {agreement.id}.",
        "rental_inspections", inspection.id)
    log_audit(db, portal["tenant_id"], None, "CUSTOMER_ACKNOWLEDGE", "rental_inspections", inspection.id,
        f"Customer {portal['email']} acknowledged rental inspection", after_data={"tenant_acknowledged": True, "notes": payload.notes})
    db.commit()
    return {"inspection_id": str(inspection.id), "tenant_acknowledged": True, "tenant_acknowledged_at": inspection.tenant_acknowledged_at}


@router.post("/rental-agreements/{agreement_id}/payments", status_code=status.HTTP_201_CREATED)
def portal_submit_rental_payment(
    agreement_id: UUID,
    payload: RentalPaymentCreate,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    agreement = _portal_rental_agreement(db, portal, agreement_id)
    if payload.payment_type in ("Rent", "Maintenance") and not payload.schedule_id:
        raise HTTPException(status_code=400, detail="Select the relevant rent or maintenance schedule item before submitting a payment.")
    if payload.payment_type == "Other":
        raise HTTPException(status_code=400, detail="Other/manual charges must be recorded by staff. Customers can submit deposits, rent, and maintenance payments.")
    if payload.payment_type == "Deposit":
        if agreement.status != "Pending Signature":
            raise HTTPException(status_code=409, detail="The initial security deposit can be submitted only while the agreement is pending signature.")
    elif agreement.status not in ("Active", "Expired", "Termination Requested"):
        raise HTTPException(status_code=409, detail="Recurring payments can be submitted only for an active or expired-but-not-handed-over agreement.")
    schedule = None
    if payload.payment_type == "Deposit":
        if not agreement.customer_signed_at:
            raise HTTPException(status_code=409, detail="Sign the rental agreement before submitting the initial security deposit.")
        reserved_deposit = db.query(func.coalesce(func.sum(RentalPayment.amount), 0)).filter(
            RentalPayment.tenant_id == portal["tenant_id"],
            RentalPayment.agreement_id == agreement.id,
            RentalPayment.payment_type == "Deposit",
            RentalPayment.status.in_(("Pending", "Under Verification", "Verified")),
        ).scalar() or 0
        if money(reserved_deposit) + money(payload.amount) > money(agreement.deposit_amount):
            raise HTTPException(status_code=400, detail="Deposit payment exceeds the agreed security deposit.")
    if payload.schedule_id:
        schedule = db.query(RentalPaymentSchedule).filter(
            RentalPaymentSchedule.id == payload.schedule_id,
            RentalPaymentSchedule.tenant_id == portal["tenant_id"],
            RentalPaymentSchedule.agreement_id == agreement.id,
        ).first()
        if not schedule:
            raise HTTPException(status_code=404, detail="Rental payment schedule item not found.")
        if payload.payment_type != schedule.charge_type:
            raise HTTPException(status_code=400, detail=f"This schedule item accepts {schedule.charge_type} payments only.")
        if schedule.charge_type == "Rent" and agreement.late_fee_amount > 0 and date.today() > schedule.due_date + timedelta(days=agreement.late_fee_grace_days or 0) and schedule.late_fee_applied_at is None:
            if agreement.late_fee_type == "Percentage":
                schedule.late_fee_amount = money(money(schedule.amount) * money(agreement.late_fee_amount) / Decimal("100"))
            else:
                schedule.late_fee_amount = money(agreement.late_fee_amount)
            schedule.late_fee_applied_at = now_naive_utc()
        reserved = db.query(func.coalesce(func.sum(RentalPayment.amount), 0)).filter(
            RentalPayment.tenant_id == portal["tenant_id"],
            RentalPayment.schedule_id == schedule.id,
            RentalPayment.status.in_(("Pending", "Under Verification", "Verified")),
        ).scalar() or 0
        total_due = money(schedule.amount) + money(schedule.late_fee_amount)
        if money(payload.amount) + money(reserved) > total_due:
            raise HTTPException(status_code=400, detail=f"Payment exceeds the remaining scheduled amount including late fees ({max(Decimal('0.00'), total_due - money(reserved))}).")
    payment = RentalPayment(
        tenant_id=portal["tenant_id"], agreement_id=agreement.id,
        schedule_id=schedule.id if schedule else None, settlement_id=None, payment_type=payload.payment_type,
        amount=payload.amount, payment_method=payload.payment_method,
        transaction_reference=payload.transaction_reference, proof_document_url=payload.proof_document_url,
        payment_date=payload.payment_date, status="Under Verification", created_by=None, notes=payload.notes,
    )
    db.add(payment)
    db.flush()
    _notify_staff_user(db, portal["tenant_id"], agreement.created_by, "Customer submitted rental payment",
        f"{agreement.customer_name} submitted a {payload.payment_type.lower()} payment of {payload.amount} for rental agreement {agreement.id}.",
        "rental_payments", payment.id)
    db.commit(); db.refresh(payment)
    return _portal_rental_payment_payload(payment)


@router.get("/rental-agreements/{agreement_id}/payments/{payment_id}/receipt")
def portal_read_rental_payment_receipt(
    agreement_id: UUID, payment_id: UUID,
    portal: dict = Depends(require_portal_user), db: Session = Depends(get_db),
):
    agreement = _portal_rental_agreement(db, portal, agreement_id)
    payment = db.query(RentalPayment).filter(
        RentalPayment.id == payment_id, RentalPayment.tenant_id == portal["tenant_id"],
        RentalPayment.agreement_id == agreement.id,
    ).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Rental payment not found.")
    if payment.status != "Verified" or not payment.receipt_number:
        raise HTTPException(status_code=409, detail="A receipt is available only after payment verification.")
    prop = db.query(Property).filter(Property.id == agreement.property_id, Property.tenant_id == portal["tenant_id"]).first()
    return {"receipt_number": payment.receipt_number, "payment_id": str(payment.id),
            "agreement_id": str(agreement.id), "customer_name": agreement.customer_name,
            "payment_type": payment.payment_type, "amount": str(payment.amount),
            "currency": prop.currency if prop else "INR", "payment_method": payment.payment_method,
            "transaction_reference": payment.transaction_reference,
            "payment_date": payment.payment_date, "verified_at": payment.verified_at,
            "notes": payment.notes}


@router.post("/rental-agreements/{agreement_id}/exit-requests", status_code=status.HTTP_201_CREATED)
def portal_request_rental_exit(
    agreement_id: UUID,
    payload: RentalExitRequestCreate,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    agreement = _portal_rental_agreement(db, portal, agreement_id)
    if agreement.status not in ("Active", "Expired"):
        raise HTTPException(status_code=409, detail="Only an active or expired-but-not-handed-over agreement can receive an exit request.")
    if payload.requested_vacate_date < date.today():
        raise HTTPException(status_code=400, detail="Requested vacate date cannot be in the past.")
    if payload.notice_served_date and payload.notice_served_date > date.today():
        raise HTTPException(status_code=400, detail="Notice served date cannot be in the future.")
    existing = db.query(RentalExitRequest).filter(
        RentalExitRequest.tenant_id == portal["tenant_id"],
        RentalExitRequest.agreement_id == agreement.id,
        RentalExitRequest.status.in_(("Requested", "Under Review", "Approved", "Inspection Pending", "Settlement Pending")),
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="An exit request is already open for this agreement.")
    row = RentalExitRequest(
        tenant_id=portal["tenant_id"], agreement_id=agreement.id,
        requested_vacate_date=payload.requested_vacate_date,
        notice_served_date=payload.notice_served_date or date.today(),
        reason=payload.reason, status="Requested", created_by=None,
    )
    agreement.status = "Termination Requested"
    db.add(row)
    db.flush()
    _notify_staff_user(db, portal["tenant_id"], agreement.created_by, "Customer requested rental termination",
        f"{agreement.customer_name} requested to vacate on {payload.requested_vacate_date.isoformat()}. Please review the lock-in and notice terms.",
        "rental_exit_requests", row.id)
    db.commit(); db.refresh(row)
    lock_end = agreement.agreement_start
    month_index = lock_end.month - 1 + agreement.lock_in_months
    year = lock_end.year + month_index // 12
    month = month_index % 12 + 1
    day = min(lock_end.day, calendar.monthrange(year, month)[1])
    lock_end = date(year, month, day)
    return {"id": str(row.id), "status": row.status, "requested_vacate_date": row.requested_vacate_date, "inside_lock_in": row.requested_vacate_date < lock_end, "lock_in_end_date": lock_end}


@router.post("/rental-agreements/{agreement_id}/renewals", status_code=status.HTTP_201_CREATED)
def portal_request_rental_renewal(
    agreement_id: UUID,
    payload: RentalRenewalCreate,
    portal: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    agreement = _portal_rental_agreement(db, portal, agreement_id)
    if agreement.status not in ("Active", "Expired"):
        raise HTTPException(status_code=409, detail="Only active or expired agreements can be renewed.")
    if agreement.agreement_end is None or payload.new_end_date <= agreement.agreement_end:
        raise HTTPException(status_code=400, detail="Renewal end date must extend the current fixed-term agreement.")
    current = db.query(func.coalesce(func.max(RentalAgreementRevision.revision_number), 0)).filter(
        RentalAgreementRevision.tenant_id == portal["tenant_id"],
        RentalAgreementRevision.agreement_id == agreement.id,
    ).scalar() or 0
    revision = RentalAgreementRevision(
        tenant_id=portal["tenant_id"], agreement_id=agreement.id,
        revision_number=int(current) + 1, revision_type="Renewal",
        old_end_date=agreement.agreement_end, new_end_date=payload.new_end_date,
        old_rent_amount=agreement.rent_amount, new_rent_amount=payload.new_rent_amount,
        reason=payload.reason, status="Pending", requested_by=None,
    )
    db.add(revision)
    db.flush()
    _notify_staff_user(db, portal["tenant_id"], agreement.created_by, "Customer requested rental renewal",
        f"{agreement.customer_name} requested renewal through {payload.new_end_date.isoformat()} at {payload.new_rent_amount}.",
        "rental_agreement_revisions", revision.id)
    db.commit(); db.refresh(revision)
    return {"id": str(revision.id), "agreement_id": str(revision.agreement_id),
            "revision_number": revision.revision_number, "revision_type": revision.revision_type,
            "new_end_date": revision.new_end_date, "new_rent_amount": str(revision.new_rent_amount),
            "reason": revision.reason, "status": revision.status, "created_at": revision.created_at}
