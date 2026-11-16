import re
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field, field_validator
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_active_user
from app.core.permission_utils import require_permission_for
from app.core.permissions import require_permission
from app.models.custom_field_definition import CustomFieldDefinition
from app.services.audit_service import log_audit
from app.services.custom_fields import (
    ENTITY_MODELS,
    FIELD_TYPES,
    KEY_RE,
    MAX_ACTIVE_FIELDS_PER_ENTITY,
    CustomFieldValidationError,
    apply_custom_field_values,
    get_active_definitions,
    validate_definition_options,
)

router = APIRouter(prefix="/api/v1/custom-fields", tags=["Custom Fields"])

Entity = Literal["lead", "contact", "account", "deal"]
FieldType = Literal["text", "textarea", "number", "date", "boolean", "select", "multiselect", "email", "url"]


class DefinitionCreate(BaseModel):
    entity: Entity
    field_key: str = Field(min_length=2, max_length=50)
    label: str = Field(min_length=1, max_length=100)
    field_type: FieldType
    options: list[str] | None = None
    help_text: str | None = Field(default=None, max_length=255)
    is_required: bool = False
    position: int = Field(default=0, ge=0, le=1000)

    @field_validator("field_key")
    @classmethod
    def _key(cls, v: str) -> str:
        v = v.strip().lower()
        if not KEY_RE.match(v):
            raise ValueError("field_key must start with a letter and use only a-z, 0-9 and underscore (2-50 chars).")
        return v

    @field_validator("label")
    @classmethod
    def _label(cls, v: str) -> str:
        v = re.sub(r"\s+", " ", v).strip()
        if not v:
            raise ValueError("label cannot be blank.")
        return v


class DefinitionUpdate(BaseModel):
    label: str | None = Field(default=None, min_length=1, max_length=100)
    options: list[str] | None = None
    help_text: str | None = Field(default=None, max_length=255)
    is_required: bool | None = None
    is_active: bool | None = None
    position: int | None = Field(default=None, ge=0, le=1000)


class ValuesUpdate(BaseModel):
    values: dict[str, object]


def _def_out(d: CustomFieldDefinition) -> dict:
    return {
        "id": d.id, "entity": d.entity, "field_key": d.field_key, "label": d.label,
        "field_type": d.field_type, "options": d.options, "help_text": d.help_text,
        "is_required": d.is_required, "is_active": d.is_active, "position": d.position,
    }


