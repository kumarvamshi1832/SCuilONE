from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import logging
import secrets
import uuid
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.subscription_config import (
    ALLOWED_POST_EXPIRATION_EXACT_PATHS,
    ALLOWED_POST_EXPIRATION_PATH_PREFIXES,
    COMMON_CRM_MODULES,
    DEFAULT_GRACE_PERIOD_DAYS,
    DEFAULT_INVOICE_DUE_DAYS,
    DEFAULT_PAYMENT_INSTRUCTIONS,
    DEFAULT_TAX_RATE_PCT,
    FREE_TRIAL_DAYS,
    POST_TRIAL_REMINDER_SCHEDULE,
    REAL_ESTATE_CRM_MODULES,
    RENEWAL_INVOICE_LEAD_DAYS,
    SOFTWARE_CRM_MODULES,
    TRIAL_REMINDER_SCHEDULE,
    ensure_utc,
    get_industry_enabled_modules,
    get_trial_resource_policy,
    utc_now,
)
from app.models.account import Account
from app.models.contact import Contact
from app.models.deal import Deal
from app.models.document import Document
from app.models.industry_pack import IndustryPack
from app.models.lead import Lead
from app.models.notification import Notification
from app.models.permission import Permission
from app.models.platform import (
    PlatformBillingInvoice,
    PlatformBillingPayment,
    PlatformSetting,
    PlatformSubscriptionEvent,
    PlatformSubscriptionPlan,
    PlatformSubscriptionReminderCampaign,
    PlatformSubscriptionReminderLog,
    PlatformTenantSubscription,
)
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.tenant import Tenant
from app.models.tenant_industry_config import TenantIndustryConfig
from app.models.user import User
from app.models.user_role import UserRole
from app.services.audit_service import log_audit
from app.services.email_service import (
    send_subscription_activated_email,
    send_trial_or_post_trial_reminder_email,
)

logger = logging.getLogger(__name__)


def classify_tenant_industry(value: str | None) -> str:
    normalized = " ".join(
        (value or "").strip().lower().replace("_", " ").replace("-", " ").split()
    )
    if "software" in normalized or "it consulting" in normalized or "it & software" in normalized:
        return "software"
    if "real estate" in normalized or "realestate" in normalized:
        return "real_estate"
    return "other"


def ensure_subscription_infrastructure_seeded(db: Session) -> None:
    """
    Idempotently ensures subscription plans, industry packs, tenant roles, and permissions exist
    so registration, trial provisioning, plan selection, and CRM access checks always work.
    """
    from app.database.seed_platform import DEFAULT_PLANS, seed_platform_data
    from app.database.seed_permissions import permissions as tenant_permissions
    from app.database.seed_role_permissions import role_permissions as tenant_role_perms
    from app.database.seed_roles import roles as all_roles
    from scripts.seed_industry_packs import INDUSTRY_PACKS

    if db.query(PlatformSubscriptionPlan).count() == 0:
        seed_platform_data(db)

    # Ensure annual_price and enabled_modules_json are populated on default plans
    plan_defaults_by_key = {
        "free_trial": {
            "annual_price": Decimal("0.00"),
            "enabled_modules": COMMON_CRM_MODULES + REAL_ESTATE_CRM_MODULES + SOFTWARE_CRM_MODULES,
        },
        "starter": {
            "annual_price": Decimal("49990.00"),
            "enabled_modules": COMMON_CRM_MODULES + REAL_ESTATE_CRM_MODULES + SOFTWARE_CRM_MODULES,
        },
        "professional": {
            "annual_price": Decimal("129990.00"),
            "enabled_modules": COMMON_CRM_MODULES + REAL_ESTATE_CRM_MODULES + SOFTWARE_CRM_MODULES,
        },
        "business": {
            "annual_price": Decimal("249990.00"),
            "enabled_modules": COMMON_CRM_MODULES + REAL_ESTATE_CRM_MODULES + SOFTWARE_CRM_MODULES,
        },
        "enterprise": {
            "annual_price": Decimal("99999.00"),
            "enabled_modules": COMMON_CRM_MODULES + REAL_ESTATE_CRM_MODULES + SOFTWARE_CRM_MODULES,
        },
    }
    for p_data in DEFAULT_PLANS:
        plan = (
            db.query(PlatformSubscriptionPlan)
            .filter(PlatformSubscriptionPlan.plan_key == p_data["plan_key"])
            .first()
        )
        extra = plan_defaults_by_key.get(p_data["plan_key"], {})
        if not plan:
            plan = PlatformSubscriptionPlan(
                **p_data,
                annual_price=extra.get("annual_price"),
                enabled_modules_json=extra.get("enabled_modules", []),
            )
            db.add(plan)
        else:
            if plan.annual_price is None and extra.get("annual_price") is not None:
                plan.annual_price = extra["annual_price"]
            if not plan.enabled_modules_json and extra.get("enabled_modules"):
                plan.enabled_modules_json = extra["enabled_modules"]

    # Ensure industry packs exist
    for pack_data in INDUSTRY_PACKS:
        existing_pack = (
            db.query(IndustryPack)
            .filter(IndustryPack.pack_key == pack_data["pack_key"])
            .first()
        )
        if not existing_pack:
            db.add(IndustryPack(**pack_data))

    # Ensure Tenant CRM roles & permissions exist
    existing_roles = {r.name: r for r in db.query(Role).all()}
    for r_name in all_roles:
        if r_name not in existing_roles:
            r_obj = Role(name=r_name)
            db.add(r_obj)
            db.flush()
            existing_roles[r_name] = r_obj

    existing_perms = {p.name: p for p in db.query(Permission).all()}
    for p_name, p_desc in tenant_permissions:
        if p_name not in existing_perms:
            p_obj = Permission(name=p_name, description=p_desc)
            db.add(p_obj)
            db.flush()
            existing_perms[p_name] = p_obj

    for r_name, p_names in tenant_role_perms.items():
        r_obj = existing_roles.get(r_name)
        if not r_obj:
            continue
        current_perm_ids = {
            rp.permission_id
            for rp in db.query(RolePermission).filter(RolePermission.role_id == r_obj.id).all()
        }
        for p_name in p_names:
            p_obj = existing_perms.get(p_name)
            if p_obj and p_obj.id not in current_perm_ids:
                db.add(RolePermission(role_id=r_obj.id, permission_id=p_obj.id))

    db.flush()


def ensure_tenant_industry_config(db: Session, tenant: Tenant) -> TenantIndustryConfig | None:
    """Ensure the tenant has a valid TenantIndustryConfig linked to its active IndustryPack."""
    pack_key = classify_tenant_industry(tenant.industry)
    pack = (
        db.query(IndustryPack)
        .filter(IndustryPack.pack_key == pack_key, IndustryPack.is_active.is_(True))
        .first()
    )
    if not pack:
        return None
    cfg = (
        db.query(TenantIndustryConfig)
        .filter(TenantIndustryConfig.tenant_id == tenant.id)
        .first()
    )
    if not cfg:
        cfg = TenantIndustryConfig(
            tenant_id=tenant.id,
            industry_pack_id=pack.id,
            overrides={},
        )
        db.add(cfg)
        db.flush()
    elif cfg.industry_pack_id != pack.id:
        cfg.industry_pack_id = pack.id
        db.flush()
    return cfg


def record_subscription_event(
    db: Session,
    tenant_id: UUID,
    event_type: str,
    description: str,
    subscription_id: UUID | None = None,
    invoice_id: UUID | None = None,
    payment_id: UUID | None = None,
    actor_user_id: UUID | None = None,
    previous_status: str | None = None,
    new_status: str | None = None,
    metadata: dict | None = None,
) -> PlatformSubscriptionEvent:
    ev = PlatformSubscriptionEvent(
        tenant_id=tenant_id,
        subscription_id=subscription_id,
        invoice_id=invoice_id,
        payment_id=payment_id,
        actor_user_id=actor_user_id,
        event_type=event_type,
        previous_status=previous_status,
        new_status=new_status,
        description=description,
        metadata_json=metadata or {},
    )
    db.add(ev)
    db.flush()
    return ev


def get_tenant_subscription(
    db: Session,
    tenant_id: UUID,
    for_update: bool = False,
) -> PlatformTenantSubscription | None:
    q = (
        db.query(PlatformTenantSubscription)
        .filter(PlatformTenantSubscription.tenant_id == tenant_id)
        .order_by(PlatformTenantSubscription.created_at.desc())
    )
    if for_update:
        q = q.with_for_update()
    return q.first()


def provision_tenant_global_free_trial(
    db: Session,
    tenant: Tenant,
    actor_user_id: UUID | None = None,
    now: datetime | None = None,
) -> PlatformTenantSubscription:
    """
    PART 1 – Automatically creates the global 14-day free trial subscription upon company registration.
    - Always uses FREE_TRIAL_DAYS = 14 (never plan.trial_days).
    - Prevents duplicate trial creation or repeated trials for the same tenant.
    """
    ensure_subscription_infrastructure_seeded(db)
    now_utc = ensure_utc(now) or utc_now()

    existing_sub = (
        db.query(PlatformTenantSubscription)
        .filter(PlatformTenantSubscription.tenant_id == tenant.id)
        .with_for_update()
        .first()
    )
    if existing_sub is not None or getattr(tenant, "trial_used", False):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A free trial or subscription has already been provisioned for this tenant. Duplicate trials are not permitted.",
        )

    free_trial_plan = (
        db.query(PlatformSubscriptionPlan)
        .filter(PlatformSubscriptionPlan.plan_key == "free_trial")
        .first()
    )
    if not free_trial_plan:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Free trial plan configuration is missing.",
        )

    trial_start = now_utc
    trial_end = trial_start + timedelta(days=FREE_TRIAL_DAYS)
    trial_policy = get_trial_resource_policy(tenant.industry)

    ensure_tenant_industry_config(db, tenant)

    tenant.trial_used = True
    tenant.status = "Trial"
    if not tenant.unsubscribe_token:
        tenant.unsubscribe_token = secrets.token_urlsafe(24)

    sub = PlatformTenantSubscription(
        tenant_id=tenant.id,
        plan_id=free_trial_plan.id,
        selected_plan_id=None,
        selected_billing_cycle=None,
        status="Trial",
        billing_cycle="Monthly",
        auto_renew=False,
        trial_start_date=trial_start,
        trial_end_date=trial_end,
        starts_at=trial_start.replace(tzinfo=None),
        ends_at=trial_end.replace(tzinfo=None),
        renewal_date=trial_end.date(),
        applied_limits_json=trial_policy,
        usage_json={"users_count": 1, "branches_count": 1, "storage_used_bytes": 0},
    )
    db.add(sub)
    db.flush()

    campaign = (
        db.query(PlatformSubscriptionReminderCampaign)
        .filter(PlatformSubscriptionReminderCampaign.tenant_id == tenant.id)
        .first()
    )
    if not campaign:
        campaign = PlatformSubscriptionReminderCampaign(
            tenant_id=tenant.id,
            subscription_id=sub.id,
            campaign_status="Trial_Active",
            trial_end_date=trial_end,
        )
        db.add(campaign)
        db.flush()

    record_subscription_event(
        db=db,
        tenant_id=tenant.id,
        subscription_id=sub.id,
        actor_user_id=actor_user_id,
        event_type="TRIAL_STARTED",
        previous_status=None,
        new_status="Trial",
        description=f"Provisioned global {FREE_TRIAL_DAYS}-day free trial for '{tenant.name}'",
        metadata={
            "trial_days": FREE_TRIAL_DAYS,
            "trial_start_date": trial_start.isoformat(),
            "trial_end_date": trial_end.isoformat(),
        },
    )
    log_audit(
        db=db,
        tenant_id=tenant.id,
        user_id=actor_user_id,
        action="START_FREE_TRIAL",
        module="subscriptions",
        record_id=sub.id,
        description=f"Started {FREE_TRIAL_DAYS}-day global free trial for '{tenant.name}'",
        after_data={
            "status": "Trial",
            "trial_start_date": trial_start.isoformat(),
            "trial_end_date": trial_end.isoformat(),
            "trial_days": FREE_TRIAL_DAYS,
        },
    )
    return sub


