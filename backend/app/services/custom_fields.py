"""Tenant-defined custom fields for leads, contacts, accounts and deals."""
import math
import re
import uuid
from datetime import date
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from app.models.account import Account
from app.models.contact import Contact
from app.models.custom_field_definition import CustomFieldDefinition
from app.models.deal import Deal
from app.models.lead import Lead

ENTITY_MODELS = {"lead": Lead, "contact": Contact, "account": Account, "deal": Deal}
FIELD_TYPES = {"text", "textarea", "number", "date", "boolean", "select", "multiselect", "email", "url"}
OPTION_TYPES = {"select", "multiselect"}
KEY_RE = re.compile(r"^[a-z][a-z0-9_]{1,49}$")
EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MAX_ACTIVE_FIELDS_PER_ENTITY = 40


class CustomFieldValidationError(Exception):
    def __init__(self, errors: dict[str, str]):
        super().__init__("Custom field validation failed")
        self.errors = errors


def validate_definition_options(field_type: str, options: list | None) -> list | None:
    if field_type in OPTION_TYPES:
        cleaned = []
        for opt in options or []:
            if not isinstance(opt, str) or not opt.strip() or len(opt.strip()) > 100:
                raise ValueError("Each option must be a non-empty text of at most 100 characters.")
            if opt.strip() not in cleaned:
                cleaned.append(opt.strip())
        if not 1 <= len(cleaned) <= 50:
            raise ValueError("Select fields need between 1 and 50 unique options.")
        return cleaned
    if options:
        raise ValueError("Options are only allowed for select and multiselect fields.")
    return None


def validate_value(defn: CustomFieldDefinition, value):
    """Return the normalized value, or None meaning 'clear this field'. Raise ValueError on bad input."""
    if value is None or value == "" or value == []:
        return None
    t = defn.field_type
    if t in {"text", "textarea"}:
        if not isinstance(value, str):
            raise ValueError("Must be text.")
        text = value.strip()
        if len(text) > (5000 if t == "textarea" else 255):
            raise ValueError("Text is too long.")
        return text
    if t == "number":
        if isinstance(value, bool):
            raise ValueError("Must be a number.")
        try:
            number = Decimal(str(value).strip())
        except InvalidOperation:
            raise ValueError("Must be a number.")
        if not number.is_finite() or abs(number) > Decimal("1e15"):
            raise ValueError("Number is out of range.")
        return int(number) if number == number.to_integral_value() else float(number)
    if t == "date":
        try:
            return date.fromisoformat(str(value).strip()).isoformat()
        except ValueError:
            raise ValueError("Must be a date in YYYY-MM-DD format.")
    if t == "boolean":
        if isinstance(value, bool):
            return value
        if str(value).strip().lower() in {"true", "false"}:
            return str(value).strip().lower() == "true"
        raise ValueError("Must be true or false.")
    if t == "select":
        if value not in (defn.options or []):
            raise ValueError(f"Must be one of: {', '.join(defn.options or [])}.")
        return value
    if t == "multiselect":
        if not isinstance(value, list) or not all(isinstance(v, str) for v in value):
            raise ValueError("Must be a list of options.")
        bad = [v for v in value if v not in (defn.options or [])]
        if bad:
            raise ValueError(f"Invalid option(s): {', '.join(bad)}.")
        return list(dict.fromkeys(value))
    if t == "email":
        if not isinstance(value, str) or not EMAIL_RE.match(value.strip()) or len(value) > 255:
            raise ValueError("Must be a valid email address.")
        return value.strip()
    if t == "url":
        if not isinstance(value, str) or not re.match(r"^https?://\S+$", value.strip()) or len(value) > 500:
            raise ValueError("Must be a valid http(s) URL.")
        return value.strip()
    raise ValueError("Unsupported field type.")


def get_active_definitions(db: Session, tenant_id: uuid.UUID, entity: str) -> dict[str, CustomFieldDefinition]:
    rows = (
        db.query(CustomFieldDefinition)
        .filter(
            CustomFieldDefinition.tenant_id == tenant_id,
            CustomFieldDefinition.entity == entity,
            CustomFieldDefinition.is_active.is_(True),
        )
        .order_by(CustomFieldDefinition.position, CustomFieldDefinition.label)
        .all()
    )
    return {r.field_key: r for r in rows}


def apply_custom_field_values(
    db: Session, tenant_id: uuid.UUID, entity: str, existing: dict | None, incoming: dict
) -> dict:
    """Merge incoming values into existing ones (null/empty clears a field) and validate everything."""
    defs = get_active_definitions(db, tenant_id, entity)
    errors: dict[str, str] = {}
    merged = dict(existing or {})

    for key, raw in (incoming or {}).items():
        defn = defs.get(key)
        if defn is None:
            errors[key] = "Unknown or inactive custom field."
            continue
        try:
            normalized = validate_value(defn, raw)
        except ValueError as exc:
            errors[key] = str(exc)
            continue
        if normalized is None:
            merged.pop(key, None)
        else:
            merged[key] = normalized

    for key, defn in defs.items():
        if defn.is_required and merged.get(key) in (None, "", []):
            errors.setdefault(key, "This field is required.")

    if errors:
        raise CustomFieldValidationError(errors)
    return merged
