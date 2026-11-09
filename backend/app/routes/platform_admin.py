from datetime import datetime
from decimal import Decimal
import uuid
import hmac
from uuid import UUID

from fastapi import APIRouter, Depends, Header, HTTPException, Query, Request, Response, status
from datetime import date, timedelta
from sqlalchemy import func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.industry_modules import classify_industry
from app.models.industry_pack import IndustryPack
from app.models.tenant_industry_config import TenantIndustryConfig

from app.core.dependencies import get_current_user, get_db
from app.core.password_policy import ensure_password_policy
from app.core.platform_rbac import (
    ALL_PLATFORM_ROLE_NAMES,
    CENTRAL_PLATFORM_ROLES,
    CENTRAL_ROLE_NAMES,
    INDUSTRY_ROLE_NAMES,
    PLATFORM_INDUSTRIES,
    PLATFORM_PERMISSIONS,
    get_role_permission_names,
    PLATFORM_TENANT_NAME,
    REUSABLE_INDUSTRY_ROLES,
    ROLE_SIDEBAR_MODULES,
    auto_route_support_ticket,
    enforce_industry_scope,
    enforce_target_industry_scope,
    get_dashboard_metadata,
    normalize_industry_key,
    require_platform_employee,
    require_platform_permission,
)
from app.core.security import create_access_token, create_mfa_token, hash_password, verify_password
from app.core.rate_limiter import limiter
from app.database.connection import settings
from app.database.seed_platform import seed_platform_data
from app.models.audit_log import AuditLog
from app.models.notification import Notification
from app.models.permission import Permission
from app.models.platform import (
    PlatformBillingInvoice,
    PlatformBillingPayment,
    PlatformEmployee,
    PlatformExpense,
    PlatformIndustryTeam,
    PlatformRefundRequest,
    PlatformSalesProspect,
    PlatformSecurityEvent,
    PlatformSubscriptionPlan,
    PlatformSupportTicketMeta,
    PlatformTechnicalIncident,
    PlatformTenantSubscription,
)
from app.models.refresh_session import RefreshSession
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.support_ticket import SupportTicket
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_mfa import UserMFA
from app.models.user_role import UserRole
from app.schemas.platform import (
    IndustryTeamCreateOrUpdateRequest,
    IndustryTeamUpdateRequest,
    PlatformAddEmployeeRequest,
    PlatformBootstrapSuperAdminRequest,
    PlatformEmployeeUpdateRequest,
    PlatformFirstPasswordChangeRequest,
    PlatformLoginRequest,
    PlatformTenantCreateRequest,
    PlatformTenantUpdateRequest,
    RolePermissionsUpdateRequest,
)
from app.services.audit_service import log_audit

router = APIRouter(prefix="/api/v1/platform", tags=["Platform Administration"])

PLATFORM_LOGIN_MAX_FAILURES = 5
PLATFORM_LOGIN_FAILURE_WINDOW = timedelta(minutes=15)

# Raise one automatic security incident when repeated failures are observed.
PLATFORM_LOGIN_SUSPICIOUS_MAX_FAILURES = 5
PLATFORM_LOGIN_SUSPICIOUS_WINDOW = timedelta(minutes=5)
PLATFORM_LOGIN_SUSPICIOUS_COOLDOWN = timedelta(minutes=15)


def build_platform_mfa_response(db: Session, user: User, emp: PlatformEmployee) -> dict:
    """Issue only a short-lived MFA token; no access token before MFA succeeds."""
    mfa = db.query(UserMFA).filter(UserMFA.user_id == user.id).first()
    purpose = "mfa_challenge" if (mfa and mfa.enabled) else "mfa_enrollment"
    token = create_mfa_token(
        {"user_id": str(user.id), "tenant_id": str(user.tenant_id), "role": emp.role_name},
        purpose=purpose,
    )
    return {
        "message": "MFA verification required" if purpose == "mfa_challenge" else "MFA enrollment required",
        "account_type": "platform",
        "mfa_required": True,
        "mfa_setup_required": purpose == "mfa_enrollment",
        "mfa_token": token,
        "next_step": "mfa_enrollment" if purpose == "mfa_enrollment" else "mfa_verification",
        "must_change_password": user.must_change_password,
        "user": {
            "id": str(user.id), "name": user.full_name, "email": user.email,
            "status": user.status, "must_change_password": user.must_change_password,
            "profile_completed": user.profile_completed,
        },
        "role": emp.role_name,
    }


def ensure_platform_seeded(db: Session) -> Tenant:
    platform_tenant = (
        db.query(Tenant)
        .filter((Tenant.is_platform.is_(True)) | (Tenant.name == PLATFORM_TENANT_NAME))
        .first()
    )
    if not platform_tenant or db.query(PlatformIndustryTeam).count() == 0:
        seed_platform_data(db)
        platform_tenant = (
            db.query(Tenant)
            .filter((Tenant.is_platform.is_(True)) | (Tenant.name == PLATFORM_TENANT_NAME))
            .first()
        )
    # Backfill missing official teams without deleting or reclassifying legacy teams.
    existing_keys = {row[0] for row in db.query(PlatformIndustryTeam.industry_key).all()}
    for industry in PLATFORM_INDUSTRIES:
        key = industry["industry_key"]
        if key not in existing_keys:
            db.add(PlatformIndustryTeam(
                industry_key=key,
                name=f"{industry['name']} Industry Team",
                description=industry["description"],
                is_active=True,
                max_members=7,
                sla_response_minutes=60,
                sla_resolution_hours=24,
                config_json={"industry_label": industry["name"], "official_industry": True},
            ))
    db.flush()
    return platform_tenant



def _validate_active_platform_employee_ref(db: Session, user_or_emp_id: UUID, platform_tenant_id: UUID) -> User:
    row = (
        db.query(User, PlatformEmployee)
        .join(PlatformEmployee, PlatformEmployee.user_id == User.id)
        .filter(
            (User.id == user_or_emp_id) | (PlatformEmployee.id == user_or_emp_id),
            User.status == "Active",
        )
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Active platform employee assignee not found.")
    u, _e = row
    if str(u.tenant_id) != str(platform_tenant_id):
        raise HTTPException(status_code=403, detail="Employee does not belong to the platform tenant.")
    return u


def serialize_employee(db: Session, user: User, emp: PlatformEmployee) -> dict:
    team_name = None
    if emp.industry_team_id:
        team = db.query(PlatformIndustryTeam).filter(PlatformIndustryTeam.id == emp.industry_team_id).first()
        if team:
            team_name = team.name
    open_tickets = (
        db.query(PlatformSupportTicketMeta)
        .join(SupportTicket, SupportTicket.id == PlatformSupportTicketMeta.ticket_id)
        .filter(
            PlatformSupportTicketMeta.assigned_employee_user_id == user.id,
            SupportTicket.status.notin_(["Resolved", "Closed"]),
        )
        .count()
    )
    dash = get_dashboard_metadata(emp.role_name, emp.industry_key)
    return {
        "employee_id": str(emp.id),
        "user_id": str(user.id),
        "employee_code": emp.employee_code,
        "full_name": user.full_name,
        "email": user.email,
        "phone": user.phone,
        "status": user.status,
        "must_change_password": user.must_change_password,
        "role": emp.role_name,
        "role_scope": emp.role_scope,
        "industry_key": emp.industry_key,
        "industry_team_id": str(emp.industry_team_id) if emp.industry_team_id else None,
        "industry_team_name": team_name,
        "department": emp.department,
        "availability_status": emp.availability_status,
        "max_ticket_load": emp.max_ticket_load,
        "active_ticket_load": open_tickets,
        "is_platform_owner": emp.is_platform_owner,
        "dashboard": {
            "dashboard_key": dash["dashboard_key"],
            "dashboard_title": dash["dashboard_title"],
            "dashboard_category": dash["dashboard_category"],
        },
        "sidebar_modules": dash["sidebar_modules"],
        "last_login_at": emp.last_login_at.isoformat() if emp.last_login_at else None,
        "created_at": emp.created_at.isoformat() if emp.created_at else None,
    }


# ============================================================================
# 1. PLATFORM AUTHENTICATION & FIRST-LOGIN TEMPORARY PASSWORD FLOW
# ============================================================================

@router.post("/auth/bootstrap-super-admin", status_code=status.HTTP_201_CREATED)
def bootstrap_super_admin(
    payload: PlatformBootstrapSuperAdminRequest,
    bootstrap_token: str | None = Header(default=None, alias="X-Platform-Bootstrap-Token"),
    db: Session = Depends(get_db),
):
    """Create the first platform owner atomically; require a deployment-only bootstrap secret and MFA."""
    expected_token = settings.PLATFORM_BOOTSTRAP_TOKEN or ""
    if not expected_token:
        raise HTTPException(status_code=503, detail="Platform bootstrap is disabled. Configure PLATFORM_BOOTSTRAP_TOKEN for the one-time bootstrap operation.")
    if not bootstrap_token or not hmac.compare_digest(bootstrap_token, expected_token):
        raise HTTPException(status_code=403, detail="Invalid platform bootstrap token.")
    platform_tenant = ensure_platform_seeded(db)
    # Serialize bootstrap attempts on the single platform tenant row.
    db.query(Tenant).filter(Tenant.id == platform_tenant.id).with_for_update().first()
    existing_super = (
        db.query(PlatformEmployee)
        .filter(
            (PlatformEmployee.role_name == "Platform Super Admin")
            | (PlatformEmployee.is_platform_owner.is_(True))
        )
        .first()
    )
    if existing_super:
        raise HTTPException(status_code=409, detail="Platform Super Admin already exists.")

    email = str(payload.email).strip().lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=409, detail="Email is already registered.")
    role = db.query(Role).filter(Role.name == "Platform Super Admin").first()
    if not role:
        raise HTTPException(status_code=500, detail="Platform Super Admin role is not seeded.")

    from app.services.platform_config import enforce_configured_password_policy
    enforce_configured_password_policy(db, payload.password, [email, payload.full_name])
    user = User(
        tenant_id=platform_tenant.id, full_name=payload.full_name.strip(), email=email,
        password=hash_password(payload.password), status="Active", must_change_password=False,
        profile_completed=True, job_title="Platform Super Admin",
    )
    db.add(user)
    db.flush()
    db.add(UserRole(user_id=user.id, role_id=role.id))
    emp = PlatformEmployee(
        user_id=user.id, employee_code="EMP-SUPER-0001", role_scope="platform",
        role_name="Platform Super Admin", department="Platform Ownership & Governance",
        is_platform_owner=True,
    )
    db.add(emp)
    db.flush()
    log_audit(
        db=db, tenant_id=platform_tenant.id, user_id=user.id, action="BOOTSTRAP",
        module="platform_auth", record_id=emp.id,
        description="Bootstrapped initial Platform Super Admin account",
        after_data={"email": email, "role": "Platform Super Admin"},
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail="Platform owner was created concurrently; retry sign-in.") from exc
    db.refresh(user)
    db.refresh(emp)
    return {
        **build_platform_mfa_response(db, user, emp),
        "message": "Platform Super Admin initialized. Complete MFA before signing in.",
        "employee": serialize_employee(db, user, emp),
    }