def sync_tenant_subscription_state(
    db: Session,
    tenant_id: UUID,
    now: datetime | None = None,
) -> PlatformTenantSubscription | None:
    """
    Evaluates and updates subscription state in real time:
    - Transitions expired Trial subscriptions (now >= trial_end_date) to 'Expired'.
    - Transitions past-due Active subscriptions into 'Past Due' (within grace period) or 'Suspended' / 'Expired'.
    """
    sub = get_tenant_subscription(db, tenant_id)
    if not sub:
        return None

    now_utc = ensure_utc(now) or utc_now()
    changed = False

    if sub.status == "Trial":
        trial_end = ensure_utc(sub.trial_end_date) or (
            ensure_utc(sub.ends_at)
            if sub.ends_at
            else (ensure_utc(sub.starts_at) + timedelta(days=FREE_TRIAL_DAYS))
        )
        if trial_end and now_utc >= trial_end:
            prev_status = sub.status
            sub.status = "Expired"
            sub.expired_at = now_utc
            changed = True

            campaign = (
                db.query(PlatformSubscriptionReminderCampaign)
                .filter(PlatformSubscriptionReminderCampaign.tenant_id == tenant_id)
                .first()
            )
            if campaign and campaign.campaign_status == "Trial_Active":
                campaign.campaign_status = "Post_Trial_Active"
                campaign.trial_end_date = trial_end

            record_subscription_event(
                db=db,
                tenant_id=tenant_id,
                subscription_id=sub.id,
                event_type="TRIAL_EXPIRED",
                previous_status=prev_status,
                new_status="Expired",
                description="14-day free trial expired without an approved paid subscription.",
                metadata={"trial_end_date": trial_end.isoformat()},
            )

    elif sub.status == "Active" and not sub.is_complimentary:
        ends_utc = ensure_utc(sub.ends_at)
        if ends_utc and now_utc >= ends_utc:
            prev_status = sub.status
            if not sub.auto_renew:
                sub.status = "Expired"
                sub.expired_at = now_utc
                changed = True
                record_subscription_event(
                    db=db,
                    tenant_id=tenant_id,
                    subscription_id=sub.id,
                    event_type="SUBSCRIPTION_EXPIRED",
                    previous_status=prev_status,
                    new_status="Expired",
                    description="Paid subscription period ended with auto_renew disabled.",
                )
            else:
                grace_days = get_configured_grace_period_days(db)
                grace_end = ends_utc + timedelta(days=grace_days)
                if grace_days > 0 and now_utc < grace_end:
                    sub.status = "Past Due"
                    sub.grace_period_ends_at = grace_end
                    changed = True
                    record_subscription_event(
                        db=db,
                        tenant_id=tenant_id,
                        subscription_id=sub.id,
                        event_type="SUBSCRIPTION_PAST_DUE",
                        previous_status=prev_status,
                        new_status="Past Due",
                        description=f"Subscription entered {grace_days}-day renewal grace period.",
                        metadata={"grace_period_ends_at": grace_end.isoformat()},
                    )
                else:
                    sub.status = "Suspended"
                    sub.grace_period_ends_at = grace_end
                    sub.suspended_at = now_utc
                    sub.suspension_reason = "Renewal payment overdue past grace period"
                    changed = True
                    record_subscription_event(
                        db=db,
                        tenant_id=tenant_id,
                        subscription_id=sub.id,
                        event_type="SUBSCRIPTION_SUSPENDED",
                        previous_status=prev_status,
                        new_status="Suspended",
                        description="Subscription automatically suspended after renewal grace period elapsed.",
                    )

    elif sub.status == "Past Due":
        grace_end = ensure_utc(sub.grace_period_ends_at)
        if grace_end and now_utc >= grace_end:
            prev_status = sub.status
            sub.status = "Suspended"
            sub.suspended_at = now_utc
            sub.suspension_reason = "Renewal payment overdue past grace period"
            changed = True
            record_subscription_event(
                db=db,
                tenant_id=tenant_id,
                subscription_id=sub.id,
                event_type="SUBSCRIPTION_SUSPENDED",
                previous_status=prev_status,
                new_status="Suspended",
                description="Subscription automatically suspended after grace period expired.",
            )

    if changed:
        db.commit()
        db.refresh(sub)

    return sub


def get_configured_grace_period_days(db: Session) -> int:
    setting = (
        db.query(PlatformSetting)
        .filter(PlatformSetting.setting_key == "platform.billing_config")
        .first()
    )
    if setting and isinstance(setting.value_json, dict):
        val = setting.value_json.get("grace_period_days")
        if isinstance(val, int) and val >= 0:
            return val
    return DEFAULT_GRACE_PERIOD_DAYS


def get_configured_payment_instructions(db: Session) -> dict:
    setting = (
        db.query(PlatformSetting)
        .filter(PlatformSetting.setting_key == "platform.billing_config")
        .first()
    )
    if setting and isinstance(setting.value_json, dict):
        instr = setting.value_json.get("payment_instructions")
        if isinstance(instr, dict) and instr:
            return {**DEFAULT_PAYMENT_INSTRUCTIONS, **instr}
    return dict(DEFAULT_PAYMENT_INSTRUCTIONS)


def get_configured_tax_rate_pct(db: Session) -> Decimal:
    setting = (
        db.query(PlatformSetting)
        .filter(PlatformSetting.setting_key == "platform.billing_config")
        .first()
    )
    if setting and isinstance(setting.value_json, dict):
        rate = setting.value_json.get("tax_rate_pct")
        if rate is not None:
            return Decimal(str(rate))
    return DEFAULT_TAX_RATE_PCT


def is_path_allowed_when_expired(path: str) -> bool:
    """Return True if the request path is allowed when a tenant's trial or subscription is expired/restricted (PART 7)."""
    clean_path = (path or "").rstrip("/") or "/"
    if clean_path in ALLOWED_POST_EXPIRATION_EXACT_PATHS:
        return True
    for prefix in ALLOWED_POST_EXPIRATION_PATH_PREFIXES:
        if clean_path == prefix or clean_path.startswith(prefix + "/"):
            return True
    return False


