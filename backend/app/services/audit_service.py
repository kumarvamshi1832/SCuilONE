import json
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.audit_log import AuditLog


SENSITIVE_KEYS = {
    "password",
    "current_password",
    "new_password",
    "confirm_password",
    "otp",
    "token",
    "access_token",
    "refresh_token",
    "secret",
    "api_key",
    "encryption_key",
    "authorization",
}


def sanitize_data(data):
    if data is None:
        return None

    if isinstance(data, dict):
        result = {}

        for key, value in data.items():
            normalized_key = key.lower().replace("-", "_")

            if (
                normalized_key in SENSITIVE_KEYS
                or normalized_key.endswith("_password")
                or normalized_key.endswith("_token")
                or normalized_key.endswith("_secret")
            ):
                continue

            result[key] = sanitize_data(value)

        return result

    if isinstance(data, (list, tuple)):
        return [sanitize_data(item) for item in data]

    if isinstance(data, UUID):
        return str(data)

    if hasattr(data, "isoformat"):
        return data.isoformat()

    if isinstance(data, (str, int, float, bool)) or data is None:
        return data

    return str(data)


def log_audit(
    db: Session,
    tenant_id,
    user_id,
    action: str,
    module: str,
    record_id=None,
    description=None,
    before_data=None,
    after_data=None,
):
    audit = AuditLog(
        tenant_id=UUID(str(tenant_id)),
        user_id=UUID(str(user_id)) if user_id else None,
        action=action,
        module=module,
        record_id=str(record_id) if record_id is not None else None,
        description=description,
        before_data=sanitize_data(before_data),
        after_data=sanitize_data(after_data),
    )

    db.add(audit)
    db.flush()

    return audit
