from uuid import UUID

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.database.connection import SessionLocal
from app.models.user import User
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.user_role import UserRole
from app.models.refresh_session import RefreshSession
from datetime import datetime, timezone


security = HTTPBearer()

# Tenant statuses that are allowed to authenticate and use billing/restoration endpoints.
# Anything else (Suspended, Inactive, ...) is blocked for every staff user of that tenant.
ACTIVE_TENANT_STATUSES = {"Active", "Trial"}
TENANT_NOT_ACTIVE_DETAIL = (
    "Your organization's account is not active. Please contact support."
)


def ensure_tenant_active(db: Session, tenant_id) -> None:
    """Raise 403 if the user's tenant is missing, suspended or inactive.

    The platform tenant itself is never blocked here (it cannot be suspended
    through the platform tenants API either).
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if tenant is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="User tenant was not found.",
        )
    if tenant.is_platform:
        return
    if tenant.status not in ACTIVE_TENANT_STATUSES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=TENANT_NOT_ACTIVE_DETAIL,
        )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    payload = decode_access_token(credentials.credentials)
    if payload.get("portal_type"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Customer portal tokens cannot access staff resources",
        )

    token_purpose = payload.get("purpose", "access")

    if token_purpose in {"mfa_enrollment", "mfa_challenge"}:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Complete MFA verification before accessing this resource",
        )

    if payload.get("mfa_verified") is not True:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="MFA verification required. Please log in again.",
        )

    if token_purpose in {"access", "onboarding"}:
        if payload.get("token_type") != "access" or not payload.get("sid"):
            raise HTTPException(status_code=401, detail="Access token is not associated with a valid session.")

    user_id = payload.get("user_id")
    tenant_id = payload.get("tenant_id")
    if not user_id or not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token data"
        )

    try:
        user_uuid = UUID(str(user_id))
        tenant_uuid = UUID(str(tenant_id))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token identifiers"
        )

    user = db.query(User).filter(
        User.id == user_uuid,
        User.tenant_id == tenant_uuid
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    if user.status != "Active" and token_purpose != "onboarding":
        raise HTTPException(status_code=401, detail="User account is not active.")

    if token_purpose in {"access", "onboarding"}:
        try:
            session_id = UUID(str(payload["sid"]))
        except (KeyError, ValueError, TypeError):
            raise HTTPException(status_code=401, detail="Invalid session identifier.")
        now = datetime.now(timezone.utc)
        active_session = db.query(RefreshSession.id).filter(
            RefreshSession.family_id == session_id,
            RefreshSession.user_id == user_uuid,
            RefreshSession.tenant_id == tenant_uuid,
            RefreshSession.revoked.is_(False),
            RefreshSession.expires_at > now,
        ).first()
        if active_session is None:
            raise HTTPException(status_code=401, detail="Session has been revoked or expired. Please log in again.")

    # Suspended / inactive companies lose access immediately, even with a
    # still-valid access token.
    ensure_tenant_active(db, user.tenant_id)

    # Roles can change after a token is issued, so use the current database
    # assignment instead of trusting the role claim embedded in the token.
    role = db.query(Role).join(
        UserRole,
        UserRole.role_id == Role.id,
    ).filter(
        UserRole.user_id == user.id
    ).first()

    return {
        "user_id": str(user.id),
        "tenant_id": str(user.tenant_id),
        "role": role.name if role else None,
        "status": user.status,
        "must_change_password": user.must_change_password,
        "profile_completed": user.profile_completed,
        "token_purpose": payload.get("purpose", "access"),
    }


def require_active_user(
    request: Request,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if current_user["token_purpose"] == "onboarding":
        raise HTTPException(
            status_code=403,
            detail="Please log in again after completing onboarding"
        )

    if current_user["status"] != "Active":
        raise HTTPException(
            status_code=403,
            detail="Complete onboarding before accessing CRM modules"
        )

    if current_user["must_change_password"]:
        raise HTTPException(
            status_code=403,
            detail="Change your password before continuing"
        )

    if not current_user["profile_completed"]:
        raise HTTPException(
            status_code=403,
            detail="Complete your profile before continuing"
        )

    # PART 6 & PART 7 – Enforce subscription/trial access control on all CRM business modules,
    # while allowing billing, plan selection, invoices, payment submission, support, and profile restoration routes.
    from app.services.subscription_service import enforce_subscription_crm_access

    try:
        tenant_uuid = UUID(str(current_user["tenant_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid tenant identifier")

    enforce_subscription_crm_access(
        db=db,
        tenant_id=tenant_uuid,
        request_path=request.url.path if request else None,
    )

    return current_user