def check_tenant_crm_access(
    db: Session,
    tenant_id: UUID,
    now: datetime | None = None,
) -> tuple[bool, str, PlatformTenantSubscription | None]:
    """
    Determines whether a tenant is permitted to access CRM business modules (PART 6 & PART 7).
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        return False, "Tenant not found.", None
    if tenant.is_platform:
        return True, "Platform tenant", None

    sub = sync_tenant_subscription_state(db, tenant_id, now=now)
    if sub is None:
        # If a tenant has no subscription record yet and hasn't used a trial, allow if legacy or block if trial_used
        if getattr(tenant, "trial_used", False):
            return (
                False,
                "No active subscription found. Please select a subscription plan and complete payment.",
                None,
            )
        return True, "No subscription restriction configured", None

    now_utc = ensure_utc(now) or utc_now()

    if sub.status == "Trial":
        trial_end = ensure_utc(sub.trial_end_date) or ensure_utc(sub.ends_at)
        if trial_end and now_utc >= trial_end:
            return (
                False,
                "Your 14-day free trial has expired. Please select a paid plan and complete payment to restore CRM access.",
                sub,
            )
        return True, "Free trial active", sub

    if sub.status == "Active":
        ends_utc = ensure_utc(sub.ends_at)
        if not sub.is_complimentary and ends_utc and now_utc >= ends_utc:
            return (
                False,
                "Your subscription has expired. Please complete renewal payment to restore CRM access.",
                sub,
            )
        return True, "Subscription active", sub

    if sub.status == "Past Due":
        grace_end = ensure_utc(sub.grace_period_ends_at)
        if grace_end and now_utc < grace_end:
            return True, "Subscription in renewal grace period", sub
        return (
            False,
            "Your subscription payment is past due and the grace period has ended. Please complete payment to restore CRM access.",
            sub,
        )

    if sub.status == "Suspended":
        return (
            False,
            "Your subscription is suspended. Please contact Platform Support or complete overdue payment to restore CRM access.",
            sub,
        )

    if sub.status == "Cancelled":
        return (
            False,
            "Your subscription has been cancelled. Please select a plan and complete payment to restore CRM access.",
            sub,
        )

    return (
        False,
        "Your free trial or subscription has expired. Please select a paid subscription plan and complete payment verification to restore CRM access.",
        sub,
    )


def enforce_subscription_crm_access(
    db: Session,
    tenant_id: UUID,
    request_path: str | None = None,
    now: datetime | None = None,
) -> PlatformTenantSubscription | None:
    """
    Raises 403 Forbidden if the tenant's trial or subscription does not allow CRM business module access
    and the requested endpoint is not on the post-expiration billing/auth restoration whitelist.
    """
    if request_path and is_path_allowed_when_expired(request_path):
        return sync_tenant_subscription_state(db, tenant_id, now=now)

    allowed, reason, sub = check_tenant_crm_access(db, tenant_id, now=now)
    if not allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=reason,
        )
    return sub


def calculate_plan_price_for_cycle(
    plan: PlatformSubscriptionPlan,
    billing_cycle: str,
) -> Decimal:
    """Trusted backend price calculation for Monthly vs Annual billing (PART 2 & PART 3)."""
    cycle = (billing_cycle or plan.billing_cycle or "Monthly").strip().title()
    base_price = Decimal(str(plan.price))
    if cycle == "Annual":
        if plan.billing_cycle == "Annual":
            return base_price.quantize(Decimal("0.01"))
        if plan.annual_price is not None and Decimal(str(plan.annual_price)) > Decimal("0.00"):
            return Decimal(str(plan.annual_price)).quantize(Decimal("0.01"))
        return (base_price * Decimal("12")).quantize(Decimal("0.01"))
    else:
        if plan.billing_cycle == "Annual" and base_price > Decimal("0.00"):
            return (base_price / Decimal("12")).quantize(Decimal("0.01"))
        return base_price.quantize(Decimal("0.01"))


def serialize_plan_details(plan: PlatformSubscriptionPlan, industry: str | None = None) -> dict:
    monthly_price = (
        Decimal("0.00")
        if plan.plan_key == "free_trial"
        else calculate_plan_price_for_cycle(plan, "Monthly")
    )
    annual_price = (
        Decimal("0.00")
        if plan.plan_key == "free_trial"
        else calculate_plan_price_for_cycle(plan, "Annual")
    )
    enabled_modules = list(plan.enabled_modules_json or []) or get_industry_enabled_modules(industry)
    return {
        "id": str(plan.id),
        "plan_key": plan.plan_key,
        "name": plan.name,
        "description": plan.description,
        "billing_cycle": plan.billing_cycle,
        "price": str(plan.price),
        "monthly_price": str(monthly_price),
        "annual_price": str(annual_price),
        "currency": plan.currency,
        "global_free_trial_days": FREE_TRIAL_DAYS,
        "max_users": plan.max_users,
        "max_branches": plan.max_branches,
        "storage_limit_gb": plan.storage_limit_gb,
        "enabled_modules": enabled_modules,
        "features": list(plan.features_json or []),
        "limits": dict(plan.limits_json or {}),
        "is_active": plan.is_active,
    }


def get_effective_plan_resources(
    db: Session,
    tenant_id: UUID,
    now: datetime | None = None,
) -> dict:
    """
    PART 11 – Returns the currently enforced resource policy for a tenant:
    - During the 14-day free trial: returns the centralized TRIAL_RESOURCE_POLICY.
    - When Active: returns the purchased plan's configured limits and features.
    - When Expired / Suspended / Cancelled: returns crm_access_allowed=False and zeroed business module access.
    """
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")

    allowed, reason, sub = check_tenant_crm_access(db, tenant_id, now=now)
    active_users_count = (
        db.query(func.count(User.id))
        .filter(User.tenant_id == tenant_id, User.status == "Active")
        .scalar()
        or 0
    )
    storage_used_bytes = (
        db.query(func.coalesce(func.sum(Document.file_size), 0))
        .filter(Document.tenant_id == tenant_id, Document.is_deleted.is_(False))
        .scalar()
        or 0
    )
    leads_count = db.query(func.count(Lead.id)).filter(Lead.tenant_id == tenant_id).scalar() or 0
    contacts_count = db.query(func.count(Contact.id)).filter(Contact.tenant_id == tenant_id).scalar() or 0
    deals_count = db.query(func.count(Deal.id)).filter(Deal.tenant_id == tenant_id).scalar() or 0

    if not allowed:
        return {
            "crm_access_allowed": False,
            "reason": reason,
            "status": sub.status if sub else "Expired",
            "max_users": 0,
            "max_branches": 0,
            "storage_limit_gb": 0,
            "storage_limit_bytes": 0,
            "enabled_modules": [],
            "features": [],
            "limits": {"leads": 0, "contacts": 0, "deals": 0},
            "usage": {
                "active_users": active_users_count,
                "storage_used_bytes": int(storage_used_bytes),
                "leads": leads_count,
                "contacts": contacts_count,
                "deals": deals_count,
            },
        }

    if sub is None or sub.status == "Trial":
        policy = get_trial_resource_policy(tenant.industry)
        return {
            "crm_access_allowed": True,
            "policy_source": "global_free_trial",
            "status": "Trial",
            "trial_days": FREE_TRIAL_DAYS,
            "max_users": policy["max_users"],
            "max_branches": policy["max_branches"],
            "storage_limit_gb": policy["storage_limit_gb"],
            "storage_limit_bytes": policy["storage_limit_bytes"],
            "enabled_modules": policy["enabled_modules"],
            "features": policy["features"],
            "limits": policy["limits"],
            "usage": {
                "active_users": active_users_count,
                "storage_used_bytes": int(storage_used_bytes),
                "leads": leads_count,
                "contacts": contacts_count,
                "deals": deals_count,
            },
        }

    plan = (
        db.query(PlatformSubscriptionPlan)
        .filter(PlatformSubscriptionPlan.id == sub.plan_id)
        .first()
    )
    applied = dict(sub.applied_limits_json or {})
    max_users = applied.get("max_users") or (plan.max_users if plan else 10)
    max_branches = applied.get("max_branches") or (plan.max_branches if plan else 1)
    storage_gb = applied.get("storage_limit_gb") or (plan.storage_limit_gb if plan else 10)
    features = applied.get("features") or (list(plan.features_json or []) if plan else [])
    enabled_modules = (
        applied.get("enabled_modules")
        or (list(plan.enabled_modules_json or []) if plan and plan.enabled_modules_json else None)
        or get_industry_enabled_modules(tenant.industry)
    )
    limits = applied.get("limits") or (dict(plan.limits_json or {}) if plan else {})

    return {
        "crm_access_allowed": True,
        "policy_source": "active_subscription_plan",
        "status": sub.status,
        "plan_key": plan.plan_key if plan else None,
        "plan_name": plan.name if plan else None,
        "max_users": max_users,
        "max_branches": max_branches,
        "storage_limit_gb": storage_gb,
        "storage_limit_bytes": storage_gb * 1024 * 1024 * 1024,
        "enabled_modules": enabled_modules,
        "features": features,
        "limits": limits,
        "usage": {
            "active_users": active_users_count,
            "storage_used_bytes": int(storage_used_bytes),
            "leads": leads_count,
            "contacts": contacts_count,
            "deals": deals_count,
        },
    }


def enforce_plan_user_limit(db: Session, tenant_id: UUID) -> None:
    """Enforce maximum users allowed by the tenant's trial or active subscription plan (PART 11)."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if tenant and tenant.is_platform:
        return
    sub = get_tenant_subscription(db, tenant_id)
    if sub is None and not getattr(tenant, "trial_used", False):
        return
    resources = get_effective_plan_resources(db, tenant_id)
    if not resources["crm_access_allowed"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=resources.get("reason", "Subscription inactive."))
    # Count both Active users and invited/pending users belonging to the tenant
    total_tenant_users = (
        db.query(func.count(User.id))
        .filter(User.tenant_id == tenant_id)
        .scalar()
        or 0
    )
    max_users = resources["max_users"]
    if total_tenant_users >= max_users:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Plan user limit reached: your current plan allows a maximum of {max_users} user(s). Please upgrade your subscription plan.",
        )


def enforce_plan_branch_limit(db: Session, tenant_id: UUID, requested_branches: int = 1) -> None:
    """Enforce maximum branches allowed by the tenant's trial or active subscription plan (PART 11)."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if tenant and tenant.is_platform:
        return
    sub = get_tenant_subscription(db, tenant_id)
    if sub is None and not getattr(tenant, "trial_used", False):
        return
    resources = get_effective_plan_resources(db, tenant_id)
    if not resources["crm_access_allowed"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=resources.get("reason", "Subscription inactive."))
    max_branches = resources["max_branches"]
    if requested_branches > max_branches:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Plan branch limit exceeded: your current plan allows a maximum of {max_branches} branch(es). Please upgrade your subscription plan.",
        )


def enforce_plan_storage_limit(db: Session, tenant_id: UUID, additional_bytes: int = 0) -> None:
    """Enforce storage quota allowed by the tenant's trial or active subscription plan (PART 11)."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if tenant and tenant.is_platform:
        return
    sub = get_tenant_subscription(db, tenant_id)
    if sub is None and not getattr(tenant, "trial_used", False):
        return
    resources = get_effective_plan_resources(db, tenant_id)
    if not resources["crm_access_allowed"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=resources.get("reason", "Subscription inactive."))
    used_bytes = resources["usage"]["storage_used_bytes"]
    extra_tracked = int((sub.usage_json or {}).get("storage_used_bytes", 0)) if sub else 0
    effective_used = max(used_bytes, extra_tracked)
    limit_bytes = resources["storage_limit_bytes"]
    if effective_used + additional_bytes > limit_bytes:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Plan storage limit exceeded: your current plan allows {resources['storage_limit_gb']} GB of storage. Please upgrade your subscription plan.",
        )