@router.post("/auth/login")
@limiter.limit("5/minute")
def platform_employee_login(
    request: Request,
    response: Response,
    payload: PlatformLoginRequest,
    db: Session = Depends(get_db),
):
    """Verify credentials, apply account lockout, and hand off to MFA without access token."""
    platform_tenant = ensure_platform_seeded(db)
    email = str(payload.email).strip().lower()
    client_ip = request.client.host if request.client else "127.0.0.1"
    cutoff = datetime.utcnow() - PLATFORM_LOGIN_FAILURE_WINDOW
    failures = (
        db.query(func.count(PlatformSecurityEvent.id))
        .filter(
            PlatformSecurityEvent.event_type == "login_failed",
            PlatformSecurityEvent.email == email,
            PlatformSecurityEvent.created_at >= cutoff,
        ).scalar() or 0
    )
    from app.services.platform_config import get_platform_config
    security_policy = get_platform_config(db, "platform.security_policy")
    max_failures = int(security_policy.get("max_failed_login_attempts", PLATFORM_LOGIN_MAX_FAILURES))
    if failures >= max_failures:
        raise HTTPException(status_code=429, detail="Too many failed login attempts. Try again in 15 minutes.")

    user = db.query(User).filter(func.lower(User.email) == email).first()
    if not user or not verify_password(payload.password, user.password):
        failed_at = datetime.utcnow()
        failed_event = PlatformSecurityEvent(
            event_type="login_failed",
            severity="Warning",
            status="Open",
            user_id=user.id if user else None,
            email=email,
            ip_address=client_ip,
            industry_key="platform",
            title=f"Failed platform login attempt for {email}",
            description="Invalid email or password during platform login.",
            metadata_json={"source": "platform_login"},
        )
        db.add(failed_event)
        # Flush so the just-recorded attempt is included in threshold counts.
        db.flush()

        detection_cutoff = failed_at - PLATFORM_LOGIN_SUSPICIOUS_WINDOW
        email_failure_count = (
            db.query(func.count(PlatformSecurityEvent.id))
            .filter(
                PlatformSecurityEvent.event_type == "login_failed",
                PlatformSecurityEvent.email == email,
                PlatformSecurityEvent.created_at >= detection_cutoff,
            )
            .scalar()
            or 0
        )
        ip_failure_count = (
            db.query(func.count(PlatformSecurityEvent.id))
            .filter(
                PlatformSecurityEvent.event_type == "login_failed",
                PlatformSecurityEvent.ip_address == client_ip,
                PlatformSecurityEvent.created_at >= detection_cutoff,
            )
            .scalar()
            or 0
        )

        threshold_reached = (
            email_failure_count >= PLATFORM_LOGIN_SUSPICIOUS_MAX_FAILURES
            or ip_failure_count >= PLATFORM_LOGIN_SUSPICIOUS_MAX_FAILURES
        )

        if threshold_reached:
            cooldown_cutoff = failed_at - PLATFORM_LOGIN_SUSPICIOUS_COOLDOWN
            existing_incident = (
                db.query(PlatformSecurityEvent)
                .filter(
                    PlatformSecurityEvent.event_type == "suspicious_activity",
                    PlatformSecurityEvent.title == "Repeated Failed Platform Login Attempts",
                    PlatformSecurityEvent.email == email,
                    PlatformSecurityEvent.ip_address == client_ip,
                    PlatformSecurityEvent.created_at >= cooldown_cutoff,
                )
                .first()
            )

            if not existing_incident:
                detection_reasons = []
                if email_failure_count >= PLATFORM_LOGIN_SUSPICIOUS_MAX_FAILURES:
                    detection_reasons.append("email")
                if ip_failure_count >= PLATFORM_LOGIN_SUSPICIOUS_MAX_FAILURES:
                    detection_reasons.append("ip_address")

                incident = PlatformSecurityEvent(
                    event_type="suspicious_activity",
                    severity="Warning",
                    status="Open",
                    user_id=user.id if user else None,
                    email=email,
                    ip_address=client_ip,
                    industry_key="platform",
                    title="Repeated Failed Platform Login Attempts",
                    description=(
                        f"Detected {max(email_failure_count, ip_failure_count)} failed "
                        "platform login attempts within 5 minutes. The attempt threshold "
                        "was reached for: " + ", ".join(detection_reasons) + "."
                    ),
                    remediation_steps=(
                        "Review the login history and source IP. Verify the account owner, "
                        "and revoke active sessions or take further protective action if "
                        "the activity is unauthorized."
                    ),
                    metadata_json={
                        "detection_source": "platform_login_failure_threshold",
                        "threshold": PLATFORM_LOGIN_SUSPICIOUS_MAX_FAILURES,
                        "window_minutes": int(
                            PLATFORM_LOGIN_SUSPICIOUS_WINDOW.total_seconds() // 60
                        ),
                        "email_failure_count": email_failure_count,
                        "ip_failure_count": ip_failure_count,
                        "detection_reasons": detection_reasons,
                        "source_ip": client_ip,
                    },
                )
                db.add(incident)
                db.flush()

                # Notify active central Platform Super Admins in-app.
                platform_admins = (
                    db.query(User)
                    .join(PlatformEmployee, PlatformEmployee.user_id == User.id)
                    .filter(
                        User.tenant_id == platform_tenant.id,
                        User.status == "Active",
                        PlatformEmployee.role_scope == "platform",
                        or_(
                            PlatformEmployee.role_name == "Platform Super Admin",
                            PlatformEmployee.is_platform_owner.is_(True),
                        ),
                    )
                    .all()
                )
                notification_message = (
                    f"SCuilONE detected repeated failed platform login attempts for "
                    f"{email} from IP {client_ip}. "
                    f"Email failures: {email_failure_count}; IP failures: {ip_failure_count}. "
                    "Review the Security Events page."
                )
                for admin_user in platform_admins:
                    db.add(
                        Notification(
                            tenant_id=platform_tenant.id,
                            recipient_user_id=admin_user.id,
                            workflow_id=None,
                            title="Security alert: repeated failed logins",
                            message=notification_message,
                            notification_type="security_alert",
                            related_module="platform_security",
                            related_record_id=incident.id,
                            is_read=False,
                        )
                    )

        db.commit()
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    emp = db.query(PlatformEmployee).filter(PlatformEmployee.user_id == user.id).first()
    if not emp or str(user.tenant_id) != str(platform_tenant.id):
        raise HTTPException(status_code=403, detail="This account is not a platform employee account.")
    if user.status != "Active":
        raise HTTPException(status_code=403, detail=f"Employee account status is '{user.status}'. Contact your Platform Admin.")

    emp.last_login_at = datetime.utcnow()
    db.add(PlatformSecurityEvent(
        event_type="login_mfa_pending", severity="Info", status="Logged",
        user_id=user.id, email=user.email, ip_address=client_ip, industry_key=emp.industry_key,
        title=f"Password verified for {user.full_name} ({emp.role_name}); MFA pending",
        description="Platform employee passed password verification and was sent to MFA.",
    ))
    db.commit()
    db.refresh(emp)
    return build_platform_mfa_response(db, user, emp)