@router.get("/definitions")
def list_definitions(
    entity: Entity | None = None,
    include_inactive: bool = False,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("custom_field.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    q = db.query(CustomFieldDefinition).filter(CustomFieldDefinition.tenant_id == tenant_id)
    if entity:
        q = q.filter(CustomFieldDefinition.entity == entity)
    if not include_inactive:
        q = q.filter(CustomFieldDefinition.is_active.is_(True))
    return [_def_out(d) for d in q.order_by(CustomFieldDefinition.entity, CustomFieldDefinition.position).all()]


@router.post("/definitions", status_code=status.HTTP_201_CREATED)
def create_definition(
    payload: DefinitionCreate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("custom_field.manage")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    try:
        options = validate_definition_options(payload.field_type, payload.options)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    if len(get_active_definitions(db, tenant_id, payload.entity)) >= MAX_ACTIVE_FIELDS_PER_ENTITY:
        raise HTTPException(status_code=422, detail=f"At most {MAX_ACTIVE_FIELDS_PER_ENTITY} active custom fields per module.")

    defn = CustomFieldDefinition(
        tenant_id=tenant_id, entity=payload.entity, field_key=payload.field_key, label=payload.label,
        field_type=payload.field_type, options=options, help_text=payload.help_text,
        is_required=payload.is_required, position=payload.position,
        created_by=UUID(str(current_user["user_id"])),
    )
    db.add(defn)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A custom field with this key already exists for this module.")
    log_audit(db, tenant_id, current_user["user_id"], "CREATE", "custom_field", defn.id,
              description=f"Created custom field '{defn.label}' on {defn.entity}", after_data=_def_out(defn))
    db.commit()
    return _def_out(defn)


@router.put("/definitions/{definition_id}")
def update_definition(
    definition_id: UUID,
    payload: DefinitionUpdate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("custom_field.manage")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    defn = db.query(CustomFieldDefinition).filter(
        CustomFieldDefinition.id == definition_id, CustomFieldDefinition.tenant_id == tenant_id
    ).first()
    if not defn:
        raise HTTPException(status_code=404, detail="Custom field not found")
    before = _def_out(defn)
    data = payload.model_dump(exclude_unset=True)
    if "options" in data:
        try:
            data["options"] = validate_definition_options(defn.field_type, data["options"])
        except ValueError as exc:
            raise HTTPException(status_code=422, detail=str(exc))
    if data.get("is_active") is True and not defn.is_active:
        if len(get_active_definitions(db, tenant_id, defn.entity)) >= MAX_ACTIVE_FIELDS_PER_ENTITY:
            raise HTTPException(status_code=422, detail="Too many active custom fields for this module.")
    for key, value in data.items():
        setattr(defn, key, value)
    log_audit(db, tenant_id, current_user["user_id"], "UPDATE", "custom_field", defn.id,
              description=f"Updated custom field '{defn.label}'", before_data=before, after_data=_def_out(defn))
    db.commit()
    return _def_out(defn)


@router.delete("/definitions/{definition_id}", status_code=status.HTTP_204_NO_CONTENT)
def deactivate_definition(
    definition_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("custom_field.manage")),
    db: Session = Depends(get_db),
):
    """Deactivates the field. Stored values are kept, and the field can be re-activated later."""
    tenant_id = UUID(str(current_user["tenant_id"]))
    defn = db.query(CustomFieldDefinition).filter(
        CustomFieldDefinition.id == definition_id, CustomFieldDefinition.tenant_id == tenant_id
    ).first()
    if not defn:
        raise HTTPException(status_code=404, detail="Custom field not found")
    defn.is_active = False
    log_audit(db, tenant_id, current_user["user_id"], "DEACTIVATE", "custom_field", defn.id,
              description=f"Deactivated custom field '{defn.label}'")
    db.commit()


def _get_record(db: Session, tenant_id: UUID, entity: str, record_id: UUID):
    model = ENTITY_MODELS[entity]
    record = db.query(model).filter(model.id == record_id, model.tenant_id == tenant_id).first()
    if not record:
        raise HTTPException(status_code=404, detail=f"{entity.title()} not found")
    return record


@router.get("/values/{entity}/{record_id}")
def get_values(
    entity: Entity,
    record_id: UUID,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    require_permission_for(db, current_user, f"{entity}.view")
    tenant_id = UUID(str(current_user["tenant_id"]))
    record = _get_record(db, tenant_id, entity, record_id)
    stored = record.custom_fields or {}
    return {
        "entity": entity, "record_id": record.id,
        "fields": [
            {**_def_out(d), "value": stored.get(key)}
            for key, d in get_active_definitions(db, tenant_id, entity).items()
        ],
    }


@router.put("/values/{entity}/{record_id}")
def set_values(
    entity: Entity,
    record_id: UUID,
    payload: ValuesUpdate,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """Partial update: send only the keys to change. null or "" clears a value."""
    require_permission_for(db, current_user, f"{entity}.update")
    tenant_id = UUID(str(current_user["tenant_id"]))
    record = _get_record(db, tenant_id, entity, record_id)
    try:
        merged = apply_custom_field_values(db, tenant_id, entity, record.custom_fields, payload.values)
    except CustomFieldValidationError as exc:
        raise HTTPException(status_code=422, detail={"message": "Invalid custom field values", "errors": exc.errors})
    before = dict(record.custom_fields or {})
    record.custom_fields = merged  # new dict object so the JSONB change is detected
    log_audit(db, tenant_id, current_user["user_id"], "UPDATE", f"{entity}_custom_fields", record.id,
              description=f"Updated custom fields on {entity}", before_data=before, after_data=merged)
    db.commit()
    return {"entity": entity, "record_id": record.id, "custom_fields": merged}
