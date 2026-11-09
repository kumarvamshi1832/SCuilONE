from datetime import datetime, timezone
from decimal import Decimal

# Centralized Global Free Trial Configuration (PART 1)
# Applies to every newly registered company regardless of which paid plan it later selects.
FREE_TRIAL_DAYS: int = 14

# Grace period after a paid subscription's renewal date before automatic suspension (PART 10)
DEFAULT_GRACE_PERIOD_DAYS: int = 5

# Days before renewal_date when a renewal invoice is automatically generated (PART 10)
RENEWAL_INVOICE_LEAD_DAYS: int = 7

# Default invoice payment due window in days (PART 3)
DEFAULT_INVOICE_DUE_DAYS: int = 7

# Default tax rate percentage (0.00 by default so invoice total matches plan price unless GST is configured)
DEFAULT_TAX_RATE_PCT: Decimal = Decimal("0.00")

# Pre-expiration trial reminder schedule by trial day (PART 8)
# Trial day 12 -> 2 days left, Trial day 13 -> 1 day left, Trial day 14 -> ends today
TRIAL_REMINDER_SCHEDULE: dict[int, dict[str, str]] = {
    12: {
        "reminder_key": "trial_day_12",
        "column": "trial_day_12_sent_at",
        "subject": "Your free trial ends in 2 days",
        "headline": "Your 14-day SCuilONE free trial ends in 2 days",
        "days_remaining_label": "2 days",
    },
    13: {
        "reminder_key": "trial_day_13",
        "column": "trial_day_13_sent_at",
        "subject": "Your free trial ends tomorrow",
        "headline": "Your 14-day SCuilONE free trial ends tomorrow",
        "days_remaining_label": "1 day (tomorrow)",
    },
    14: {
        "reminder_key": "trial_day_14",
        "column": "trial_day_14_sent_at",
        "subject": "Your free trial ends today",
        "headline": "Your 14-day SCuilONE free trial ends today",
        "days_remaining_label": "today",
    },
}

# Post-trial 30-day email reminder campaign schedule by day after trial expiration (PART 9)
# Strictly only these 6 scheduled emails over 30 days.
POST_TRIAL_REMINDER_SCHEDULE: dict[int, dict[str, str]] = {
    1: {
        "reminder_key": "post_trial_day_1",
        "column": "post_trial_day_1_sent_at",
        "subject": "Your free trial has expired",
        "headline": "Your 14-day SCuilONE free trial has expired",
    },
    3: {
        "reminder_key": "post_trial_day_3",
        "column": "post_trial_day_3_sent_at",
        "subject": "Your CRM access is restricted – subscribe to continue",
        "headline": "Your CRM access is restricted – subscribe to continue",
    },
    7: {
        "reminder_key": "post_trial_day_7",
        "column": "post_trial_day_7_sent_at",
        "subject": "Discover the benefits of a SCuilONE subscription",
        "headline": "Discover the benefits of a SCuilONE subscription",
    },
    14: {
        "reminder_key": "post_trial_day_14",
        "column": "post_trial_day_14_sent_at",
        "subject": "Restore your CRM access by selecting a plan",
        "headline": "Restore your CRM access by selecting a plan",
    },
    21: {
        "reminder_key": "post_trial_day_21",
        "column": "post_trial_day_21_sent_at",
        "subject": "Your SCuilONE account is waiting for you",
        "headline": "Your SCuilONE account and CRM data are waiting for you",
    },
    30: {
        "reminder_key": "post_trial_day_30",
        "column": "post_trial_day_30_sent_at",
        "subject": "Final reminder to activate your subscription",
        "headline": "Final reminder to activate your SCuilONE subscription",
    },
}

COMMON_CRM_MODULES: list[str] = [
    "leads",
    "contacts",
    "accounts",
    "deals",
    "activities",
    "pipelines",
    "workflows",
    "reports",
    "dashboard",
    "documents",
    "form_templates",
    "import_export",
    "search",
    "audit_logs",
]