def enforce_plan_record_limit(db: Session, tenant_id: UUID, entity_key: str) -> None:
    """Enforce entity record limits (leads, contacts, deals) from plan limits_json (PART 11)."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if tenant and tenant.is_platform:
        return
    sub = get_tenant_subscription(db, tenant_id)
    if sub is None and not getattr(tenant, "trial_used", False):
        return
    resources = get_effective_plan_resources(db, tenant_id)
    if not resources["crm_access_allowed"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail=resources.get("reason", "Subscription inactive."))
    limit = (resources.get("limits") or {}).get(entity_key)
    if limit is not None:
        current = (resources.get("usage") or {}).get(entity_key, 0)
        if current >= int(limit):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Plan limit reached for {entity_key}: maximum of {limit} {entity_key} allowed on your current plan.",
            )


def select_tenant_subscription_plan(
    db: Session,
    tenant_id: UUID,
    user_id: UUID,
    plan_id: UUID | None = None,
    plan_key: str | None = None,
    billing_cycle: str | None = None,
    now: datetime | None = None,
) -> dict:
    """
    PART 2 & PART 3 – Tenant selects a paid subscription plan:
    - Validates plan from database.
    - Stores selected_plan_id on the tenant's subscription WITHOUT terminating an active 14-day free trial.
    - Automatically generates a PlatformBillingInvoice (status='Issued') using trusted database plan prices.
    - Prevents duplicate invoice creation on repeated requests for the same plan and billing cycle.
    """
    ensure_subscription_infrastructure_seeded(db)
    now_utc = ensure_utc(now) or utc_now()

    tenant = (
        db.query(Tenant)
        .filter(Tenant.id == tenant_id, Tenant.is_platform.is_(False))
        .with_for_update()
        .first()
    )
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")

    plan_q = db.query(PlatformSubscriptionPlan)
    if plan_id is not None:
        plan_q = plan_q.filter(PlatformSubscriptionPlan.id == plan_id)
    elif plan_key:
        cleaned_key = plan_key.strip().lower()
        plan_q = plan_q.filter(
            (func.lower(PlatformSubscriptionPlan.plan_key) == cleaned_key)
            | (func.lower(PlatformSubscriptionPlan.name) == cleaned_key)
        )
    else:
        raise HTTPException(status_code=422, detail="Provide either plan_id or plan_key.")

    plan = plan_q.first()
    if not plan:
        raise HTTPException(status_code=404, detail="Selected subscription plan not found.")
    if not plan.is_active:
        raise HTTPException(status_code=409, detail=f"Subscription plan '{plan.name}' is currently inactive.")
    if plan.plan_key == "free_trial" or Decimal(str(plan.price)) <= Decimal("0.00"):
        raise HTTPException(
            status_code=400,
            detail="Free Trial cannot be selected as a paid subscription plan. Please select Starter, Professional, Business, or Enterprise.",
        )

    effective_cycle = (billing_cycle or plan.billing_cycle or "Monthly").strip().title()
    if effective_cycle not in {"Monthly", "Annual"}:
        raise HTTPException(status_code=422, detail="billing_cycle must be 'Monthly' or 'Annual'.")

    sub = sync_tenant_subscription_state(db, tenant.id, now=now_utc)
    if not sub:
        # If tenant had no subscription yet and hasn't used trial, provision trial first
        if not tenant.trial_used:
            sub = provision_tenant_global_free_trial(db, tenant, actor_user_id=user_id, now=now_utc)
        else:
            free_trial_plan = (
                db.query(PlatformSubscriptionPlan)
                .filter(PlatformSubscriptionPlan.plan_key == "free_trial")
                .first()
            )
            sub = PlatformTenantSubscription(
                tenant_id=tenant.id,
                plan_id=free_trial_plan.id if free_trial_plan else plan.id,
                status="Expired",
                billing_cycle=effective_cycle,
                auto_renew=True,
                starts_at=now_utc.replace(tzinfo=None),
                ends_at=now_utc.replace(tzinfo=None),
                expired_at=now_utc,
            )
            db.add(sub)
            db.flush()

    # IMPORTANT (PART 2): Selecting a paid plan during the 14-day free trial must NOT terminate the trial.
    # Store the selected plan as the intended paid plan.
    sub.selected_plan_id = plan.id
    sub.selected_billing_cycle = effective_cycle

    # Check if an open (Issued / Overdue) invoice already exists for this tenant, subscription, plan, and cycle
    existing_open_invoice = (
        db.query(PlatformBillingInvoice)
        .filter(
            PlatformBillingInvoice.tenant_id == tenant.id,
            PlatformBillingInvoice.subscription_id == sub.id,
            PlatformBillingInvoice.plan_id == plan.id,
            PlatformBillingInvoice.billing_cycle == effective_cycle,
            PlatformBillingInvoice.status.in_(["Issued", "Overdue"]),
            PlatformBillingInvoice.invoice_type == "Subscription",
        )
        .order_by(PlatformBillingInvoice.created_at.desc())
        .first()
    )

    if existing_open_invoice:
        db.commit()
        db.refresh(sub)
        db.refresh(existing_open_invoice)
        return {
            "subscription": serialize_subscription(db, sub),
            "invoice": serialize_invoice(db, existing_open_invoice),
            "duplicate_prevented": True,
        }

    # Void any previous superseded unpaid Subscription invoice that has no active payment submissions
    prior_unpaid_invoices = (
        db.query(PlatformBillingInvoice)
        .filter(
            PlatformBillingInvoice.tenant_id == tenant.id,
            PlatformBillingInvoice.subscription_id == sub.id,
            PlatformBillingInvoice.status == "Issued",
            PlatformBillingInvoice.paid_amount == Decimal("0.00"),
            PlatformBillingInvoice.invoice_type == "Subscription",
        )
        .all()
    )
    for old_inv in prior_unpaid_invoices:
        active_payments = (
            db.query(PlatformBillingPayment)
            .filter(
                PlatformBillingPayment.invoice_id == old_inv.id,
                PlatformBillingPayment.status.in_(["Submitted", "Under Review", "Succeeded"]),
            )
            .count()
        )
        if active_payments == 0:
            old_inv.status = "Void"

    base_amount = calculate_plan_price_for_cycle(plan, effective_cycle)
    tax_rate = get_configured_tax_rate_pct(db)
    tax_amount = ((base_amount * tax_rate) / Decimal("100.00")).quantize(Decimal("0.01"))
    total_amount = (base_amount + tax_amount).quantize(Decimal("0.01"))
    issue_dt = now_utc.date()
    due_dt = issue_dt + timedelta(days=DEFAULT_INVOICE_DUE_DAYS)
    period_days = 365 if effective_cycle == "Annual" else 30

    plan_snapshot = {
        "plan_id": str(plan.id),
        "plan_key": plan.plan_key,
        "plan_name": plan.name,
        "description": plan.description,
        "billing_cycle": effective_cycle,
        "base_price": str(base_amount),
        "tax_rate_pct": str(tax_rate),
        "tax_amount": str(tax_amount),
        "total_amount": str(total_amount),
        "currency": plan.currency,
        "max_users": plan.max_users,
        "max_branches": plan.max_branches,
        "storage_limit_gb": plan.storage_limit_gb,
        "features": list(plan.features_json or []),
        "enabled_modules": list(plan.enabled_modules_json or []) or get_industry_enabled_modules(tenant.industry),
        "limits": dict(plan.limits_json or {}),
    }
    payment_instructions = get_configured_payment_instructions(db)

    inv_number = f"PINV-{issue_dt:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"
    invoice = PlatformBillingInvoice(
        invoice_number=inv_number,
        tenant_id=tenant.id,
        subscription_id=sub.id,
        plan_id=plan.id,
        billing_cycle=effective_cycle,
        invoice_type="Subscription",
        billing_period_start=issue_dt,
        billing_period_end=issue_dt + timedelta(days=period_days),
        amount=base_amount,
        tax_amount=tax_amount,
        total_amount=total_amount,
        paid_amount=Decimal("0.00"),
        currency=plan.currency,
        status="Issued",
        issue_date=issue_dt,
        due_date=due_dt,
        notes=f"Subscription invoice for {plan.name} ({effective_cycle} billing cycle)",
        plan_snapshot_json=plan_snapshot,
        payment_instructions_json=payment_instructions,
        created_by=user_id,
    )
    db.add(invoice)
    db.flush()

    record_subscription_event(
        db=db,
        tenant_id=tenant.id,
        subscription_id=sub.id,
        invoice_id=invoice.id,
        actor_user_id=user_id,
        event_type="PLAN_SELECTED",
        previous_status=sub.status,
        new_status=sub.status,
        description=f"Tenant selected paid plan '{plan.name}' ({effective_cycle}) and platform invoice {inv_number} was automatically generated.",
        metadata={
            "selected_plan_id": str(plan.id),
            "selected_plan_key": plan.plan_key,
            "selected_plan_name": plan.name,
            "billing_cycle": effective_cycle,
            "invoice_id": str(invoice.id),
            "invoice_number": inv_number,
            "total_amount": str(total_amount),
        },
    )
    log_audit(
        db=db,
        tenant_id=tenant.id,
        user_id=user_id,
        action="SELECT_SUBSCRIPTION_PLAN",
        module="subscriptions",
        record_id=sub.id,
        description=f"Selected plan '{plan.name}' ({effective_cycle}); generated invoice {inv_number} for {total_amount} {plan.currency}",
        after_data={
            "selected_plan_id": str(plan.id),
            "selected_plan_name": plan.name,
            "billing_cycle": effective_cycle,
            "subscription_status": sub.status,
            "invoice_number": inv_number,
            "invoice_amount": str(total_amount),
        },
    )
    db.commit()
    db.refresh(sub)
    db.refresh(invoice)

    return {
        "subscription": serialize_subscription(db, sub),
        "invoice": serialize_invoice(db, invoice),
        "duplicate_prevented": False,
    }


def submit_manual_payment_details(
    db: Session,
    tenant_id: UUID,
    user_id: UUID,
    invoice_id: UUID,
    transaction_reference: str,
    amount: Decimal,
    payment_method: str = "Bank Transfer",
    currency: str | None = None,
    payment_date: date | None = None,
    payment_proof_url: str | None = None,
    payment_proof_filename: str | None = None,
    notes: str | None = None,
    now: datetime | None = None,
) -> PlatformBillingPayment:
    """
    PART 4 – Tenant submits manual offline payment details for an Issued/Overdue invoice.
    - Payment starts in 'Submitted' status (awaiting Platform Admin verification).
    - Tenant can never mark their own payment as Succeeded or activate their subscription.
    - Validates that the invoice belongs to the tenant and the amount matches the outstanding balance.
    """
    now_utc = ensure_utc(now) or utc_now()
    inv = (
        db.query(PlatformBillingInvoice)
        .filter(PlatformBillingInvoice.id == invoice_id)
        .with_for_update()
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    if str(inv.tenant_id) != str(tenant_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: you cannot access or submit payments for another tenant's invoice.",
        )
    if inv.status in {"Paid", "Void", "Refunded"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot submit payment for an invoice with status '{inv.status}'.",
        )

    cleaned_ref = (transaction_reference or "").strip()
    if len(cleaned_ref) < 2:
        raise HTTPException(status_code=422, detail="A valid transaction_reference is required.")

    existing_ref = (
        db.query(PlatformBillingPayment)
        .filter(func.lower(PlatformBillingPayment.transaction_reference) == cleaned_ref.lower())
        .first()
    )
    if existing_ref:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A payment with this transaction_reference has already been submitted.",
        )

    outstanding = (Decimal(str(inv.total_amount)) - Decimal(str(inv.paid_amount))).quantize(Decimal("0.01"))
    submitted_amount = Decimal(str(amount)).quantize(Decimal("0.01"))
    if submitted_amount <= Decimal("0.00") or submitted_amount != outstanding:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid payment amount ({submitted_amount}). Payment amount must match the outstanding invoice balance ({outstanding} {inv.currency}).",
        )

    if currency and currency.strip().upper() != inv.currency.upper():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payment currency ({currency}) does not match invoice currency ({inv.currency}).",
        )

    payment = PlatformBillingPayment(
        invoice_id=inv.id,
        tenant_id=tenant_id,
        provider="Manual",
        transaction_reference=cleaned_ref,
        amount=submitted_amount,
        currency=inv.currency,
        payment_method=(payment_method or "Bank Transfer").strip(),
        payment_date=payment_date or now_utc.date(),
        payment_proof_url=payment_proof_url,
        payment_proof_filename=payment_proof_filename,
        status="Submitted",
        submitted_by=user_id,
        payment_submitted_at=now_utc,
        admin_notes=notes,
        paid_at=now_utc.replace(tzinfo=None),
    )
    db.add(payment)
    db.flush()

    record_subscription_event(
        db=db,
        tenant_id=tenant_id,
        subscription_id=inv.subscription_id,
        invoice_id=inv.id,
        payment_id=payment.id,
        actor_user_id=user_id,
        event_type="PAYMENT_SUBMITTED",
        previous_status=None,
        new_status="Submitted",
        description=f"Tenant submitted manual payment reference '{cleaned_ref}' for {submitted_amount} {inv.currency} on invoice {inv.invoice_number}.",
        metadata={
            "transaction_reference": cleaned_ref,
            "amount": str(submitted_amount),
            "payment_method": payment.payment_method,
            "payment_proof_url": payment_proof_url,
        },
    )
    log_audit(
        db=db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="SUBMIT_MANUAL_PAYMENT",
        module="subscriptions",
        record_id=payment.id,
        description=f"Submitted manual payment {cleaned_ref} ({submitted_amount} {inv.currency}) for invoice {inv.invoice_number}",
        after_data={
            "invoice_id": str(inv.id),
            "invoice_number": inv.invoice_number,
            "transaction_reference": cleaned_ref,
            "amount": str(submitted_amount),
            "status": "Submitted",
        },
    )
    db.commit()
    db.refresh(payment)
    return payment


def approve_manual_payment_and_activate_subscription(
    db: Session,
    payment_id: UUID,
    admin_user_id: UUID,
    platform_tenant_id: UUID | None = None,
    admin_notes: str | None = None,
    now: datetime | None = None,
) -> dict:
    """
    PART 5 – Transactional Payment Verification, Approval & Automatic Subscription Activation:
    1. Marks payment as Succeeded.
    2. Marks invoice as Paid.
    3. Marks subscription as Active (transitioning existing trial/expired subscription without duplicates).
    4. Sets subscription start date, end date, and renewal date.
    5. Applies selected plan, user limits, branch limits, storage limits, enabled modules, and features.
    6. Stops any trial/post-trial email reminder campaign immediately.
    7. Records payment approval and activation in audit history and subscription event history.
    8. Notifies the tenant by email and in-app notification.
    """
    now_utc = ensure_utc(now) or utc_now()

    payment = (
        db.query(PlatformBillingPayment)
        .filter(PlatformBillingPayment.id == payment_id)
        .with_for_update()
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment submission not found.")

    if payment.status == "Succeeded":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Duplicate payment approval prevented: this payment has already been approved.",
        )
    if payment.status in {"Rejected", "Failed", "Refunded"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Cannot approve a payment with status '{payment.status}'.",
        )

    inv = (
        db.query(PlatformBillingInvoice)
        .filter(PlatformBillingInvoice.id == payment.invoice_id)
        .with_for_update()
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Linked invoice not found.")
    if str(inv.tenant_id) != str(payment.tenant_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Payment tenant_id does not match invoice tenant_id.",
        )
    if inv.status in {"Paid", "Void", "Refunded"}:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invoice {inv.invoice_number} is already '{inv.status}'.",
        )

    tenant = (
        db.query(Tenant)
        .filter(Tenant.id == inv.tenant_id)
        .with_for_update()
        .first()
    )
    if not tenant:
        raise HTTPException(status_code=404, detail="Customer tenant not found.")

    outstanding = (Decimal(str(inv.total_amount)) - Decimal(str(inv.paid_amount))).quantize(Decimal("0.01"))
    pay_amount = Decimal(str(payment.amount)).quantize(Decimal("0.01"))
    if pay_amount <= Decimal("0.00") or pay_amount != outstanding:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Payment amount ({pay_amount}) does not match the outstanding invoice amount ({outstanding}). Subscription cannot be activated without complete payment.",
        )

    prev_payment_status = payment.status
    payment.status = "Succeeded"
    payment.approved_by = admin_user_id
    payment.payment_approved_at = now_utc
    payment.paid_at = now_utc.replace(tzinfo=None)
    if admin_notes:
        payment.admin_notes = admin_notes

    inv.paid_amount = (Decimal(str(inv.paid_amount)) + pay_amount).quantize(Decimal("0.01"))
    inv.status = "Paid"
    inv.paid_at = now_utc.replace(tzinfo=None)

    # Locate subscription to transition
    sub = None
    if inv.subscription_id:
        sub = (
            db.query(PlatformTenantSubscription)
            .filter(
                PlatformTenantSubscription.id == inv.subscription_id,
                PlatformTenantSubscription.tenant_id == tenant.id,
            )
            .with_for_update()
            .first()
        )
    if not sub:
        sub = get_tenant_subscription(db, tenant.id, for_update=True)

    # Cancel any other stray subscriptions for this tenant to prevent duplicate active subscriptions
    other_subs = (
        db.query(PlatformTenantSubscription)
        .filter(
            PlatformTenantSubscription.tenant_id == tenant.id,
            PlatformTenantSubscription.status.in_(["Active", "Trial", "Past Due"]),
        )
        .with_for_update()
        .all()
    )
    for other in other_subs:
        if sub and other.id != sub.id:
            other.status = "Cancelled"
            other.cancelled_at = now_utc.replace(tzinfo=None)
            other.auto_renew = False

    # Resolve target plan
    target_plan_id = inv.plan_id or (sub.selected_plan_id if sub else None) or (sub.plan_id if sub else None)
    target_plan = (
        db.query(PlatformSubscriptionPlan)
        .filter(PlatformSubscriptionPlan.id == target_plan_id)
        .first()
        if target_plan_id
        else None
    )
    if not target_plan or target_plan.plan_key == "free_trial":
        # Fallback to snapshot plan_key or starter
        snap_key = (inv.plan_snapshot_json or {}).get("plan_key")
        if snap_key:
            target_plan = (
                db.query(PlatformSubscriptionPlan)
                .filter(PlatformSubscriptionPlan.plan_key == snap_key)
                .first()
            )
        if not target_plan:
            target_plan = (
                db.query(PlatformSubscriptionPlan)
                .filter(PlatformSubscriptionPlan.plan_key == "starter")
                .first()
            )

    target_cycle = (
        inv.billing_cycle
        or (sub.selected_billing_cycle if sub else None)
        or (sub.billing_cycle if sub else None)
        or (target_plan.billing_cycle if target_plan else "Monthly")
    )
    period_days = 365 if target_cycle == "Annual" else 30

    is_renewal = bool(
        sub
        and (
            inv.invoice_type == "Renewal"
            or (sub.status in {"Active", "Past Due", "Suspended"} and sub.plan_id == target_plan.id and sub.activated_at is not None)
        )
    )

    prev_sub_status = sub.status if sub else None
    if sub is None:
        start_dt = now_utc
        end_dt = now_utc + timedelta(days=period_days)
        sub = PlatformTenantSubscription(
            tenant_id=tenant.id,
            plan_id=target_plan.id,
            selected_plan_id=target_plan.id,
            selected_billing_cycle=target_cycle,
            status="Active",
            billing_cycle=target_cycle,
            auto_renew=True,
            starts_at=start_dt.replace(tzinfo=None),
            ends_at=end_dt.replace(tzinfo=None),
            renewal_date=end_dt.date(),
            activated_at=now_utc,
            activated_by=admin_user_id,
        )
        db.add(sub)
        db.flush()
    else:
        if is_renewal and sub.ends_at and ensure_utc(sub.ends_at) > now_utc:
            base_end = ensure_utc(sub.ends_at)
            start_dt = ensure_utc(sub.starts_at) or now_utc
            end_dt = base_end + timedelta(days=period_days)
        else:
            start_dt = now_utc
            end_dt = now_utc + timedelta(days=period_days)
            sub.starts_at = start_dt.replace(tzinfo=None)

        sub.plan_id = target_plan.id
        sub.selected_plan_id = target_plan.id
        sub.selected_billing_cycle = target_cycle
        sub.billing_cycle = target_cycle
        sub.status = "Active"
        sub.auto_renew = True
        sub.ends_at = end_dt.replace(tzinfo=None)
        sub.renewal_date = end_dt.date()
        sub.activated_at = now_utc
        sub.activated_by = admin_user_id
        sub.grace_period_ends_at = None
        sub.suspended_at = None
        sub.suspension_reason = None
        sub.expired_at = None
        sub.cancelled_at = None

    if inv.subscription_id is None:
        inv.subscription_id = sub.id

    # Apply purchased plan limits & features (PART 5 Req 6-10 & PART 11)
    enabled_modules = (
        list(target_plan.enabled_modules_json or [])
        if target_plan and target_plan.enabled_modules_json
        else get_industry_enabled_modules(tenant.industry)
    )
    applied_limits = {
        "plan_id": str(target_plan.id),
        "plan_key": target_plan.plan_key,
        "plan_name": target_plan.name,
        "billing_cycle": target_cycle,
        "max_users": target_plan.max_users,
        "max_branches": target_plan.max_branches,
        "storage_limit_gb": target_plan.storage_limit_gb,
        "storage_limit_bytes": target_plan.storage_limit_gb * 1024 * 1024 * 1024,
        "features": list(target_plan.features_json or []),
        "enabled_modules": enabled_modules,
        "limits": dict(target_plan.limits_json or {}),
    }
    sub.applied_limits_json = applied_limits

    # Update TenantIndustryConfig and tenant status
    ensure_tenant_industry_config(db, tenant)
    tenant.status = "Active"

    # Stop any active reminder campaign immediately (PART 9 Req 8-9)
    campaign = (
        db.query(PlatformSubscriptionReminderCampaign)
        .filter(PlatformSubscriptionReminderCampaign.tenant_id == tenant.id)
        .first()
    )
    if campaign and campaign.campaign_status not in {"Stopped_Subscribed"}:
        campaign.campaign_status = "Stopped_Subscribed"
        campaign.stopped_at = now_utc
        campaign.stopped_reason = f"Subscription activated on plan '{target_plan.name}' via payment {payment.transaction_reference}"
        campaign.next_retry_at = None
        campaign.last_error = None

    # Record events & audit logs
    record_subscription_event(
        db=db,
        tenant_id=tenant.id,
        subscription_id=sub.id,
        invoice_id=inv.id,
        payment_id=payment.id,
        actor_user_id=admin_user_id,
        event_type="PAYMENT_APPROVED",
        previous_status=prev_payment_status,
        new_status="Succeeded",
        description=f"Platform Admin verified and approved payment {payment.transaction_reference} ({pay_amount} {inv.currency}) for invoice {inv.invoice_number}.",
    )
    event_name = "SUBSCRIPTION_RENEWED" if is_renewal else "SUBSCRIPTION_ACTIVATED"
    record_subscription_event(
        db=db,
        tenant_id=tenant.id,
        subscription_id=sub.id,
        invoice_id=inv.id,
        payment_id=payment.id,
        actor_user_id=admin_user_id,
        event_type=event_name,
        previous_status=prev_sub_status,
        new_status="Active",
        description=f"Subscription {'renewed' if is_renewal else 'activated'} on plan '{target_plan.name}' ({target_cycle}) until {sub.renewal_date}.",
        metadata=applied_limits,
    )

    audit_tenant_id = platform_tenant_id or tenant.id
    log_audit(
        db=db,
        tenant_id=audit_tenant_id,
        user_id=admin_user_id,
        action="APPROVE_PAYMENT_AND_ACTIVATE_SUBSCRIPTION",
        module="platform_billing",
        record_id=payment.id,
        description=f"Approved payment {payment.transaction_reference} for invoice {inv.invoice_number}; activated '{target_plan.name}' subscription for '{tenant.name}'",
        before_data={"payment_status": prev_payment_status, "subscription_status": prev_sub_status},
        after_data={
            "payment_status": "Succeeded",
            "invoice_status": "Paid",
            "subscription_id": str(sub.id),
            "subscription_status": "Active",
            "plan_key": target_plan.plan_key,
            "plan_name": target_plan.name,
            "renewal_date": sub.renewal_date.isoformat() if sub.renewal_date else None,
        },
    )

    # Notify tenant owner(s) in-app and via email (PART 5 Req 12)
    owner_users = (
        db.query(User)
        .filter(User.tenant_id == tenant.id, User.status == "Active")
        .order_by(User.created_at.asc())
        .all()
    )
    for u in owner_users[:3]:
        db.add(
            Notification(
                tenant_id=tenant.id,
                recipient_user_id=u.id,
                title=f"Subscription Activated – {target_plan.name} Plan",
                message=(
                    f"Your payment ({pay_amount} {inv.currency}) for invoice {inv.invoice_number} has been approved. "
                    f"Your {target_plan.name} ({target_cycle}) subscription is now Active until {sub.renewal_date}."
                ),
                notification_type="subscription_activated",
                related_module="subscriptions",
                related_record_id=sub.id,
                is_read=False,
            )
        )

    db.commit()
    db.refresh(payment)
    db.refresh(inv)
    db.refresh(sub)

    recipient_email = tenant.billing_email or (owner_users[0].email if owner_users else None)
    if recipient_email:
        send_subscription_activated_email(
            recipient_email=recipient_email,
            company_name=tenant.name,
            plan_name=target_plan.name,
            billing_cycle=target_cycle,
            invoice_number=inv.invoice_number,
            amount_paid=str(pay_amount),
            currency=inv.currency,
            starts_at=sub.starts_at.date().isoformat() if sub.starts_at else now_utc.date().isoformat(),
            ends_at=sub.renewal_date.isoformat() if sub.renewal_date else "",
        )

    return {
        "message": "Payment approved, invoice marked Paid, and subscription activated.",
        "payment": serialize_payment(db, payment),
        "invoice": serialize_invoice(db, inv),
        "subscription": serialize_subscription(db, sub),
    }


def reject_manual_payment_submission(
    db: Session,
    payment_id: UUID,
    admin_user_id: UUID,
    rejection_reason: str,
    platform_tenant_id: UUID | None = None,
    now: datetime | None = None,
) -> dict:
    """
    PART 4 & PART 12 – Platform Admin rejects a submitted payment with a reason.
    Does NOT mark invoice Paid and does NOT activate subscription.
    """
    now_utc = ensure_utc(now) or utc_now()
    payment = (
        db.query(PlatformBillingPayment)
        .filter(PlatformBillingPayment.id == payment_id)
        .with_for_update()
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment submission not found.")
    if payment.status == "Succeeded":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot reject a payment that has already been approved.",
        )

    reason_clean = (rejection_reason or "").strip()
    if len(reason_clean) < 3:
        raise HTTPException(status_code=422, detail="Provide a rejection_reason of at least 3 characters.")

    prev_status = payment.status
    payment.status = "Rejected"
    payment.rejection_reason = reason_clean
    payment.failure_reason = reason_clean
    payment.approved_by = admin_user_id
    payment.payment_approved_at = now_utc

    inv = db.query(PlatformBillingInvoice).filter(PlatformBillingInvoice.id == payment.invoice_id).first()

    record_subscription_event(
        db=db,
        tenant_id=payment.tenant_id,
        subscription_id=inv.subscription_id if inv else None,
        invoice_id=payment.invoice_id,
        payment_id=payment.id,
        actor_user_id=admin_user_id,
        event_type="PAYMENT_REJECTED",
        previous_status=prev_status,
        new_status="Rejected",
        description=f"Platform Admin rejected payment {payment.transaction_reference}: {reason_clean}",
        metadata={"rejection_reason": reason_clean},
    )
    log_audit(
        db=db,
        tenant_id=platform_tenant_id or payment.tenant_id,
        user_id=admin_user_id,
        action="REJECT_PAYMENT",
        module="platform_billing",
        record_id=payment.id,
        description=f"Rejected payment {payment.transaction_reference}: {reason_clean}",
        before_data={"status": prev_status},
        after_data={"status": "Rejected", "rejection_reason": reason_clean},
    )
    db.commit()
    db.refresh(payment)
    return {
        "message": "Payment submission rejected.",
        "payment": serialize_payment(db, payment),
    }


def generate_upcoming_renewal_invoices(
    db: Session,
    today: date | None = None,
    lead_days: int = RENEWAL_INVOICE_LEAD_DAYS,
) -> dict:
    """
    PART 10 – Generates renewal invoices before renewal_date for Active subscriptions with auto_renew=True.
    Idempotent: never creates duplicate renewal invoices for the same subscription and billing period.
    """
    ref_today = today or utc_now().date()
    horizon = ref_today + timedelta(days=lead_days)

    active_subs = (
        db.query(PlatformTenantSubscription)
        .filter(
            PlatformTenantSubscription.status.in_(["Active", "Past Due"]),
            PlatformTenantSubscription.auto_renew.is_(True),
            PlatformTenantSubscription.is_complimentary.is_(False),
            PlatformTenantSubscription.renewal_date.is_not(None),
            PlatformTenantSubscription.renewal_date <= horizon,
        )
        .all()
    )

    generated = skipped = 0
    invoice_ids: list[str] = []

    for sub in active_subs:
        tenant = db.query(Tenant).filter(Tenant.id == sub.tenant_id, Tenant.is_platform.is_(False)).first()
        if not tenant:
            continue

        target_plan_id = sub.selected_plan_id or sub.plan_id
        plan = db.query(PlatformSubscriptionPlan).filter(PlatformSubscriptionPlan.id == target_plan_id).first()
        if not plan or plan.plan_key == "free_trial":
            skipped += 1
            continue

        cycle = sub.selected_billing_cycle or sub.billing_cycle or plan.billing_cycle or "Monthly"
        period_start = sub.renewal_date
        period_days = 365 if cycle == "Annual" else 30
        period_end = period_start + timedelta(days=period_days)

        existing = (
            db.query(PlatformBillingInvoice)
            .filter(
                PlatformBillingInvoice.tenant_id == tenant.id,
                PlatformBillingInvoice.subscription_id == sub.id,
                PlatformBillingInvoice.invoice_type == "Renewal",
                PlatformBillingInvoice.billing_period_start == period_start,
                PlatformBillingInvoice.status.notin_(["Void"]),
            )
            .first()
        )
        if existing:
            skipped += 1
            continue

        base_amount = calculate_plan_price_for_cycle(plan, cycle)
        tax_rate = get_configured_tax_rate_pct(db)
        tax_amount = ((base_amount * tax_rate) / Decimal("100.00")).quantize(Decimal("0.01"))
        total_amount = (base_amount + tax_amount).quantize(Decimal("0.01"))
        inv_number = f"PINV-REN-{ref_today:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"

        plan_snapshot = {
            "plan_id": str(plan.id),
            "plan_key": plan.plan_key,
            "plan_name": plan.name,
            "billing_cycle": cycle,
            "base_price": str(base_amount),
            "tax_amount": str(tax_amount),
            "total_amount": str(total_amount),
            "currency": plan.currency,
            "max_users": plan.max_users,
            "max_branches": plan.max_branches,
            "storage_limit_gb": plan.storage_limit_gb,
            "features": list(plan.features_json or []),
            "limits": dict(plan.limits_json or {}),
        }

        inv = PlatformBillingInvoice(
            invoice_number=inv_number,
            tenant_id=tenant.id,
            subscription_id=sub.id,
            plan_id=plan.id,
            billing_cycle=cycle,
            invoice_type="Renewal",
            billing_period_start=period_start,
            billing_period_end=period_end,
            amount=base_amount,
            tax_amount=tax_amount,
            total_amount=total_amount,
            paid_amount=Decimal("0.00"),
            currency=plan.currency,
            status="Issued",
            issue_date=ref_today,
            due_date=max(ref_today, period_start),
            notes=f"Renewal invoice for {plan.name} ({cycle}) period {period_start} to {period_end}",
            plan_snapshot_json=plan_snapshot,
            payment_instructions_json=get_configured_payment_instructions(db),
        )
        db.add(inv)
        db.flush()

        record_subscription_event(
            db=db,
            tenant_id=tenant.id,
            subscription_id=sub.id,
            invoice_id=inv.id,
            event_type="RENEWAL_INVOICE_GENERATED",
            previous_status=sub.status,
            new_status=sub.status,
            description=f"Generated {cycle} renewal invoice {inv_number} ({total_amount} {plan.currency}) due on {inv.due_date}.",
        )
        generated += 1
        invoice_ids.append(str(inv.id))

    db.commit()
    return {"generated": generated, "skipped": skipped, "invoice_ids": invoice_ids}


def process_subscription_lifecycle_transitions(
    db: Session,
    reference_time: datetime | None = None,
) -> dict:
    """
    PART 6 & PART 10 – Scheduled job to:
    1. Expire trials that have reached trial_end_date.
    2. Mark past-due Issued platform invoices as Overdue.
    3. Transition Active subscriptions past their renewal date into Past Due (grace period), Suspended, or Expired.
    """
    now_utc = ensure_utc(reference_time) or utc_now()
    ref_today = now_utc.date()

    overdue_invoices_marked = 0
    issued_past_due = (
        db.query(PlatformBillingInvoice)
        .filter(
            PlatformBillingInvoice.status == "Issued",
            PlatformBillingInvoice.due_date < ref_today,
            PlatformBillingInvoice.paid_amount < PlatformBillingInvoice.total_amount,
        )
        .all()
    )
    for inv in issued_past_due:
        inv.status = "Overdue"
        overdue_invoices_marked += 1
    if overdue_invoices_marked:
        db.commit()

    subs = (
        db.query(PlatformTenantSubscription)
        .filter(PlatformTenantSubscription.status.in_(["Trial", "Active", "Past Due"]))
        .all()
    )

    trials_expired = past_due_count = suspended_count = expired_count = 0
    for sub in subs:
        before = sub.status
        updated = sync_tenant_subscription_state(db, sub.tenant_id, now=now_utc)
        if updated and updated.status != before:
            if before == "Trial" and updated.status == "Expired":
                trials_expired += 1
            elif updated.status == "Past Due":
                past_due_count += 1
            elif updated.status == "Suspended":
                suspended_count += 1
            elif updated.status == "Expired":
                expired_count += 1

    return {
        "trials_expired": trials_expired,
        "subscriptions_past_due": past_due_count,
        "subscriptions_suspended": suspended_count,
        "subscriptions_expired": expired_count,
        "overdue_invoices_marked": overdue_invoices_marked,
    }


def _resolve_tenant_recipient_email(db: Session, tenant: Tenant) -> str | None:
    if tenant.billing_email and "@" in tenant.billing_email:
        return tenant.billing_email.strip()
    owner = (
        db.query(User)
        .filter(User.tenant_id == tenant.id, User.status == "Active")
        .order_by(User.created_at.asc())
        .first()
    )
    return owner.email if owner else None


def process_trial_and_post_trial_reminders(
    db: Session,
    reference_time: datetime | None = None,
    force_retry: bool = False,
) -> dict:
    """
    PART 8 & PART 9 – Automated Pre-Expiration Trial Reminder Emails & Post-Trial 30-Day Email Reminder Campaign:
    - Pre-expiration reminders:
      * Trial Day 12 (2 days before expiration): "Your free trial ends in 2 days"
      * Trial Day 13 (1 day before expiration): "Your free trial ends tomorrow"
      * Trial Day 14 (0 days before expiration / ends today): "Your free trial ends today"
    - Post-trial 30-day campaign (only when trial has expired and subscription is not Active):
      * Day 1 after expiration: "Your free trial has expired"
      * Day 3 after expiration: "Your CRM access is restricted – subscribe to continue"
      * Day 7 after expiration: "Discover the benefits of a SCuilONE subscription"
      * Day 14 after expiration: "Restore your CRM access by selecting a plan"
      * Day 21 after expiration: "Your SCuilONE account is waiting for you"
      * Day 30 after expiration: "Final reminder to activate your subscription"
    - Never sends duplicate emails; handles failures with safe backoff retries; respects opt-out preferences;
      and immediately stops when subscription becomes Active.
    """
    now_utc = ensure_utc(reference_time) or utc_now()
    ref_date = now_utc.date()

    # First sync subscription states so newly expired trials are transitioned
    process_subscription_lifecycle_transitions(db, reference_time=now_utc)

    subs = (
        db.query(PlatformTenantSubscription, Tenant)
        .join(Tenant, Tenant.id == PlatformTenantSubscription.tenant_id)
        .filter(Tenant.is_platform.is_(False))
        .all()
    )

    sent_count = skipped_count = failed_count = stopped_count = 0
    sent_keys: list[str] = []

    payment_instructions = get_configured_payment_instructions(db)

    for sub, tenant in subs:
        campaign = (
            db.query(PlatformSubscriptionReminderCampaign)
            .filter(PlatformSubscriptionReminderCampaign.tenant_id == tenant.id)
            .first()
        )
        if not campaign:
            campaign = PlatformSubscriptionReminderCampaign(
                tenant_id=tenant.id,
                subscription_id=sub.id,
                campaign_status="Stopped_Subscribed" if sub.status == "Active" else (
                    "Trial_Active" if sub.status == "Trial" else "Post_Trial_Active"
                ),
                trial_end_date=ensure_utc(sub.trial_end_date) or ensure_utc(sub.ends_at),
            )
            db.add(campaign)
            db.flush()

        # Rule 8 & 9: Stop immediately if tenant has subscribed (Active)
        if sub.status == "Active":
            if campaign.campaign_status != "Stopped_Subscribed":
                campaign.campaign_status = "Stopped_Subscribed"
                campaign.stopped_at = now_utc
                campaign.stopped_reason = "Subscription is Active"
                campaign.next_retry_at = None
                stopped_count += 1
                db.commit()
            else:
                skipped_count += 1
            continue

        # Rule 7: Respect tenant email preferences / unsubscribe
        if getattr(tenant, "email_reminders_opt_out", False) or campaign.campaign_status == "Unsubscribed":
            if campaign.campaign_status != "Unsubscribed":
                campaign.campaign_status = "Unsubscribed"
                campaign.stopped_at = now_utc
                campaign.stopped_reason = "Tenant opted out of reminder emails"
                db.commit()
            skipped_count += 1
            continue

        if campaign.campaign_status in {"Completed", "Cancelled"}:
            skipped_count += 1
            continue

        # If a previous attempt failed and is waiting for backoff window, wait unless force_retry or window reached
        if (
            not force_retry
            and campaign.next_retry_at is not None
            and ensure_utc(campaign.next_retry_at) > now_utc
        ):
            skipped_count += 1
            continue

        trial_start = ensure_utc(sub.trial_start_date) or ensure_utc(sub.starts_at)
        trial_end = ensure_utc(sub.trial_end_date) or ensure_utc(campaign.trial_end_date) or ensure_utc(sub.ends_at)
        if not trial_end:
            skipped_count += 1
            continue

        trial_end_date = trial_end.date()
        trial_start_date = trial_start.date() if trial_start else (trial_end_date - timedelta(days=FREE_TRIAL_DAYS))

        target_spec = None

        if sub.status == "Trial" and ref_date <= trial_end_date:
            # Determine trial day (1..14) where trial_end_date corresponds to Day 14 (0 days remaining)
            days_until_expiry = (trial_end_date - ref_date).days
            trial_day = FREE_TRIAL_DAYS - days_until_expiry
            if trial_day in TRIAL_REMINDER_SCHEDULE:
                target_spec = TRIAL_REMINDER_SCHEDULE[trial_day]
        elif sub.status == "Expired" and ref_date > trial_end_date:
            if campaign.campaign_status == "Trial_Active":
                campaign.campaign_status = "Post_Trial_Active"
            days_after_expiry = (ref_date - trial_end_date).days
            if days_after_expiry in POST_TRIAL_REMINDER_SCHEDULE:
                target_spec = POST_TRIAL_REMINDER_SCHEDULE[days_after_expiry]

        if not target_spec:
            skipped_count += 1
            continue

        reminder_key = target_spec["reminder_key"]
        col_name = target_spec["column"]

        # Check if already sent via campaign column or reminder log
        already_sent_ts = getattr(campaign, col_name, None)
        existing_log = (
            db.query(PlatformSubscriptionReminderLog)
            .filter(
                PlatformSubscriptionReminderLog.subscription_id == sub.id,
                PlatformSubscriptionReminderLog.reminder_key == reminder_key,
            )
            .first()
        )
        if already_sent_ts is not None or (existing_log and existing_log.status == "Sent"):
            if already_sent_ts is None and existing_log and existing_log.sent_at:
                setattr(campaign, col_name, existing_log.sent_at)
                db.commit()
            skipped_count += 1
            continue

        recipient_email = _resolve_tenant_recipient_email(db, tenant)
        if not recipient_email:
            skipped_count += 1
            continue

        selected_plan_name = None
        if sub.selected_plan_id:
            sel_plan = (
                db.query(PlatformSubscriptionPlan)
                .filter(PlatformSubscriptionPlan.id == sub.selected_plan_id)
                .first()
            )
            if sel_plan:
                selected_plan_name = sel_plan.name

        if not tenant.unsubscribe_token:
            tenant.unsubscribe_token = secrets.token_urlsafe(24)

        try:
            send_trial_or_post_trial_reminder_email(
                recipient_email=recipient_email,
                company_name=tenant.name,
                reminder_key=reminder_key,
                subject=target_spec["subject"],
                headline=target_spec["headline"],
                trial_expiration_date=trial_end_date.isoformat(),
                selected_plan_name=selected_plan_name,
                unsubscribe_token=tenant.unsubscribe_token,
                payment_instructions=payment_instructions,
            )
        except Exception as exc:
            failed_count += 1
            campaign.retry_count = (campaign.retry_count or 0) + 1
            campaign.last_error = f"{type(exc).__name__}: {exc}"
            backoff_minutes = min(240, 15 * (2 ** min(campaign.retry_count, 4)))
            campaign.next_retry_at = now_utc + timedelta(minutes=backoff_minutes)

            if existing_log:
                existing_log.status = "Failed"
                existing_log.attempt_count = (existing_log.attempt_count or 1) + 1
                existing_log.error_message = campaign.last_error
            else:
                db.add(
                    PlatformSubscriptionReminderLog(
                        tenant_id=tenant.id,
                        subscription_id=sub.id,
                        campaign_id=campaign.id,
                        reminder_key=reminder_key,
                        subject=target_spec["subject"],
                        recipient_email=recipient_email,
                        status="Failed",
                        attempt_count=1,
                        error_message=campaign.last_error,
                    )
                )
            db.commit()
            logger.warning("Failed sending reminder %s to %s: %s", reminder_key, recipient_email, exc)
            continue

        # Success: record sent timestamp and log
        setattr(campaign, col_name, now_utc)
        campaign.last_error = None
        campaign.retry_count = 0
        campaign.next_retry_at = None
        if reminder_key == "post_trial_day_30":
            campaign.campaign_status = "Completed"
            campaign.stopped_at = now_utc
            campaign.stopped_reason = "Completed 30-day post-trial campaign"

        if existing_log:
            existing_log.status = "Sent"
            existing_log.attempt_count = (existing_log.attempt_count or 1) + 1
            existing_log.error_message = None
            existing_log.sent_at = now_utc
        else:
            db.add(
                PlatformSubscriptionReminderLog(
                    tenant_id=tenant.id,
                    subscription_id=sub.id,
                    campaign_id=campaign.id,
                    reminder_key=reminder_key,
                    subject=target_spec["subject"],
                    recipient_email=recipient_email,
                    status="Sent",
                    attempt_count=1,
                    sent_at=now_utc,
                )
            )

        record_subscription_event(
            db=db,
            tenant_id=tenant.id,
            subscription_id=sub.id,
            event_type="REMINDER_EMAIL_SENT",
            previous_status=sub.status,
            new_status=sub.status,
            description=f"Sent reminder email '{target_spec['subject']}' ({reminder_key}) to {recipient_email}.",
            metadata={"reminder_key": reminder_key, "subject": target_spec["subject"], "recipient": recipient_email},
        )
        db.commit()
        sent_count += 1
        sent_keys.append(reminder_key)

    return {
        "sent": sent_count,
        "failed": failed_count,
        "skipped": skipped_count,
        "stopped": stopped_count,
        "sent_keys": sent_keys,
    }


def serialize_subscription(db: Session, sub: PlatformTenantSubscription) -> dict:
    tenant = db.query(Tenant).filter(Tenant.id == sub.tenant_id).first()
    current_plan = (
        db.query(PlatformSubscriptionPlan)
        .filter(PlatformSubscriptionPlan.id == sub.plan_id)
        .first()
    )
    selected_plan = (
        db.query(PlatformSubscriptionPlan)
        .filter(PlatformSubscriptionPlan.id == sub.selected_plan_id)
        .first()
        if sub.selected_plan_id
        else None
    )
    now_utc = utc_now()
    trial_end = ensure_utc(sub.trial_end_date)
    trial_start = ensure_utc(sub.trial_start_date)
    is_in_trial = bool(sub.status == "Trial" and trial_end and now_utc < trial_end)
    trial_days_remaining = (
        max(0, (trial_end.date() - now_utc.date()).days)
        if trial_end and is_in_trial
        else 0
    )
    crm_allowed, access_reason, _ = check_tenant_crm_access(db, sub.tenant_id, now=now_utc)
    resources = get_effective_plan_resources(db, sub.tenant_id, now=now_utc)

    return {
        "subscription_id": str(sub.id),
        "tenant_id": str(sub.tenant_id),
        "company_name": tenant.name if tenant else None,
        "industry": tenant.industry if tenant else None,
        "status": sub.status,
        "billing_cycle": sub.billing_cycle,
        "selected_billing_cycle": sub.selected_billing_cycle,
        "auto_renew": sub.auto_renew,
        "is_complimentary": sub.is_complimentary,
        "is_in_trial": is_in_trial,
        "trial_days": FREE_TRIAL_DAYS,
        "trial_days_remaining": trial_days_remaining,
        "trial_start_date": trial_start.isoformat() if trial_start else None,
        "trial_end_date": trial_end.isoformat() if trial_end else None,
        "starts_at": sub.starts_at.isoformat() if sub.starts_at else None,
        "ends_at": sub.ends_at.isoformat() if sub.ends_at else None,
        "renewal_date": sub.renewal_date.isoformat() if sub.renewal_date else None,
        "grace_period_ends_at": ensure_utc(sub.grace_period_ends_at).isoformat() if sub.grace_period_ends_at else None,
        "suspended_at": ensure_utc(sub.suspended_at).isoformat() if sub.suspended_at else None,
        "suspension_reason": sub.suspension_reason,
        "expired_at": ensure_utc(sub.expired_at).isoformat() if sub.expired_at else None,
        "cancelled_at": sub.cancelled_at.isoformat() if sub.cancelled_at else None,
        "activated_at": ensure_utc(sub.activated_at).isoformat() if sub.activated_at else None,
        "crm_access_allowed": crm_allowed,
        "access_message": access_reason,
        "current_plan": serialize_plan_details(current_plan, tenant.industry if tenant else None) if current_plan else None,
        "selected_plan": serialize_plan_details(selected_plan, tenant.industry if tenant else None) if selected_plan else None,
        "resources": resources,
    }


def serialize_invoice(db: Session, inv: PlatformBillingInvoice) -> dict:
    tenant = db.query(Tenant).filter(Tenant.id == inv.tenant_id).first()
    plan = (
        db.query(PlatformSubscriptionPlan).filter(PlatformSubscriptionPlan.id == inv.plan_id).first()
        if inv.plan_id
        else None
    )
    balance_due = max(Decimal("0.00"), Decimal(str(inv.total_amount)) - Decimal(str(inv.paid_amount))).quantize(Decimal("0.01"))
    return {
        "id": str(inv.id),
        "invoice_number": inv.invoice_number,
        "tenant_id": str(inv.tenant_id),
        "company_name": tenant.name if tenant else None,
        "subscription_id": str(inv.subscription_id) if inv.subscription_id else None,
        "plan_id": str(inv.plan_id) if inv.plan_id else None,
        "plan_name": plan.name if plan else (inv.plan_snapshot_json or {}).get("plan_name"),
        "billing_cycle": inv.billing_cycle,
        "invoice_type": inv.invoice_type,
        "billing_period_start": inv.billing_period_start.isoformat() if inv.billing_period_start else None,
        "billing_period_end": inv.billing_period_end.isoformat() if inv.billing_period_end else None,
        "amount": str(Decimal(str(inv.amount)).quantize(Decimal("0.01"))),
        "tax_amount": str(Decimal(str(inv.tax_amount)).quantize(Decimal("0.01"))),
        "total_amount": str(Decimal(str(inv.total_amount)).quantize(Decimal("0.01"))),
        "paid_amount": str(Decimal(str(inv.paid_amount)).quantize(Decimal("0.01"))),
        "balance_due": str(balance_due),
        "currency": inv.currency,
        "status": inv.status,
        "issue_date": inv.issue_date.isoformat() if inv.issue_date else None,
        "due_date": inv.due_date.isoformat() if inv.due_date else None,
        "paid_at": inv.paid_at.isoformat() if inv.paid_at else None,
        "notes": inv.notes,
        "plan_snapshot": inv.plan_snapshot_json or {},
        "payment_instructions": inv.payment_instructions_json or get_configured_payment_instructions(db),
        "created_at": inv.created_at.isoformat() if inv.created_at else None,
    }


def serialize_payment(db: Session, p: PlatformBillingPayment) -> dict:
    tenant = db.query(Tenant).filter(Tenant.id == p.tenant_id).first()
    inv = db.query(PlatformBillingInvoice).filter(PlatformBillingInvoice.id == p.invoice_id).first()
    reviewer = db.query(User).filter(User.id == p.approved_by).first() if p.approved_by else None
    submitter = db.query(User).filter(User.id == p.submitted_by).first() if p.submitted_by else None
    return {
        "id": str(p.id),
        "payment_id": str(p.id),
        "invoice_id": str(p.invoice_id),
        "invoice_number": inv.invoice_number if inv else None,
        "tenant_id": str(p.tenant_id),
        "company_name": tenant.name if tenant else None,
        "provider": p.provider,
        "transaction_reference": p.transaction_reference,
        "amount": str(Decimal(str(p.amount)).quantize(Decimal("0.01"))),
        "currency": p.currency,
        "payment_method": p.payment_method,
        "payment_date": p.payment_date.isoformat() if p.payment_date else (p.paid_at.date().isoformat() if p.paid_at else None),
        "payment_proof_url": p.payment_proof_url,
        "payment_proof_filename": p.payment_proof_filename,
        "status": p.status,
        "submitted_by": str(p.submitted_by) if p.submitted_by else None,
        "submitted_by_name": submitter.full_name if submitter else None,
        "payment_submitted_at": ensure_utc(p.payment_submitted_at).isoformat() if p.payment_submitted_at else None,
        "approved_by": str(p.approved_by) if p.approved_by else None,
        "admin_reviewer_name": reviewer.full_name if reviewer else None,
        "payment_approved_at": ensure_utc(p.payment_approved_at).isoformat() if p.payment_approved_at else None,
        "rejection_reason": p.rejection_reason,
        "failure_reason": p.failure_reason,
        "admin_notes": p.admin_notes,
        "reconciled": p.reconciled,
        "paid_at": p.paid_at.isoformat() if p.paid_at else None,
        "created_at": p.created_at.isoformat() if p.created_at else None,
    }


def serialize_reminder_campaign(db: Session, camp: PlatformSubscriptionReminderCampaign) -> dict:
    tenant = db.query(Tenant).filter(Tenant.id == camp.tenant_id).first()
    sub = (
        db.query(PlatformTenantSubscription).filter(PlatformTenantSubscription.id == camp.subscription_id).first()
        if camp.subscription_id
        else get_tenant_subscription(db, camp.tenant_id)
    )
    logs = (
        db.query(PlatformSubscriptionReminderLog)
        .filter(PlatformSubscriptionReminderLog.tenant_id == camp.tenant_id)
        .order_by(PlatformSubscriptionReminderLog.created_at.asc())
        .all()
    )
    return {
        "id": str(camp.id),
        "tenant_id": str(camp.tenant_id),
        "company_name": tenant.name if tenant else None,
        "subscription_id": str(camp.subscription_id) if camp.subscription_id else None,
        "subscription_status": sub.status if sub else None,
        "campaign_status": camp.campaign_status,
        "email_reminders_opt_out": bool(tenant.email_reminders_opt_out) if tenant else False,
        "trial_end_date": ensure_utc(camp.trial_end_date).isoformat() if camp.trial_end_date else None,
        "trial_reminders": {
            "trial_day_12_sent_at": ensure_utc(camp.trial_day_12_sent_at).isoformat() if camp.trial_day_12_sent_at else None,
            "trial_day_13_sent_at": ensure_utc(camp.trial_day_13_sent_at).isoformat() if camp.trial_day_13_sent_at else None,
            "trial_day_14_sent_at": ensure_utc(camp.trial_day_14_sent_at).isoformat() if camp.trial_day_14_sent_at else None,
        },
        "post_trial_30_day_campaign": {
            "day_1_sent_at": ensure_utc(camp.post_trial_day_1_sent_at).isoformat() if camp.post_trial_day_1_sent_at else None,
            "day_3_sent_at": ensure_utc(camp.post_trial_day_3_sent_at).isoformat() if camp.post_trial_day_3_sent_at else None,
            "day_7_sent_at": ensure_utc(camp.post_trial_day_7_sent_at).isoformat() if camp.post_trial_day_7_sent_at else None,
            "day_14_sent_at": ensure_utc(camp.post_trial_day_14_sent_at).isoformat() if camp.post_trial_day_14_sent_at else None,
            "day_21_sent_at": ensure_utc(camp.post_trial_day_21_sent_at).isoformat() if camp.post_trial_day_21_sent_at else None,
            "day_30_sent_at": ensure_utc(camp.post_trial_day_30_sent_at).isoformat() if camp.post_trial_day_30_sent_at else None,
        },
        "retry_count": camp.retry_count,
        "last_error": camp.last_error,
        "next_retry_at": ensure_utc(camp.next_retry_at).isoformat() if camp.next_retry_at else None,
        "stopped_at": ensure_utc(camp.stopped_at).isoformat() if camp.stopped_at else None,
        "stopped_reason": camp.stopped_reason,
        "delivery_logs": [
            {
                "id": str(lg.id),
                "reminder_key": lg.reminder_key,
                "subject": lg.subject,
                "recipient_email": lg.recipient_email,
                "status": lg.status,
                "attempt_count": lg.attempt_count,
                "error_message": lg.error_message,
                "sent_at": ensure_utc(lg.sent_at).isoformat() if lg.sent_at else None,
            }
            for lg in logs
        ],
    }