@router.post("/auth/change-first-password")
def platform_change_first_password(
    payload: PlatformFirstPasswordChangeRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Allows a newly added platform employee to change their temporary password at first login (Design Rule 7).
    """
    user_id = UUID(str(current_user["user_id"]))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    emp = db.query(PlatformEmployee).filter(PlatformEmployee.user_id == user.id).first()
    platform_tenant = db.query(Tenant.id).filter(
        (Tenant.is_platform.is_(True)) | (Tenant.name == PLATFORM_TENANT_NAME)
    ).first()
    if not emp or not platform_tenant or str(user.tenant_id) != str(platform_tenant[0]):
        raise HTTPException(status_code=403, detail="Not a platform employee account.")
    if user.status != "Active":
        raise HTTPException(status_code=403, detail="Inactive platform accounts cannot change credentials.")
    if not user.must_change_password:
        raise HTTPException(status_code=400, detail="No temporary password change is pending.")

    if not verify_password(payload.current_password, user.password):
        raise HTTPException(status_code=400, detail="Current temporary password is incorrect.")

    from app.services.platform_config import get_platform_config
    configured_minimum = get_platform_config(db, "platform.security_policy").get("min_password_length", 15)
    ensure_password_policy(payload.new_password, [user.email, user.full_name], min_length=configured_minimum)
    user.password = hash_password(payload.new_password)
    user.must_change_password = False
    user.profile_completed = True
    user.status = "Active"
    db.query(RefreshSession).filter(RefreshSession.user_id == user.id, RefreshSession.revoked.is_(False)).update({RefreshSession.revoked: True}, synchronize_session=False)

    log_audit(
        db=db,
        tenant_id=user.tenant_id,
        user_id=user.id,
        action="PASSWORD_CHANGED",
        module="platform_auth",
        record_id=emp.id,
        description=f"Employee '{user.full_name}' completed first-login password change",
    )
    db.commit()
    db.refresh(user)
    db.refresh(emp)

    from app.routes.auth import create_refresh_session
    _raw_refresh, _refresh_expiry, _refresh_hash, new_session_id = create_refresh_session(db=db, user=user)
    new_token = create_access_token(
        {
            "user_id": str(user.id),
            "tenant_id": str(user.tenant_id),
            "role": emp.role_name,
            "role_scope": emp.role_scope,
            "industry_key": emp.industry_key,
            "purpose": "access",
            "mfa_verified": True,
            "sid": str(new_session_id),
        }
    )
    db.commit()
    emp_data = serialize_employee(db, user, emp)
    return {
        "message": "Password changed successfully. Dashboard access unlocked.",
        "access_token": new_token,
        "token_type": "bearer",
        "must_change_password": False,
        "next_step": "load_dashboard",
        "employee": emp_data,
        "dashboard": emp_data["dashboard"],
        "sidebar_modules": emp_data["sidebar_modules"],
        "permissions": get_role_permission_names(db, emp.role_name),
    }


@router.get("/auth/me")
def get_platform_me(
    platform_user: dict = Depends(require_platform_employee),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == UUID(str(platform_user["user_id"]))).first()
    emp = db.query(PlatformEmployee).filter(PlatformEmployee.user_id == user.id).first()
    dash = get_dashboard_metadata(platform_user["role"], platform_user.get("industry_key"))
    return {
        "employee": serialize_employee(db, user, emp) if (user and emp) else platform_user,
        "dashboard": dash,
        "sidebar_modules": dash["sidebar_modules"],
        "permissions": get_role_permission_names(db, platform_user["role"]),
    }


# ============================================================================
# 2. ADD EMPLOYEE FLOW & PLATFORM EMPLOYEES MANAGEMENT
# ============================================================================

@router.post("/employees", status_code=status.HTTP_201_CREATED)
def add_platform_employee(
    payload: PlatformAddEmployeeRequest,
    platform_user: dict = Depends(require_platform_permission("platform.employees.manage")),
    db: Session = Depends(get_db),
):
    """
    Implements Flow 2: Add Employee Flow (Platform Admin / Super Admin / Team Admin) from platfrom support (1).pdf (Pages 2, 3, 5):
    - Accepts employee_name (or full_name), email, temporary_password, industry_type, and role.
    - Enforces Platform Admin restriction: cannot create or grant 'Platform Super Admin'.
    - Enforces Team Admin restriction: can only add employees to their own industry team and only for the 7 reusable industry roles.
    - Associates employee with the appropriate Industry Team (for the 7 reusable industry roles), sets must_change_password=True,
      and grants access to the matching dashboard (1 of 11 Central Platform Dashboards or 1 of 7 Reusable Industry Dashboards).
    """
    platform_tenant = ensure_platform_seeded(db)
    db.query(Tenant.id).filter(Tenant.id == platform_tenant.id).with_for_update().first()
    actor_id = UUID(str(platform_user["user_id"]))
    actor_role = platform_user.get("role")

    requested_role = payload.role.strip()
    if requested_role not in ALL_PLATFORM_ROLE_NAMES:
        raise HTTPException(
            status_code=422,
            detail={
                "message": f"Unsupported role '{requested_role}'.",
                "central_platform_roles": sorted(CENTRAL_ROLE_NAMES),
                "reusable_industry_roles": sorted(INDUSTRY_ROLE_NAMES),
            },
        )

    # Restriction (Page 12): Platform Admin cannot grant Super Admin access or change platform ownership
    if requested_role == "Platform Super Admin" and actor_role != "Platform Super Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Restriction: Only a Platform Super Admin can create or grant Platform Super Admin access.",
        )

    # Determine role_scope and industry_key
    norm_industry = normalize_industry_key(payload.industry_type)
    if actor_role == "Team Admin":
        # Team Admin can only manage their own industry team and only the 7 industry roles
        if requested_role not in INDUSTRY_ROLE_NAMES:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Team Admin can only assign one of the 7 reusable industry team roles.",
            )
        norm_industry = enforce_industry_scope(platform_user, norm_industry)

    if requested_role in INDUSTRY_ROLE_NAMES:
        if not norm_industry:
            raise HTTPException(
                status_code=422,
                detail=f"Role '{requested_role}' is an industry team role and requires 'industry_type' (e.g., 'Real Estate', 'IT & Software').",
            )
        role_scope = "industry_team"
    else:
        # Central Platform role; if industry_type was provided with a generic role or omitted, keep central scope
        role_scope = "platform"

    email = str(payload.email).strip().lower()
    if db.query(User).filter(func.lower(User.email) == email).first():
        raise HTTPException(status_code=409, detail="An employee or user with this email already exists.")

    industry_team = None
    if role_scope == "industry_team":
        industry_team = (
            db.query(PlatformIndustryTeam)
            .filter(PlatformIndustryTeam.industry_key == norm_industry)
            .with_for_update()
            .first()
        )
        if not industry_team:
            try:
                industry_team = PlatformIndustryTeam(
                    industry_key=norm_industry,
                    name=f"{payload.industry_type.strip()} Industry Team",
                    description=f"Supports {payload.industry_type.strip()} customers",
                    is_active=True,
                    max_members=7,
                )
                db.add(industry_team)
                db.flush()
            except IntegrityError:
                db.rollback()
                industry_team = (
                    db.query(PlatformIndustryTeam)
                    .filter(PlatformIndustryTeam.industry_key == norm_industry)
                    .with_for_update()
                    .first()
                )
        if not industry_team:
            raise HTTPException(status_code=409, detail="Industry team creation conflicted. Retry employee creation.")
        if not industry_team.is_active:
            raise HTTPException(
                status_code=409,
                detail=f"{industry_team.name} is currently inactive and cannot accept new team members.",
            )

        # Lock existing team members and verify active member count against max_members
        active_member_ids = [
            row[0]
            for row in db.query(PlatformEmployee.id)
            .join(User, User.id == PlatformEmployee.user_id)
            .filter(
                PlatformEmployee.industry_team_id == industry_team.id,
                User.status == "Active",
            )
            .with_for_update()
            .all()
        ]
        if len(active_member_ids) >= industry_team.max_members:
            raise HTTPException(
                status_code=409,
                detail=f"{industry_team.name} already has the maximum of {industry_team.max_members} active team members.",
            )

    role_obj = db.query(Role).filter(Role.name == requested_role).first()
    if not role_obj:
        role_obj = Role(name=requested_role)
        db.add(role_obj)
        db.flush()

    from app.services.platform_config import get_platform_config
    force_first_login_change = get_platform_config(db, "platform.security_policy").get("force_password_change_on_first_login", True)
    from app.services.platform_config import enforce_configured_password_policy
    enforce_configured_password_policy(db, payload.temporary_password, [email, payload.full_name])
    new_user = User(
        tenant_id=platform_tenant.id,
        full_name=payload.full_name,
        email=email,
        phone=payload.phone,
        job_title=requested_role,
        password=hash_password(payload.temporary_password),
        status="Active",
        must_change_password=bool(force_first_login_change),
        profile_completed=True,
    )
    db.add(new_user)
    db.flush()

    db.add(UserRole(user_id=new_user.id, role_id=role_obj.id))

    emp_code = f"EMP-{datetime.utcnow():%Y%m}-{uuid.uuid4().hex[:6].upper()}"
    new_emp = PlatformEmployee(
        user_id=new_user.id,
        employee_code=emp_code,
        role_scope=role_scope,
        role_name=requested_role,
        industry_key=norm_industry if role_scope == "industry_team" else None,
        industry_team_id=industry_team.id if industry_team else None,
        manager_user_id=industry_team.manager_user_id if industry_team else None,
        department=payload.department or (industry_team.name if industry_team else "Platform Operations"),
        availability_status="Available",
        max_ticket_load=payload.max_ticket_load,
        is_platform_owner=(requested_role == "Platform Super Admin"),
        created_by=actor_id,
    )
    db.add(new_emp)
    db.flush()

    if industry_team:
        if requested_role == "Team Manager":
            industry_team.manager_user_id = new_user.id
        elif requested_role == "Team Admin":
            industry_team.team_admin_user_id = new_user.id

    db.add(
        Notification(
            tenant_id=platform_tenant.id,
            recipient_user_id=new_user.id,
            title="Welcome to SCuilONE Platform",
            message=f"Your account has been created with role '{requested_role}'. Please change your temporary password on first login.",
            notification_type="platform_onboarding",
        )
    )

    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=actor_id,
        action="CREATE_EMPLOYEE",
        module="platform_employees",
        record_id=new_emp.id,
        description=f"Added platform employee '{new_user.full_name}' ({requested_role})",
        after_data={
            "employee_code": emp_code,
            "email": email,
            "role": requested_role,
            "role_scope": role_scope,
            "industry_key": new_emp.industry_key,
            "must_change_password": True,
        },
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Concurrent employee creation conflict (duplicate email or employee code). Please retry.",
        ) from exc
    db.refresh(new_user)
    db.refresh(new_emp)

    return {
        "message": "Platform employee created successfully. Temporary password must be changed at first login.",
        "employee": serialize_employee(db, new_user, new_emp),
    }


@router.get("/employees")
def list_platform_employees(
    role_scope: str | None = Query(default=None, pattern="^(platform|industry_team)$"),
    industry_type: str | None = Query(default=None),
    role: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    platform_user: dict = Depends(require_platform_permission("platform.employees.view")),
    db: Session = Depends(get_db),
):
    ensure_platform_seeded(db)
    effective_industry = enforce_industry_scope(platform_user, industry_type)

    query = db.query(User, PlatformEmployee).join(
        PlatformEmployee, PlatformEmployee.user_id == User.id
    )
    if role_scope:
        query = query.filter(PlatformEmployee.role_scope == role_scope)
    if role:
        query = query.filter(PlatformEmployee.role_name == role)
    if status_filter:
        query = query.filter(User.status == status_filter)
    if search:
        pattern = f"%{search.strip()}%"
        query = query.filter(
            User.full_name.ilike(pattern)
            | User.email.ilike(pattern)
            | PlatformEmployee.employee_code.ilike(pattern)
        )

    rows = query.order_by(PlatformEmployee.created_at.desc()).all()
    if effective_industry:
        rows = [(u, e) for u, e in rows if normalize_industry_key(e.industry_key) == effective_industry]
    items = [serialize_employee(db, u, e) for u, e in rows]
    return {"items": items, "total": len(items)}


@router.get("/employees/{employee_id}")
def get_platform_employee(
    employee_id: UUID,
    platform_user: dict = Depends(require_platform_permission("platform.employees.view")),
    db: Session = Depends(get_db),
):
    row = (
        db.query(User, PlatformEmployee)
        .join(PlatformEmployee, PlatformEmployee.user_id == User.id)
        .filter((PlatformEmployee.id == employee_id) | (User.id == employee_id))
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Platform employee not found.")
    user, emp = row
    enforce_target_industry_scope(platform_user, emp.industry_key)
    return serialize_employee(db, user, emp)


@router.patch("/employees/{employee_id}")
def update_platform_employee(
    employee_id: UUID,
    payload: PlatformEmployeeUpdateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.employees.manage")),
    db: Session = Depends(get_db),
):
    actor_id = UUID(str(platform_user["user_id"]))
    actor_role = platform_user.get("role")
    platform_tenant = ensure_platform_seeded(db)
    # Serialize ownership and team-capacity transitions to avoid concurrent over-allocation.
    db.query(Tenant.id).filter(Tenant.id == platform_tenant.id).with_for_update().first()

    row = (
        db.query(User, PlatformEmployee)
        .join(PlatformEmployee, PlatformEmployee.user_id == User.id)
        .filter((PlatformEmployee.id == employee_id) | (User.id == employee_id))
        .with_for_update()
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Platform employee not found.")
    user, emp = row

    enforce_target_industry_scope(platform_user, emp.industry_key)

    # Restriction: Non-Super-Admin cannot modify a Platform Super Admin or promote anyone to Platform Super Admin
    if (
        emp.role_name == "Platform Super Admin"
        or emp.is_platform_owner
        or payload.role == "Platform Super Admin"
    ) and actor_role != "Platform Super Admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Restriction: A Platform Admin cannot grant Super Admin access or modify platform ownership.",
        )

    before = serialize_employee(db, user, emp)
    prev_status = user.status
    target_status = payload.status if payload.status is not None else user.status

    if emp.role_name == "Platform Super Admin" or emp.is_platform_owner:
        demoting = payload.role is not None and payload.role.strip() != "Platform Super Admin"
        deactivating = payload.status is not None and payload.status != "Active"
        if (demoting or deactivating) and actor_role != "Platform Super Admin":
            raise HTTPException(status_code=403, detail="Only Platform Super Admin can change platform ownership.")
        if demoting or deactivating:
            other_active = (
                db.query(PlatformEmployee.id)
                .join(User, User.id == PlatformEmployee.user_id)
                .filter(
                    PlatformEmployee.id != emp.id,
                    User.status == "Active",
                    ((PlatformEmployee.role_name == "Platform Super Admin") | (PlatformEmployee.is_platform_owner.is_(True))),
                ).count()
            )
            if other_active == 0:
                raise HTTPException(status_code=409, detail="Cannot demote or deactivate the last active Platform Super Admin.")

    target_team = None
    if payload.industry_type is not None:
        if emp.role_scope != "industry_team" and payload.role not in INDUSTRY_ROLE_NAMES:
            raise HTTPException(status_code=422, detail="industry_type can only be assigned to an industry-team role.")
        norm_ind = normalize_industry_key(payload.industry_type)
        if platform_user.get("role_scope") == "industry_team":
            norm_ind = enforce_industry_scope(platform_user, norm_ind)
        target_team = (
            db.query(PlatformIndustryTeam)
            .filter(PlatformIndustryTeam.industry_key == norm_ind)
            .with_for_update()
            .first()
        )
        if not target_team:
            raise HTTPException(status_code=404, detail=f"Industry team '{norm_ind}' not found.")
    elif emp.industry_team_id and target_status == "Active" and prev_status != "Active":
        target_team = (
            db.query(PlatformIndustryTeam)
            .filter(PlatformIndustryTeam.id == emp.industry_team_id)
            .with_for_update()
            .first()
        )

    if target_team and target_status == "Active":
        if not target_team.is_active:
            raise HTTPException(
                status_code=409,
                detail=f"{target_team.name} is inactive and cannot accept active members.",
            )
        changing_team = target_team.id != emp.industry_team_id
        becoming_active = prev_status != "Active"
        if changing_team or becoming_active:
            active_count = (
                db.query(PlatformEmployee.id)
                .join(User, User.id == PlatformEmployee.user_id)
                .filter(
                    PlatformEmployee.industry_team_id == target_team.id,
                    User.status == "Active",
                    PlatformEmployee.id != emp.id,
                )
                .with_for_update()
                .count()
            )
            if active_count >= target_team.max_members:
                raise HTTPException(
                    status_code=409,
                    detail=f"{target_team.name} already has the maximum of {target_team.max_members} active team members.",
                )

    if payload.full_name is not None:
        user.full_name = payload.full_name.strip()
    if payload.status is not None:
        user.status = payload.status
        if payload.status != "Active":
            db.query(RefreshSession).filter(RefreshSession.user_id == user.id, RefreshSession.revoked.is_(False)).update(
                {RefreshSession.revoked: True}, synchronize_session=False)
    if payload.availability_status is not None:
        emp.availability_status = payload.availability_status
    if payload.max_ticket_load is not None:
        emp.max_ticket_load = payload.max_ticket_load
    if payload.manager_user_id is not None:
        mgr_user = _validate_active_platform_employee_ref(db, payload.manager_user_id, platform_tenant.id)
        emp.manager_user_id = mgr_user.id
    if payload.department is not None:
        emp.department = payload.department

    if target_team is not None and payload.industry_type is not None:
        emp.industry_key = target_team.industry_key
        emp.industry_team_id = target_team.id

    if payload.role is not None:
        new_role = payload.role.strip()
        if new_role not in ALL_PLATFORM_ROLE_NAMES:
            raise HTTPException(status_code=422, detail=f"Unsupported role '{new_role}'.")
        if actor_role == "Team Admin" and new_role not in INDUSTRY_ROLE_NAMES:
            raise HTTPException(
                status_code=403,
                detail="Team Admin can only assign the 7 reusable industry team roles.",
            )
        role_obj = db.query(Role).filter(Role.name == new_role).first()
        if not role_obj:
            role_obj = Role(name=new_role)
            db.add(role_obj)
            db.flush()
        db.query(UserRole).filter(UserRole.user_id == user.id).delete(synchronize_session=False)
        db.add(UserRole(user_id=user.id, role_id=role_obj.id))
        emp.role_name = new_role
        emp.role_scope = "industry_team" if new_role in INDUSTRY_ROLE_NAMES else "platform"
        emp.is_platform_owner = new_role == "Platform Super Admin"
        user.job_title = new_role
        if new_role in INDUSTRY_ROLE_NAMES:
            if not emp.industry_team_id:
                raise HTTPException(
                    status_code=422,
                    detail=f"Role '{new_role}' requires an assigned industry team. Supply industry_type.",
                )
            if target_team is None:
                target_team = db.query(PlatformIndustryTeam).filter(
                    PlatformIndustryTeam.id == emp.industry_team_id
                ).with_for_update().first()
            if not target_team or not target_team.is_active:
                raise HTTPException(status_code=409, detail="An active industry team assignment is required for this role.")
        else:
            emp.industry_key = None
            emp.industry_team_id = None
            emp.is_platform_owner = new_role == "Platform Super Admin"

    after = serialize_employee(db, user, emp)
    log_audit(
        db=db,
        tenant_id=user.tenant_id,
        user_id=actor_id,
        action="UPDATE_EMPLOYEE",
        module="platform_employees",
        record_id=emp.id,
        description=f"Updated platform employee '{user.full_name}'",
        before_data=before,
        after_data=after,
    )
    db.commit()
    return {"message": "Employee updated successfully", "employee": after}


# ============================================================================
# 3. 10 INDUSTRY TEAMS & SUPPORTED INDUSTRIES MANAGEMENT
# ============================================================================

def serialize_industry_team(db: Session, team: PlatformIndustryTeam) -> dict:
    members_rows = (
        db.query(User, PlatformEmployee)
        .join(PlatformEmployee, PlatformEmployee.user_id == User.id)
        .filter(PlatformEmployee.industry_team_id == team.id)
        .all()
    )
    members = [serialize_employee(db, u, e) for u, e in members_rows]
    active_members = [m for m in members if m["status"] == "Active"]

    # Map the 7 reusable industry roles to show filled vs vacant slots
    role_slots = []
    for r in REUSABLE_INDUSTRY_ROLES:
        r_name = r["name"]
        assigned = [m for m in active_members if m["role"] == r_name]
        role_slots.append(
            {
                "role": r_name,
                "responsibility": r["responsibility"],
                "dashboard_key": r["dashboard_key"],
                "filled": len(assigned) > 0,
                "members": assigned,
            }
        )

    vacant_roles = [slot["role"] for slot in role_slots if not slot["filled"]]
    open_tickets_count = (
        db.query(PlatformSupportTicketMeta)
        .join(SupportTicket, SupportTicket.id == PlatformSupportTicketMeta.ticket_id)
        .filter(
            PlatformSupportTicketMeta.industry_key == team.industry_key,
            SupportTicket.status.notin_(["Resolved", "Closed"]),
        )
        .count()
    )
    tenant_count = (
        db.query(Tenant)
        .filter(Tenant.is_platform.is_(False))
        .all()
    )
    matching_tenants = sum(
        1 for t in tenant_count if normalize_industry_key(t.industry) == team.industry_key
    )

    return {
        "id": str(team.id),
        "industry_key": team.industry_key,
        "name": team.name,
        "description": team.description,
        "is_active": team.is_active,
        "max_members": team.max_members,
        "active_members_count": len(active_members),
        "vacancies_count": max(0, team.max_members - len(active_members)),
        "vacant_roles": vacant_roles,
        "role_slots": role_slots,
        "members": members,
        "manager_user_id": str(team.manager_user_id) if team.manager_user_id else None,
        "team_admin_user_id": str(team.team_admin_user_id) if team.team_admin_user_id else None,
        "sla_response_minutes": team.sla_response_minutes,
        "sla_resolution_hours": team.sla_resolution_hours,
        "allocated_budget": str(team.allocated_budget),
        "spent_budget": str(team.spent_budget),
        "remaining_budget": str(max(Decimal("0.00"), team.allocated_budget - team.spent_budget)),
        "open_tickets_workload": open_tickets_count,
        "registered_companies_count": matching_tenants,
        "config_json": team.config_json or {},
    }


@router.get("/industry-teams")
def list_industry_teams(
    industry_type: str | None = Query(default=None),
    platform_user: dict = Depends(require_platform_permission("platform.teams.view")),
    db: Session = Depends(get_db),
):
    ensure_platform_seeded(db)
    effective_industry = enforce_industry_scope(platform_user, industry_type)
    query = db.query(PlatformIndustryTeam).filter(
        PlatformIndustryTeam.industry_key.in_([item["industry_key"] for item in PLATFORM_INDUSTRIES])
    )
    if effective_industry:
        query = query.filter(PlatformIndustryTeam.industry_key == effective_industry)
    teams = query.order_by(PlatformIndustryTeam.name.asc()).all()
    items = [serialize_industry_team(db, t) for t in teams]
    return {
        "items": items,
        "total": len(items),
        "reusable_industry_roles": REUSABLE_INDUSTRY_ROLES,
    }


@router.get("/industry-teams/{industry_key}")
def get_industry_team(
    industry_key: str,
    platform_user: dict = Depends(require_platform_permission("platform.teams.view")),
    db: Session = Depends(get_db),
):
    ensure_platform_seeded(db)
    norm_key = enforce_industry_scope(platform_user, industry_key) or normalize_industry_key(industry_key)
    team = (
        db.query(PlatformIndustryTeam)
        .filter(PlatformIndustryTeam.industry_key == norm_key)
        .first()
    )
    if not team:
        raise HTTPException(status_code=404, detail=f"Industry team '{industry_key}' not found.")
    return serialize_industry_team(db, team)


@router.post("/industry-teams", status_code=status.HTTP_201_CREATED)
def create_industry_team(
    payload: IndustryTeamCreateOrUpdateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.industries.manage")),
    db: Session = Depends(get_db),
):
    platform_tenant = ensure_platform_seeded(db)
    db.query(Tenant.id).filter(Tenant.id == platform_tenant.id).with_for_update().first()
    ind_key = normalize_industry_key(payload.industry_key or payload.name)
    if not ind_key:
        raise HTTPException(status_code=422, detail="Invalid industry_key or name.")

    existing = (
        db.query(PlatformIndustryTeam)
        .filter(PlatformIndustryTeam.industry_key == ind_key)
        .first()
    )
    if existing:
        raise HTTPException(status_code=409, detail=f"Industry team '{ind_key}' already exists.")

    mgr_id = _validate_active_platform_employee_ref(db, payload.manager_user_id, platform_tenant.id).id if payload.manager_user_id else None
    tadmin_id = _validate_active_platform_employee_ref(db, payload.team_admin_user_id, platform_tenant.id).id if payload.team_admin_user_id else None
    team = PlatformIndustryTeam(
        industry_key=ind_key,
        name=payload.name.strip(),
        description=payload.description,
        is_active=payload.is_active,
        max_members=payload.max_members,
        sla_response_minutes=payload.sla_response_minutes,
        sla_resolution_hours=payload.sla_resolution_hours,
        allocated_budget=payload.allocated_budget,
        manager_user_id=mgr_id,
        team_admin_user_id=tadmin_id,
        config_json=payload.config_json or {},
    )
    db.add(team)
    db.flush()
    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=UUID(str(platform_user["user_id"])),
        action="CREATE_INDUSTRY_TEAM",
        module="platform_industry_teams",
        record_id=team.id,
        description=f"Created industry team '{team.name}' ({ind_key})",
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"Industry team '{ind_key}' was created concurrently.") from exc
    db.refresh(team)
    return serialize_industry_team(db, team)


@router.patch("/industry-teams/{industry_key}")
def update_industry_team(
    industry_key: str,
    payload: IndustryTeamUpdateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.teams.manage")),
    db: Session = Depends(get_db),
):
    platform_tenant = ensure_platform_seeded(db)
    norm_key = enforce_industry_scope(platform_user, industry_key) or normalize_industry_key(industry_key)
    team = (
        db.query(PlatformIndustryTeam)
        .filter(PlatformIndustryTeam.industry_key == norm_key)
        .with_for_update()
        .first()
    )
    if not team:
        raise HTTPException(status_code=404, detail=f"Industry team '{industry_key}' not found.")

    changes = payload.model_dump(exclude_unset=True)
    non_nullable_fields = {"name", "description", "is_active", "max_members", "sla_response_minutes", "sla_resolution_hours", "allocated_budget", "config_json"}
    null_non_nullable = sorted(field for field in non_nullable_fields if field in changes and changes[field] is None)
    if null_non_nullable:
        raise HTTPException(status_code=422, detail={"message": "These fields cannot be null.", "fields": null_non_nullable})
    if "max_members" in changes and changes["max_members"] is not None:
        active_members_count = (
            db.query(PlatformEmployee.id)
            .join(User, User.id == PlatformEmployee.user_id)
            .filter(PlatformEmployee.industry_team_id == team.id, User.status == "Active")
            .count()
        )
        if changes["max_members"] < active_members_count:
            raise HTTPException(
                status_code=409,
                detail=f"Cannot set max_members to {changes['max_members']} while {team.name} has {active_members_count} active members.",
            )
    if changes.get("is_active") is False:
        active_count = (
            db.query(PlatformEmployee.id)
            .join(User, User.id == PlatformEmployee.user_id)
            .filter(PlatformEmployee.industry_team_id == team.id, User.status == "Active")
            .count()
        )
        if active_count:
            raise HTTPException(status_code=409, detail="Deactivate or reassign active team members before deactivating this industry team.")
    if "manager_user_id" in changes and changes["manager_user_id"] is not None:
        changes["manager_user_id"] = _validate_active_platform_employee_ref(db, changes["manager_user_id"], platform_tenant.id).id
    if "team_admin_user_id" in changes and changes["team_admin_user_id"] is not None:
        changes["team_admin_user_id"] = _validate_active_platform_employee_ref(db, changes["team_admin_user_id"], platform_tenant.id).id
    for field, value in changes.items():
        if field == "name" and value is not None:
            value = value.strip()
            if len(value) < 2:
                raise HTTPException(status_code=422, detail="Team name must contain at least two non-whitespace characters.")
        setattr(team, field, value)

    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=UUID(str(platform_user["user_id"])),
        action="UPDATE_INDUSTRY_TEAM",
        module="platform_industry_teams",
        record_id=team.id,
        description=f"Updated industry team '{team.name}'",
    )
    db.commit()
    db.refresh(team)
    return serialize_industry_team(db, team)


# ============================================================================
# 4. ROLES & PERMISSIONS MANAGEMENT (11 PLATFORM ROLES + 7 INDUSTRY ROLES)
# ============================================================================

@router.get("/roles")
def list_platform_and_industry_roles(
    platform_user: dict = Depends(require_platform_permission("platform.roles.view")),
    db: Session = Depends(get_db),
):
    ensure_platform_seeded(db)
    central_out = []
    for r in CENTRAL_PLATFORM_ROLES:
        central_out.append(
            {
                **r,
                "role_scope": "platform",
                "permissions": get_role_permission_names(db, r["name"]),
                "sidebar_modules": ROLE_SIDEBAR_MODULES.get(r["name"], []),
            }
        )
    industry_out = []
    for r in REUSABLE_INDUSTRY_ROLES:
        industry_out.append(
            {
                **r,
                "role_scope": "industry_team",
                "reused_across_industries": [i["industry_key"] for i in PLATFORM_INDUSTRIES],
                "permissions": get_role_permission_names(db, r["name"]),
                "sidebar_modules": ROLE_SIDEBAR_MODULES.get(r["name"], []),
            }
        )
    return {
        "central_platform_roles": central_out,
        "reusable_industry_roles": industry_out,
        "available_permissions": [
            {"name": name, "description": desc} for name, desc in PLATFORM_PERMISSIONS
        ],
    }


@router.put("/roles/{role_name}/permissions")
def update_role_permissions(
    role_name: str,
    payload: RolePermissionsUpdateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.roles.manage")),
    db: Session = Depends(get_db),
):
    platform_tenant = ensure_platform_seeded(db)
    actor_role = platform_user.get("role")
    if role_name not in ALL_PLATFORM_ROLE_NAMES:
        raise HTTPException(status_code=404, detail=f"Platform role '{role_name}' not found.")
    if role_name == "Platform Super Admin" and actor_role != "Platform Super Admin":
        raise HTTPException(status_code=403, detail="Only Platform Super Admin can modify Super Admin permissions.")
    role_obj = db.query(Role).filter(Role.name == role_name).with_for_update().first()
    if not role_obj:
        raise HTTPException(status_code=404, detail=f"Role '{role_name}' not found.")

    valid_perm_names = {name for name, _ in PLATFORM_PERMISSIONS}
    requested = list(dict.fromkeys(payload.permissions))
    unknown = set(requested) - valid_perm_names
    if unknown:
        raise HTTPException(status_code=422, detail={"message": "Unknown permission names", "unknown": sorted(unknown)})
    actor_perms = set(get_role_permission_names(db, actor_role))
    if actor_role != "Platform Super Admin":
        not_held = sorted(set(requested) - actor_perms)
        if not_held:
            raise HTTPException(status_code=403, detail={"message": "You cannot grant permissions you do not hold yourself.", "permissions": not_held})
        if "platform.owner.manage" in requested:
            raise HTTPException(status_code=403, detail="Only Platform Super Admin can grant platform.owner.manage.")

    before = get_role_permission_names(db, role_name)
    platform_perm_ids = db.query(Permission.id).filter(Permission.name.in_(valid_perm_names))
    db.query(RolePermission).filter(
        RolePermission.role_id == role_obj.id,
        RolePermission.permission_id.in_(platform_perm_ids),
    ).delete(synchronize_session=False)
    permissions_by_name = {
        row.name: row for row in db.query(Permission).filter(Permission.name.in_(requested)).all()
    }
    missing_seeded = sorted(set(requested) - set(permissions_by_name))
    if missing_seeded:
        raise HTTPException(status_code=409, detail={"message": "Platform permissions are not seeded.", "missing": missing_seeded})
    for name in requested:
        db.add(RolePermission(role_id=role_obj.id, permission_id=permissions_by_name[name].id))

    log_audit(
        db=db, tenant_id=platform_tenant.id, user_id=UUID(str(platform_user["user_id"])),
        action="UPDATE_ROLE_PERMISSIONS", module="platform_roles", record_id=role_obj.id,
        description=f"Updated permissions for role '{role_name}'",
        before_data={"permissions": before}, after_data={"permissions": requested},
    )
    db.commit()
    return {"message": f"Updated permissions for role '{role_name}'", "role": role_name, "permissions": requested}


# ============================================================================
# 5. TENANTS / COMPANIES MANAGEMENT & CUSTOMER LOOKUP
# ============================================================================

def serialize_tenant_company(db: Session, tenant: Tenant) -> dict:
    sub = (
        db.query(PlatformTenantSubscription, PlatformSubscriptionPlan)
        .join(
            PlatformSubscriptionPlan,
            PlatformSubscriptionPlan.id == PlatformTenantSubscription.plan_id,
        )
        .filter(PlatformTenantSubscription.tenant_id == tenant.id)
        .order_by(PlatformTenantSubscription.created_at.desc())
        .first()
    )
    user_count = db.query(User).filter(User.tenant_id == tenant.id).count()
    open_tickets = (
        db.query(SupportTicket)
        .filter(
            SupportTicket.tenant_id == tenant.id,
            SupportTicket.status.notin_(["Resolved", "Closed"]),
        )
        .count()
    )
    return {
        "id": str(tenant.id),
        "name": tenant.name,
        "industry": tenant.industry,
        "industry_key": normalize_industry_key(tenant.industry),
        "status": getattr(tenant, "status", "Active"),
        "users_count": user_count,
        "open_tickets_count": open_tickets,
        "subscription": {
            "subscription_id": str(sub[0].id),
            "plan_key": sub[1].plan_key,
            "plan_name": sub[1].name,
            "selected_plan_id": str(sub[0].selected_plan_id) if sub[0].selected_plan_id else None,
            "status": sub[0].status,
            "billing_cycle": sub[0].billing_cycle,
            "price": str(sub[1].price),
            "trial_start_date": sub[0].trial_start_date.isoformat() if sub[0].trial_start_date else None,
            "trial_end_date": sub[0].trial_end_date.isoformat() if sub[0].trial_end_date else None,
            "renewal_date": sub[0].renewal_date.isoformat() if sub[0].renewal_date else None,
        }
        if sub
        else None,
        "created_at": tenant.created_at.isoformat() if tenant.created_at else None,
    }


@router.get("/tenants")
def list_platform_tenants(
    industry_type: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = Query(default=None),
    platform_user: dict = Depends(require_platform_permission("platform.tenants.view")),
    db: Session = Depends(get_db),
):
    ensure_platform_seeded(db)
    effective_industry = enforce_industry_scope(platform_user, industry_type)

    query = db.query(Tenant).filter(Tenant.is_platform.is_(False))
    if status_filter:
        query = query.filter(Tenant.status == status_filter)
    if search:
        query = query.filter(Tenant.name.ilike(f"%{search.strip()}%"))

    tenants = query.order_by(Tenant.created_at.desc()).all()
    if effective_industry:
        tenants = [
            t for t in tenants if normalize_industry_key(t.industry) == effective_industry
        ]

    items = [serialize_tenant_company(db, t) for t in tenants]
    return {"items": items, "total": len(items)}


@router.post("/tenants", status_code=status.HTTP_201_CREATED)
def create_platform_tenant(
    payload: PlatformTenantCreateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.tenants.manage")),
    db: Session = Depends(get_db),
):
    platform_tenant = ensure_platform_seeded(db)
    db.query(Tenant.id).filter(Tenant.id == platform_tenant.id).with_for_update().first()
    norm_industry = normalize_industry_key(payload.industry)
    supported_industry_keys = {i["industry_key"] for i in PLATFORM_INDUSTRIES}
    if not norm_industry or norm_industry not in supported_industry_keys:
        raise HTTPException(
            status_code=422,
            detail={
                "message": f"Unsupported industry '{payload.industry}'.",
                "supported_industries": [i["name"] for i in PLATFORM_INDUSTRIES],
            },
        )

    if db.query(Tenant).filter(func.lower(Tenant.name) == payload.name.strip().lower()).first():
        raise HTTPException(status_code=409, detail="A company with this name already exists.")

    if payload.owner_email:
        owner_email_clean = str(payload.owner_email).strip().lower()
        if db.query(User).filter(func.lower(User.email) == owner_email_clean).first():
            raise HTTPException(status_code=409, detail="Owner email is already registered.")

    requested_plan_key = (payload.plan_key or "starter").strip().lower()
    plan = (
        db.query(PlatformSubscriptionPlan)
        .filter(func.lower(PlatformSubscriptionPlan.plan_key) == requested_plan_key)
        .with_for_update()
        .first()
    )
    if not plan:
        raise HTTPException(status_code=404, detail=f"Subscription plan '{requested_plan_key}' not found.")
    if not plan.is_active:
        raise HTTPException(status_code=409, detail=f"Subscription plan '{plan.name}' is inactive.")

    from app.core.industry_registry import INDUSTRY_REGISTRY
    tenant = Tenant(
        name=payload.name.strip(),
        industry=INDUSTRY_REGISTRY[norm_industry]["name"],
        status="Active",
        is_platform=False,
    )
    db.add(tenant)
    db.flush()

    pack_key = classify_industry(tenant.industry)
    pack = db.query(IndustryPack).filter(
        IndustryPack.pack_key == pack_key, IndustryPack.is_active.is_(True)
    ).first()
    if not pack:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail=f"No active industry pack is configured for industry '{tenant.industry}' (pack key: {pack_key}). Provisioning was cancelled.",
        )
    db.add(TenantIndustryConfig(tenant_id=tenant.id, industry_pack_id=pack.id, overrides={}))

    from app.services.subscription_service import provision_tenant_global_free_trial
    trial_sub = provision_tenant_global_free_trial(
        db=db,
        tenant=tenant,
        actor_user_id=UUID(str(platform_user["user_id"])),
    )
    if plan.plan_key != "free_trial":
        trial_sub.selected_plan_id = plan.id
        trial_sub.selected_billing_cycle = plan.billing_cycle

    if payload.owner_email and payload.owner_password and payload.owner_full_name:
        from app.services.platform_config import enforce_configured_password_policy
        enforce_configured_password_policy(db, payload.owner_password, [str(payload.owner_email), payload.owner_full_name])
        owner_role = db.query(Role).filter(Role.name == "Tenant Owner").first()
        if not owner_role:
            owner_role = Role(name="Tenant Owner")
            db.add(owner_role)
            db.flush()
        owner_user = User(
            tenant_id=tenant.id,
            full_name=payload.owner_full_name.strip(),
            email=str(payload.owner_email).strip().lower(),
            password=hash_password(payload.owner_password),
            status="Active",
            must_change_password=False,
            profile_completed=True,
            job_title="Tenant Owner",
        )
        db.add(owner_user)
        db.flush()
        db.add(UserRole(user_id=owner_user.id, role_id=owner_role.id))

    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=UUID(str(platform_user["user_id"])),
        action="PROVISION_TENANT",
        module="platform_tenants",
        record_id=tenant.id,
        description=f"Provisioned customer company '{tenant.name}' ({tenant.industry})",
    )
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Tenant or owner provisioning conflicted with an existing record.",
        ) from exc
    db.refresh(tenant)
    return serialize_tenant_company(db, tenant)


@router.get("/tenants/{tenant_id}")
def get_platform_tenant(
    tenant_id: UUID,
    platform_user: dict = Depends(require_platform_permission("platform.tenants.view")),
    db: Session = Depends(get_db),
):
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id, Tenant.is_platform.is_(False)).with_for_update().first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Customer company not found.")
    enforce_target_industry_scope(platform_user, tenant.industry)
    return serialize_tenant_company(db, tenant)


@router.patch("/tenants/{tenant_id}")
def update_platform_tenant(
    tenant_id: UUID,
    payload: PlatformTenantUpdateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.tenants.manage")),
    db: Session = Depends(get_db),
):
    platform_tenant = ensure_platform_seeded(db)
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id, Tenant.is_platform.is_(False)).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Customer company not found.")
    enforce_target_industry_scope(platform_user, tenant.industry)
    if payload.industry is not None:
        enforce_target_industry_scope(platform_user, payload.industry)

    before = serialize_tenant_company(db, tenant)
    if payload.name is not None:
        cleaned_name = payload.name.strip()
        dup = (
            db.query(Tenant)
            .filter(func.lower(Tenant.name) == cleaned_name.lower(), Tenant.id != tenant.id)
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail="Another company with this name already exists.")
        tenant.name = cleaned_name
    if payload.industry is not None:
        norm_ind = normalize_industry_key(payload.industry)
        supported_keys = {i["industry_key"] for i in PLATFORM_INDUSTRIES}
        if not norm_ind or norm_ind not in supported_keys:
            raise HTTPException(status_code=422, detail=f"Unsupported industry '{payload.industry}'.")
        from app.core.industry_registry import INDUSTRY_REGISTRY
        new_industry = INDUSTRY_REGISTRY[norm_ind]["name"]
        pack_key = classify_industry(new_industry)
        pack = db.query(IndustryPack).filter(
            IndustryPack.pack_key == pack_key, IndustryPack.is_active.is_(True)
        ).first()
        if not pack:
            raise HTTPException(
                status_code=409,
                detail=f"No active industry pack is configured for industry '{new_industry}'.",
            )
        config = db.query(TenantIndustryConfig).filter(
            TenantIndustryConfig.tenant_id == tenant.id
        ).with_for_update().first()
        if config:
            config.industry_pack_id = pack.id
        else:
            db.add(TenantIndustryConfig(tenant_id=tenant.id, industry_pack_id=pack.id, overrides={}))
        tenant.industry = new_industry
    if payload.status is not None:
        tenant.status = payload.status
        if payload.status in {"Suspended", "Inactive"}:
            # Cut off long-lived sessions right away; access tokens are also
            # rejected by get_current_user via the tenant status check.
            tenant_user_ids = db.query(User.id).filter(User.tenant_id == tenant.id)
            db.query(RefreshSession).filter(
                RefreshSession.user_id.in_(tenant_user_ids),
                RefreshSession.revoked.is_(False),
            ).update({RefreshSession.revoked: True}, synchronize_session=False)

    after = serialize_tenant_company(db, tenant)
    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=UUID(str(platform_user["user_id"])),
        action="UPDATE_TENANT",
        module="platform_tenants",
        record_id=tenant.id,
        description=f"Updated customer company '{tenant.name}' (status={tenant.status})",
        before_data=before,
        after_data=after,
    )
    db.commit()
    return {"message": "Customer company updated successfully", "tenant": after}


@router.get("/customer-lookup")
def support_customer_lookup(
    q: str = Query(default="", description="Company name or industry search"),
    platform_user: dict = Depends(require_platform_permission("platform.tenants.view")),
    db: Session = Depends(get_db),
):
    """
    Minimal customer lookup for Platform Support & Industry Support (Pages 13 & 21):
    Returns only the minimum company information required to resolve support issues, without exposing private CRM records.
    """
    effective_industry = enforce_industry_scope(platform_user, None)
    query = db.query(Tenant).filter(Tenant.is_platform.is_(False))
    if q.strip():
        query = query.filter(Tenant.name.ilike(f"%{q.strip()}%"))
    tenants = query.order_by(Tenant.name.asc()).limit(50).all()
    if effective_industry:
        tenants = [t for t in tenants if normalize_industry_key(t.industry) == effective_industry]

    results = []
    for t in tenants:
        item = serialize_tenant_company(db, t)
        results.append(
            {
                "tenant_id": item["id"],
                "company_name": item["name"],
                "industry": item["industry"],
                "industry_key": item["industry_key"],
                "status": item["status"],
                "subscription_plan": item["subscription"]["plan_name"] if item["subscription"] else "Unassigned",
                "subscription_status": item["subscription"]["status"] if item["subscription"] else "None",
                "open_tickets_count": item["open_tickets_count"],
            }
        )
    return {"items": results, "total": len(results)}


# ============================================================================
# 6. DASHBOARDS ENGINE (11 CENTRAL PLATFORM + 7 REUSABLE INDUSTRY DASHBOARDS)
# ============================================================================

def build_role_dashboard_payload(
    db: Session,
    role_name: str,
    industry_key: str | None = None,
    user_id: UUID | None = None,
) -> dict:
    ensure_platform_seeded(db)
    norm_ind = normalize_industry_key(industry_key) if industry_key else None
    dash_meta = get_dashboard_metadata(role_name, norm_ind)

    # Ensure all existing tickets have platform routing metadata
    unrouted_tickets = (
        db.query(SupportTicket)
        .outerjoin(
            PlatformSupportTicketMeta,
            PlatformSupportTicketMeta.ticket_id == SupportTicket.id,
        )
        .filter(PlatformSupportTicketMeta.id.is_(None))
        .all()
    )
    for t in unrouted_tickets:
        auto_route_support_ticket(db, t)
    if unrouted_tickets:
        db.commit()

    tenants = db.query(Tenant).filter(Tenant.is_platform.is_(False)).all()
    if norm_ind:
        scoped_tenants = [t for t in tenants if normalize_industry_key(t.industry) == norm_ind]
    else:
        scoped_tenants = tenants
    scoped_tenant_ids = {t.id for t in scoped_tenants}

    total_companies = len(scoped_tenants)
    active_companies = sum(1 for t in scoped_tenants if getattr(t, "status", "Active") == "Active")

    emp_q = db.query(PlatformEmployee)
    if norm_ind:
        emp_q = emp_q.filter(PlatformEmployee.industry_key == norm_ind)
    total_employees = emp_q.count()

    ticket_q = db.query(SupportTicket, PlatformSupportTicketMeta).join(
        PlatformSupportTicketMeta,
        PlatformSupportTicketMeta.ticket_id == SupportTicket.id,
    )
    if norm_ind:
        ticket_q = ticket_q.filter(PlatformSupportTicketMeta.industry_key == norm_ind)
    ticket_rows = ticket_q.all()

    open_tickets = sum(1 for t, _ in ticket_rows if t.status not in {"Resolved", "Closed"})
    resolved_tickets = sum(1 for t, _ in ticket_rows if t.status in {"Resolved", "Closed"})
    escalated_tickets = sum(1 for _, m in ticket_rows if m.is_escalated)
    sla_breached_tickets = sum(1 for _, m in ticket_rows if m.sla_breached)
    my_assigned_tickets = (
        sum(
            1
            for t, m in ticket_rows
            if user_id and (m.assigned_employee_user_id == user_id or t.assigned_to == user_id)
        )
        if user_id
        else 0
    )

    subs_q = db.query(PlatformTenantSubscription).filter(
        PlatformTenantSubscription.status == "Active"
    )
    if norm_ind:
        subs_q = subs_q.filter(PlatformTenantSubscription.tenant_id.in_(scoped_tenant_ids))
    active_subscriptions = subs_q.count()

    inv_q = db.query(PlatformBillingInvoice)
    if norm_ind:
        inv_q = inv_q.filter(PlatformBillingInvoice.tenant_id.in_(scoped_tenant_ids))
    invoices = inv_q.all()
    total_revenue = sum((i.paid_amount for i in invoices), Decimal("0.00"))
    overdue_invoices = sum(1 for i in invoices if i.status == "Overdue")

    failed_payments = (
        db.query(PlatformBillingPayment)
        .filter(PlatformBillingPayment.status == "Failed")
        .count()
    )
    pending_refunds = (
        db.query(PlatformRefundRequest)
        .filter(PlatformRefundRequest.status == "Pending")
        .count()
    )

    sales_q = db.query(PlatformSalesProspect)
    if norm_ind:
        sales_q = sales_q.filter(PlatformSalesProspect.industry_key == norm_ind)
    prospects = sales_q.all()
    total_prospects = len(prospects)
    won_prospects = sum(1 for p in prospects if p.pipeline_stage == "Won")
    pipeline_mrr = sum((p.estimated_mrr for p in prospects if p.pipeline_stage != "Lost"), Decimal("0.00"))

    exp_q = db.query(PlatformExpense)
    if norm_ind:
        exp_q = exp_q.filter(PlatformExpense.industry_key == norm_ind)
    expenses = exp_q.all()
    total_expenses = sum((e.amount for e in expenses if e.status in {"Approved", "Paid", "Reconciled"}), Decimal("0.00"))
    pending_expenses = sum(1 for e in expenses if e.status == "Pending")

    active_incidents = (
        db.query(PlatformTechnicalIncident)
        .filter(PlatformTechnicalIncident.status.notin_(["Resolved", "Deployed"]))
        .count()
    )
    failed_logins = (
        db.query(PlatformSecurityEvent)
        .filter(PlatformSecurityEvent.event_type == "login_failed")
        .count()
    )
    security_incidents = (
        db.query(PlatformSecurityEvent)
        .filter(
            PlatformSecurityEvent.event_type.in_(["security_incident", "suspicious_activity"]),
            PlatformSecurityEvent.status != "Closed",
        )
        .count()
    )
    audit_logs_count = db.query(AuditLog).count()

    return {
        **dash_meta,
        "kpis": {
            "total_companies": total_companies,
            "active_companies": active_companies,
            "platform_employees": total_employees,
            "active_subscriptions": active_subscriptions,
            "trialing_tenants": db.query(PlatformTenantSubscription).filter(PlatformTenantSubscription.status == "Trial").count(),
            "expired_subscriptions": db.query(PlatformTenantSubscription).filter(PlatformTenantSubscription.status == "Expired").count(),
            "pending_payment_verifications": db.query(PlatformBillingPayment).filter(PlatformBillingPayment.status.in_(["Submitted", "Under Review"])).count(),
            "total_revenue": str(total_revenue),
            "overdue_invoices": overdue_invoices,
            "failed_payments": failed_payments,
            "pending_refunds": pending_refunds,
            "open_tickets": open_tickets,
            "resolved_tickets": resolved_tickets,
            "my_assigned_tickets": my_assigned_tickets,
            "escalated_tickets": escalated_tickets,
            "sla_breached_tickets": sla_breached_tickets,
            "sales_prospects": total_prospects,
            "sales_conversions": won_prospects,
            "pipeline_estimated_mrr": str(pipeline_mrr),
            "total_expenses": str(total_expenses),
            "pending_expense_requests": pending_expenses,
            "net_profit_estimate": str(total_revenue - total_expenses),
            "active_technical_incidents": active_incidents,
            "failed_login_attempts": failed_logins,
            "open_security_incidents": security_incidents,
            "total_audit_events": audit_logs_count,
        },
    }


@router.get("/dashboards/catalog")
def get_dashboards_catalog(
    platform_user: dict = Depends(require_platform_permission("platform.dashboard.view")),
):
    """
    Returns the complete catalog of:
    A. Central Platform Employee Dashboards (one for each platform role)
    B. 7 Reusable Industry Employee Dashboards (same layout reused for all 10 industries; data & context change by team)
    """
    return {
        "central_platform_dashboards": [
            {
                "role": r["name"],
                "role_key": r["key"],
                "dashboard_key": r["dashboard_key"],
                "dashboard_title": r["dashboard_title"],
                "responsibility": r["responsibility"],
                "sidebar_modules": ROLE_SIDEBAR_MODULES.get(r["name"], []),
            }
            for r in CENTRAL_PLATFORM_ROLES
        ],
        "reusable_industry_dashboards": [
            {
                "role": r["name"],
                "role_key": r["key"],
                "dashboard_key": r["dashboard_key"],
                "dashboard_title": r["dashboard_title"],
                "responsibility": r["responsibility"],
                "reused_across_industries": [i["industry_key"] for i in PLATFORM_INDUSTRIES],
                "sidebar_modules": ROLE_SIDEBAR_MODULES.get(r["name"], []),
            }
            for r in REUSABLE_INDUSTRY_ROLES
        ],
        "industries": PLATFORM_INDUSTRIES,
    }


@router.get("/dashboards/me")
def get_my_platform_dashboard(
    platform_user: dict = Depends(require_platform_permission("platform.dashboard.view")),
    db: Session = Depends(get_db),
):
    """
    Loads the authorized Platform or Industry dashboard based on the logged-in employee's role and industry team.
    """
    role_name = platform_user["role"]
    industry_key = platform_user.get("industry_key")
    user_id = UUID(str(platform_user["user_id"]))
    return build_role_dashboard_payload(db, role_name, industry_key, user_id)


@router.get("/dashboards/platform/{role_key}")
def get_central_platform_dashboard_by_role(
    role_key: str,
    platform_user: dict = Depends(require_platform_permission("platform.dashboard.view")),
    db: Session = Depends(get_db),
):
    if platform_user.get("role_scope") == "industry_team":
        raise HTTPException(
            status_code=403,
            detail="Industry team employees can only access their assigned industry dashboard.",
        )

    matched_role = None
    for r in CENTRAL_PLATFORM_ROLES:
        if r["key"] == role_key or r["name"].lower() == role_key.replace("_", " ").lower():
            matched_role = r["name"]
            break
    if not matched_role:
        raise HTTPException(status_code=404, detail=f"Platform role dashboard '{role_key}' not found.")

    if (
        platform_user["role"] not in {"Platform Super Admin", "Platform Admin"}
        and platform_user["role"] != matched_role
    ):
        raise HTTPException(
            status_code=403,
            detail=f"You are only authorized to access the '{platform_user['role']}' dashboard.",
        )

    return build_role_dashboard_payload(
        db, matched_role, None, UUID(str(platform_user["user_id"]))
    )


@router.get("/dashboards/industry/{industry_key}/{role_key}")
def get_reusable_industry_dashboard(
    industry_key: str,
    role_key: str,
    platform_user: dict = Depends(require_platform_permission("platform.dashboard.view")),
    db: Session = Depends(get_db),
):
    """
    Loads one of the 7 Reusable Industry Employee Dashboards scoped to the specified industry_key.
    Enforces strict cross-industry isolation so an employee in Real Estate cannot access Healthcare or Software data.
    """
    norm_ind = enforce_industry_scope(platform_user, industry_key) or normalize_industry_key(industry_key)
    matched_role = None
    for r in REUSABLE_INDUSTRY_ROLES:
        if r["key"] == role_key or r["name"].lower() == role_key.replace("_", " ").lower():
            matched_role = r["name"]
            break
    if not matched_role:
        raise HTTPException(status_code=404, detail=f"Industry role dashboard '{role_key}' not found.")

    if (
        platform_user.get("role_scope") == "industry_team"
        and platform_user["role"] not in {"Team Admin", "Team Manager", matched_role}
    ):
        raise HTTPException(
            status_code=403,
            detail=f"You are only authorized to access the '{platform_user['role']}' dashboard.",
        )

    return build_role_dashboard_payload(
        db, matched_role, norm_ind, UUID(str(platform_user["user_id"]))
    )
