from decimal import Decimal
import os
from sqlalchemy.orm import Session

from app.core.platform_rbac import (
    ALL_PLATFORM_ROLE_NAMES,
    PLATFORM_INDUSTRIES,
    PLATFORM_PERMISSIONS,
    PLATFORM_ROLE_PERMISSIONS,
    PLATFORM_TENANT_NAME,
)
from app.core.security import hash_password
from app.database.connection import SessionLocal
from app.models.permission import Permission
from app.models.platform import (
    PlatformEmployee,
    PlatformIndustryTeam,
    PlatformKnowledgeArticle,
    PlatformSetting,
    PlatformSubscriptionPlan,
)
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_role import UserRole


DEFAULT_PLANS = [
    {
        "plan_key": "free_trial",
        "name": "Free/Trial",
        "description": "Limited users, records, modules and retention for initial evaluation",
        "billing_cycle": "Monthly",
        "price": Decimal("0.00"),
        "currency": "INR",
        "trial_days": 14,
        "max_users": 3,
        "max_branches": 1,
        "storage_limit_gb": 2,
        "features_json": ["core_crm", "basic_dashboard"],
        "limits_json": {"leads": 500, "contacts": 500, "deals": 100},
    },
    {
        "plan_key": "starter",
        "name": "Starter",
        "description": "Core CRM + selected industry pack",
        "billing_cycle": "Monthly",
        "price": Decimal("4999.00"),
        "currency": "INR",
        "trial_days": 14,
        "max_users": 10,
        "max_branches": 1,
        "storage_limit_gb": 10,
        "features_json": ["core_crm", "industry_pack", "pipelines", "custom_fields"],
        "limits_json": {"leads": 5000, "contacts": 5000, "deals": 1000},
    },
    {
        "plan_key": "professional",
        "name": "Professional",
        "description": "Automation, integrations, reports and larger limits",
        "billing_cycle": "Monthly",
        "price": Decimal("12999.00"),
        "currency": "INR",
        "trial_days": 14,
        "max_users": 25,
        "max_branches": 3,
        "storage_limit_gb": 50,
        "features_json": ["core_crm", "industry_pack", "workflows", "integrations", "reports"],
        "limits_json": {"leads": 25000, "contacts": 25000, "deals": 5000},
    },
    {
        "plan_key": "business",
        "name": "Business",
        "description": "Advanced workflows, multiple branches, higher limits",
        "billing_cycle": "Monthly",
        "price": Decimal("24999.00"),
        "currency": "INR",
        "trial_days": 14,
        "max_users": 100,
        "max_branches": 10,
        "storage_limit_gb": 200,
        "features_json": [
            "core_crm",
            "industry_pack",
            "advanced_workflows",
            "multi_branch",
            "reports",
            "customer_portal",
        ],
        "limits_json": {"leads": 100000, "contacts": 100000, "deals": 25000},
    },
    {
        "plan_key": "enterprise",
        "name": "Enterprise",
        "description": "SSO, advanced security, dedicated infrastructure option, SLA and custom integrations",
        "billing_cycle": "Annual",
        "price": Decimal("99999.00"),
        "currency": "INR",
        "trial_days": 30,
        "max_users": 1000,
        "max_branches": 100,
        "storage_limit_gb": 1000,
        "features_json": [
            "core_crm",
            "industry_pack",
            "advanced_workflows",
            "multi_branch",
            "sso",
            "dedicated_sla",
            "custom_integrations",
        ],
        "limits_json": {"leads": 1000000, "contacts": 1000000, "deals": 250000},
    },
]

DEFAULT_SETTINGS = [
    {
        "setting_key": "platform.general",
        "category": "General",
        "value_json": {
            "platform_name": "SCuilONE",
            "company_name": "StaunchCuil Services Private Limited",
            "default_timezone": "Asia/Kolkata",
            "default_currency": "INR",
            "support_email": "support@scuilone.com",
        },
        "description": "Global platform identity and regional defaults",
    },
    {
        "setting_key": "platform.security_policy",
        "category": "Security",
        "value_json": {
            "min_password_length": 15,
            "mfa_required_for_platform_roles": True,
            "force_password_change_on_first_login": True,
            "max_failed_login_attempts": 5,
            "session_timeout_minutes": 60,
        },
        "description": "Platform-wide security and authentication policies",
    },
    {
        "setting_key": "platform.ticket_routing",
        "category": "Support",
        "value_json": {
            "route_by_industry_first": True,
            "route_by_issue_type_second": True,
            "default_sla_response_minutes": 60,
            "default_sla_resolution_hours": 24,
            "auto_assign_least_loaded": True,
        },
        "description": "Support ticket routing and SLA policies across 10 industry teams",
    },
]

