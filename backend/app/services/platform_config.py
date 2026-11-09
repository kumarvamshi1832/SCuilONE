"""Typed, database-backed platform configuration accessors."""
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
from sqlalchemy.orm import Session
from fastapi import HTTPException
from app.models.platform import PlatformSetting

DEFAULTS = {
    "platform.general": {
        "company_name": "StaunchCuil Services Private Limited",
        "platform_name": "SCuilONE",
        "support_email": "support@staunchcuil.com",
        "default_currency": "INR",
        "default_timezone": "Asia/Kolkata",
    },
    "platform.security_policy": {
        "min_password_length": 15,
        "session_timeout_minutes": 10080,
        "max_failed_login_attempts": 5,
        "mfa_required_for_platform_roles": True,
        "force_password_change_on_first_login": True,
    },
    "platform.ticket_routing": {
        "route_by_industry_first": True,
        "auto_assign_least_loaded": True,
        "route_by_issue_type_second": True,
        "default_sla_resolution_hours": 24,
        "default_sla_response_minutes": 60,
    },
}
CURRENCIES = {"INR", "USD", "EUR", "GBP", "AED", "CAD", "AUD", "SGD", "JPY"}


def get_platform_config(db: Session, key: str) -> dict:
    row = db.query(PlatformSetting).filter(PlatformSetting.setting_key == key).first()
    defaults = DEFAULTS.get(key, {})
    stored = row.value_json if row and isinstance(row.value_json, dict) else {}
    # Ignore unknown legacy keys so arbitrary values/secrets are never exposed to callers.
    candidate = {**defaults, **{field: stored[field] for field in defaults if field in stored}}
    try:
        return validate_platform_setting(key, candidate)
    except HTTPException:
        # Invalid legacy JSON must not break authentication or routing at runtime.
        return dict(defaults)


def validate_platform_setting(key: str, value: dict) -> dict:
    if key not in DEFAULTS:
        raise HTTPException(status_code=404, detail=f"Unknown platform setting '{key}'.")
    if not isinstance(value, dict) or set(value) != set(DEFAULTS[key]):
        missing = sorted(set(DEFAULTS[key]) - set(value or {}))
        extra = sorted(set(value or {}) - set(DEFAULTS[key]))
        raise HTTPException(status_code=422, detail={"message": "Setting structure does not match schema.", "missing": missing, "unknown": extra})
    out = dict(value)
    if key == "platform.general":
        for field in ("company_name", "platform_name"):
            if not isinstance(out[field], str) or not 2 <= len(out[field].strip()) <= 150:
                raise HTTPException(status_code=422, detail=f"{field} must contain 2 to 150 characters.")
            out[field] = out[field].strip()
        from email_validator import validate_email, EmailNotValidError
        try:
            out["support_email"] = validate_email(out["support_email"], check_deliverability=False).normalized
        except (EmailNotValidError, TypeError):
            raise HTTPException(status_code=422, detail="support_email must be a valid email address.")
        if not isinstance(out["default_currency"], str) or out["default_currency"] not in CURRENCIES:
            raise HTTPException(status_code=422, detail="Unsupported default_currency.")
        if not isinstance(out["default_timezone"], str):
            raise HTTPException(status_code=422, detail="default_timezone must be an IANA timezone.")
        try:
            ZoneInfo(out["default_timezone"])
        except (ZoneInfoNotFoundError, ValueError, TypeError):
            raise HTTPException(status_code=422, detail="default_timezone must be a valid IANA timezone.")
    elif key == "platform.security_policy":
        for field, low, high in (("min_password_length", 15, 128), ("session_timeout_minutes", 5, 10080), ("max_failed_login_attempts", 3, 20)):
            if isinstance(out[field], bool) or not isinstance(out[field], int) or not low <= out[field] <= high:
                raise HTTPException(status_code=422, detail=f"{field} must be an integer between {low} and {high}.")
        for field in ("mfa_required_for_platform_roles", "force_password_change_on_first_login"):
            if not isinstance(out[field], bool):
                raise HTTPException(status_code=422, detail=f"{field} must be a boolean.")
    else:
        for field in ("route_by_industry_first", "auto_assign_least_loaded", "route_by_issue_type_second"):
            if not isinstance(out[field], bool):
                raise HTTPException(status_code=422, detail=f"{field} must be a boolean.")
        for field, low, high in (("default_sla_resolution_hours", 1, 720), ("default_sla_response_minutes", 1, 10080)):
            if isinstance(out[field], bool) or not isinstance(out[field], int) or not low <= out[field] <= high:
                raise HTTPException(status_code=422, detail=f"{field} must be an integer between {low} and {high}.")
    return out


def enforce_configured_password_policy(db: Session, password: str, identifiers=None) -> None:
    from app.core.password_policy import ensure_password_policy
    minimum = int(get_platform_config(db, "platform.security_policy").get("min_password_length", 15))
    ensure_password_policy(password, identifiers, min_length=minimum)