REAL_ESTATE_CRM_MODULES: list[str] = [
    "properties",
    "buildings",
    "real_estate_projects",
    "buyer_requirements",
    "property_matches",
    "site_visits",
    "bookings",
    "payments",
    "payment_plans",
    "payment_refunds",
]

SOFTWARE_CRM_MODULES: list[str] = [
    "software_requirements",
    "software_estimates",
    "software_contracts",
    "software_projects",
    "software_sprints",
    "software_time_entries",
    "software_invoices",
    "software_delivery_reports",
]

# Centralized Trial Resource Policy (PART 1 & PART 11)
TRIAL_RESOURCE_POLICY: dict = {
    "trial_days": FREE_TRIAL_DAYS,
    "max_users": 3,
    "max_branches": 1,
    "storage_limit_gb": 2,
    "features": [
        "core_crm",
        "basic_dashboard",
        "industry_pack",
        "pipelines",
        "workflows",
        "reports",
    ],
    "limits": {
        "leads": 500,
        "contacts": 500,
        "deals": 100,
    },
}

DEFAULT_PAYMENT_INSTRUCTIONS: dict = {
    "payment_mode": "Manual Offline Payment (Bank Transfer / NEFT / RTGS / IMPS / UPI)",
    "beneficiary_name": "StaunchCuil Services Private Limited",
    "bank_name": "HDFC Bank",
    "account_number": "50200098765432",
    "ifsc_code": "HDFC0001234",
    "upi_id": "billing@scuilone",
    "support_email": "billing@scuilone.com",
    "instructions": (
        "Complete the payment via NEFT/RTGS/IMPS or UPI quoting your Invoice Number as the reference, "
        "then submit the transaction reference and payment proof in your SCuilONE Billing portal for Platform Admin verification."
    ),
}

# API path prefixes that remain accessible after trial expiration or subscription suspension (PART 7)
ALLOWED_POST_EXPIRATION_PATH_PREFIXES: tuple[str, ...] = (
    "/api/v1/auth",
    "/api/v1/subscription",
    "/api/v1/subscriptions",
    "/api/v1/billing",
    "/api/v1/support-tickets",
    "/api/v1/notifications",
    "/api/v1/platform",
)

ALLOWED_POST_EXPIRATION_EXACT_PATHS: set[str] = {
    "/",
    "/docs",
    "/openapi.json",
    "/redoc",
    "/api/v1/users/me",
    "/api/v1/users/me/photo",
    "/api/v1/users/me/change-password",
}


def utc_now() -> datetime:
    """Return a timezone-aware UTC datetime."""
    return datetime.now(timezone.utc)


def ensure_utc(dt: datetime | None) -> datetime | None:
    """Normalize a naive or aware datetime to timezone-aware UTC."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def get_industry_enabled_modules(industry: str | None) -> list[str]:
    """Return the authorized CRM modules for a tenant's industry."""
    norm = " ".join((industry or "").strip().lower().replace("_", " ").replace("-", " ").split())
    modules = list(COMMON_CRM_MODULES)
    if "software" in norm or "it consulting" in norm or "it & software" in norm:
        modules.extend(SOFTWARE_CRM_MODULES)
    elif "real estate" in norm or "realestate" in norm:
        modules.extend(REAL_ESTATE_CRM_MODULES)
    return modules


def get_trial_resource_policy(industry: str | None = None) -> dict:
    """Return the centralized 14-day free trial resource policy for a tenant."""
    return {
        **TRIAL_RESOURCE_POLICY,
        "trial_days": FREE_TRIAL_DAYS,
        "storage_limit_bytes": TRIAL_RESOURCE_POLICY["storage_limit_gb"] * 1024 * 1024 * 1024,
        "enabled_modules": get_industry_enabled_modules(industry),
    }