DEFAULT_KB_ARTICLES = [
    {
        "slug": "real-estate-booking-payment-troubleshooting",
        "title": "Real Estate Booking & Payment Plan Troubleshooting Guide",
        "category": "Troubleshooting",
        "industry_key": "real_estate",
        "content": "Step-by-step guide for resolving property booking locks, payment verification, and seller installment plans.",
        "tags_json": ["real_estate", "bookings", "payments"],
    },
    {
        "slug": "software-contract-milestone-invoicing",
        "title": "IT & Software Contract Milestone & GST Invoicing FAQ",
        "category": "FAQ",
        "industry_key": "software",
        "content": "How sequential vs parallel milestone billing works and how credit notes or payment reversals restore milestone state.",
        "tags_json": ["software", "contracts", "invoices", "milestones"],
    },
    {
        "slug": "platform-ticket-escalation-sop",
        "title": "Platform Support Ticket Escalation SOP",
        "category": "Procedure",
        "industry_key": None,
        "content": "Standard operating procedure for escalating complex tickets from Industry Support to Team Manager, Technical, or Billing.",
        "tags_json": ["support", "escalation", "sla"],
    },
]


def seed_platform_data(
    db: Session,
    super_admin_email: str | None = None,
    super_admin_password: str | None = None,
    super_admin_name: str = "SCuilONE Super Admin",
    backfill_missing: bool = False,
) -> dict:
    # 1. Ensure Platform Tenant exists
    platform_tenant = (
        db.query(Tenant)
        .filter((Tenant.is_platform.is_(True)) | (Tenant.name == PLATFORM_TENANT_NAME))
        .first()
    )
    if not platform_tenant:
        platform_tenant = Tenant(
            name=PLATFORM_TENANT_NAME,
            industry="Platform Operations",
            status="Active",
            is_platform=True,
        )
        db.add(platform_tenant)
        db.flush()
    else:
        platform_tenant.is_platform = True
        platform_tenant.status = "Active"

    # 2. Seed all 11 Platform Roles + 7 Reusable Industry Roles
    role_map: dict[str, Role] = {}
    for role_name in sorted(ALL_PLATFORM_ROLE_NAMES):
        role_obj = db.query(Role).filter(Role.name == role_name).first()
        if not role_obj:
            role_obj = Role(name=role_name)
            db.add(role_obj)
            db.flush()
        role_map[role_name] = role_obj

    # 3. Seed all Platform Permissions
    perm_map: dict[str, Permission] = {}
    for perm_name, perm_desc in PLATFORM_PERMISSIONS:
        perm_obj = db.query(Permission).filter(Permission.name == perm_name).first()
        if not perm_obj:
            perm_obj = Permission(name=perm_name, description=perm_desc)
            db.add(perm_obj)
            db.flush()
        perm_map[perm_name] = perm_obj

    # 4. Seed Role -> Permission mappings.
    # The database is the source of truth once a role has platform permissions, so a role
    # that already has some is skipped (otherwise a re-run would re-grant anything an admin
    # revoked). Pass backfill_missing=True to deliberately add newly introduced defaults.
    platform_perm_ids = {p.id for p in perm_map.values()}
    for role_name, perm_names in PLATFORM_ROLE_PERMISSIONS.items():
        role_obj = role_map.get(role_name)
        if not role_obj:
            continue
        existing_perm_ids = {
            rp.permission_id
            for rp in db.query(RolePermission).filter(RolePermission.role_id == role_obj.id).all()
        }
        if (existing_perm_ids & platform_perm_ids) and not backfill_missing:
            continue
        for p_name in perm_names:
            perm_obj = perm_map.get(p_name)
            if perm_obj and perm_obj.id not in existing_perm_ids:
                db.add(RolePermission(role_id=role_obj.id, permission_id=perm_obj.id))

    # 5. Seed the 10 Industry Teams
    for ind in PLATFORM_INDUSTRIES:
        team = (
            db.query(PlatformIndustryTeam)
            .filter(PlatformIndustryTeam.industry_key == ind["industry_key"])
            .first()
        )
        if not team:
            team = PlatformIndustryTeam(
                industry_key=ind["industry_key"],
                name=f"{ind['name']} Industry Team",
                description=ind["description"],
                is_active=True,
                max_members=7,
                sla_response_minutes=60,
                sla_resolution_hours=24,
                allocated_budget=Decimal("500000.00"),
                spent_budget=Decimal("0.00"),
                config_json={
                    "industry_label": ind["name"],
                    "reusable_roles": [
                        "Team Admin",
                        "Team Manager",
                        "Industry Support",
                        "Team Auditor",
                        "Team Finance",
                        "Team Analyst",
                        "Industry Sales",
                    ],
                },
            )
            db.add(team)

    # 6. Seed Default Subscription Plans
    for plan_data in DEFAULT_PLANS:
        existing_plan = (
            db.query(PlatformSubscriptionPlan)
            .filter(PlatformSubscriptionPlan.plan_key == plan_data["plan_key"])
            .first()
        )
        if not existing_plan:
            db.add(PlatformSubscriptionPlan(**plan_data))

    # 7. Seed Default Platform Settings
    for s_data in DEFAULT_SETTINGS:
        existing_setting = (
            db.query(PlatformSetting)
            .filter(PlatformSetting.setting_key == s_data["setting_key"])
            .first()
        )
        if not existing_setting:
            db.add(PlatformSetting(**s_data))

    # 8. Seed Default Knowledge Base Articles
    for kb in DEFAULT_KB_ARTICLES:
        existing_kb = (
            db.query(PlatformKnowledgeArticle)
            .filter(PlatformKnowledgeArticle.slug == kb["slug"])
            .first()
        )
        if not existing_kb:
            db.add(PlatformKnowledgeArticle(**kb))

    db.flush()

    # 9. Optionally seed initial Platform Super Admin user if provided or via env
    admin_email = (super_admin_email or os.environ.get("PLATFORM_SUPER_ADMIN_EMAIL") or "").strip().lower()
    admin_password = super_admin_password or os.environ.get("PLATFORM_SUPER_ADMIN_PASSWORD")
    super_admin_user = None

    if admin_email and admin_password:
        super_admin_user = db.query(User).filter(User.email == admin_email).first()
        super_role = role_map["Platform Super Admin"]
        if not super_admin_user:
            super_admin_user = User(
                tenant_id=platform_tenant.id,
                full_name=super_admin_name,
                email=admin_email,
                password=hash_password(admin_password),
                status="Active",
                must_change_password=False,
                profile_completed=True,
                job_title="Platform Super Admin",
            )
            db.add(super_admin_user)
            db.flush()

        if not db.query(UserRole).filter(UserRole.user_id == super_admin_user.id).first():
            db.add(UserRole(user_id=super_admin_user.id, role_id=super_role.id))

        emp = db.query(PlatformEmployee).filter(PlatformEmployee.user_id == super_admin_user.id).first()
        if not emp:
            db.add(
                PlatformEmployee(
                    user_id=super_admin_user.id,
                    employee_code="EMP-SUPER-0001",
                    role_scope="platform",
                    role_name="Platform Super Admin",
                    department="Executive & Platform Governance",
                    is_platform_owner=True,
                )
            )

    db.commit()
    return {
        "platform_tenant_id": str(platform_tenant.id),
        "roles_seeded": len(role_map),
        "permissions_seeded": len(perm_map),
        "industry_teams_seeded": len(PLATFORM_INDUSTRIES),
        "plans_seeded": len(DEFAULT_PLANS),
        "super_admin_email": admin_email or None,
    }


def main():
    db = SessionLocal()
    try:
        res = seed_platform_data(db)
        print("Platform seed completed:", res)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()