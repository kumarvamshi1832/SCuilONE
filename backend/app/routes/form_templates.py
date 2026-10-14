
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload

from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.models.form_template import FormTemplate, FormField
from app.schemas.form_template import (
    FormTemplateCreate,
    FormTemplateUpdate,
    FormTemplateResponse,
)
import re
from datetime import date
from app.models.lead import Lead
from app.models.contact import Contact
from app.models.account import Account
from app.models.deal import Deal
from app.models.form_template import CustomFormSubmission
from app.schemas.form_template import CustomFormSubmissionCreate

router = APIRouter(
    prefix="/api/v1/form-templates",
    tags=["Dynamic Form Builder"],
)

MODULE_MODELS = {
    "leads": Lead,
    "contacts": Contact,
    "accounts": Account,
    "deals": Deal,
}

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_tenant_id(current_user) -> UUID:
    try:
        return UUID(str(current_user["tenant_id"]))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Valid tenant context is required",
        )


def get_owned_template(
    template_id: UUID,
    tenant_id: UUID,
    db: Session,
) -> FormTemplate:
    template = (
        db.query(FormTemplate)
        .options(selectinload(FormTemplate.fields))
        .filter(
            FormTemplate.id == template_id,
            FormTemplate.tenant_id == tenant_id,
        )
        .first()
    )

    if not template:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Form template not found",
        )

    return template


@router.post(
    "/",
    response_model=FormTemplateResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_form_template(
    data: FormTemplateCreate,
    current_user=Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id = get_tenant_id(current_user)

    field_keys = [field.field_key for field in data.fields]
    if len(field_keys) != len(set(field_keys)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Field keys must be unique within a template",
        )

    existing = (
        db.query(FormTemplate)
        .filter(
            FormTemplate.tenant_id == tenant_id,
            FormTemplate.module_name == data.module_name,
            FormTemplate.name == data.name,
        )
        .first()
    )

    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A template with this name already exists for this module",
        )

    template = FormTemplate(
        tenant_id=tenant_id,
        name=data.name,
        module_name=data.module_name,
        description=data.description,
    )

    for field_data in data.fields:
        template.fields.append(FormField(**field_data.model_dump()))

    db.add(template)

    try:
        db.commit()
        db.refresh(template)
        return get_owned_template(template.id, tenant_id, db)
    except Exception:
        db.rollback()
        raise


@router.get("/", response_model=list[FormTemplateResponse])
def list_form_templates(
    module_name: str | None = None,
    include_inactive: bool = False,
    current_user=Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id = get_tenant_id(current_user)

    query = (
        db.query(FormTemplate)
        .options(selectinload(FormTemplate.fields))
        .filter(FormTemplate.tenant_id == tenant_id)
    )

    if module_name is not None:
        if module_name not in {"leads", "contacts", "accounts", "deals"}:
            raise HTTPException(400, "Invalid module name")
        query = query.filter(FormTemplate.module_name == module_name)

    if not include_inactive:
        query = query.filter(FormTemplate.is_active.is_(True))

    return query.order_by(FormTemplate.created_at.desc()).all()


@router.get("/{template_id}", response_model=FormTemplateResponse)
def get_form_template(
    template_id: UUID,
    current_user=Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id = get_tenant_id(current_user)
    return get_owned_template(template_id, tenant_id, db)


@router.patch("/{template_id}", response_model=FormTemplateResponse)
def update_form_template(
    template_id: UUID,
    data: FormTemplateUpdate,
    current_user=Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id = get_tenant_id(current_user)
    template = get_owned_template(template_id, tenant_id, db)
    changes = data.model_dump(exclude_unset=True)

    if "name" in changes and changes["name"] is not None:
        duplicate = (
            db.query(FormTemplate)
            .filter(
                FormTemplate.tenant_id == tenant_id,
                FormTemplate.module_name == template.module_name,
                FormTemplate.name == changes["name"],
                FormTemplate.id != template.id,
            )
            .first()
        )
        if duplicate:
            raise HTTPException(409, "A template with this name already exists")

    for key, value in changes.items():
        setattr(template, key, value)

    try:
        db.commit()
        return get_owned_template(template.id, tenant_id, db)
    except Exception:
        db.rollback()
        raise





def validate_custom_values(fields, values):
    field_map = {field.field_key: field for field in fields}

    unknown_fields = set(values.keys()) - set(field_map.keys())

    if unknown_fields:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown custom fields: {', '.join(sorted(unknown_fields))}",
        )

    validated_values = {}

    for key, field in field_map.items():
        value = values.get(key)

        if value is None or value == "":
            if field.is_required:
                raise HTTPException(
                    status_code=400,
                    detail=f"{field.field_label} is required",
                )

            validated_values[key] = None
            continue

        if field.field_type in {"text", "textarea", "email", "phone"}:
            if not isinstance(value, str):
                raise HTTPException(
                    status_code=400,
                    detail=f"{field.field_label} must be text",
                )

            if field.field_type == "email":
                if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", value):
                    raise HTTPException(
                        status_code=400,
                        detail=f"{field.field_label} must be a valid email",
                    )

            rules = field.validation_rules or {}

            if "min_length" in rules and len(value) < rules["min_length"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"{field.field_label} is too short",
                )

            if "max_length" in rules and len(value) > rules["max_length"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"{field.field_label} is too long",
                )

        elif field.field_type == "number":
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise HTTPException(
                    status_code=400,
                    detail=f"{field.field_label} must be a number",
                )

            rules = field.validation_rules or {}

            if "min" in rules and value < rules["min"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"{field.field_label} must be at least {rules['min']}",
                )

            if "max" in rules and value > rules["max"]:
                raise HTTPException(
                    status_code=400,
                    detail=f"{field.field_label} must not exceed {rules['max']}",
                )

        elif field.field_type == "dropdown":
            if not isinstance(value, str) or value not in (field.options or []):
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid option for {field.field_label}",
                )

        elif field.field_type == "checkbox":
            if not isinstance(value, bool):
                raise HTTPException(
                    status_code=400,
                    detail=f"{field.field_label} must be true or false",
                )

        elif field.field_type == "date":
            if not isinstance(value, str):
                raise HTTPException(
                    status_code=400,
                    detail=f"{field.field_label} must be a date in YYYY-MM-DD format",
                )

            try:
                date.fromisoformat(value)
            except ValueError:
                raise HTTPException(
                    status_code=400,
                    detail=f"{field.field_label} must be a valid date in YYYY-MM-DD format",
                )

        validated_values[key] = value

    return validated_values


@router.post("/submissions", status_code=status.HTTP_201_CREATED)
def submit_custom_form(
    data: CustomFormSubmissionCreate,
    current_user=Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id = get_tenant_id(current_user)

    template = get_owned_template(data.template_id, tenant_id, db)

    if not template.is_active:
        raise HTTPException(
            status_code=400,
            detail="This form template is inactive",
        )

    if template.module_name != data.module_name:
        raise HTTPException(
            status_code=400,
            detail="Template module does not match submission module",
        )

    record_model = MODULE_MODELS[data.module_name]

    record = (
        db.query(record_model)
        .filter(
            record_model.id == data.record_id,
            record_model.tenant_id == tenant_id,
        )
        .first()
    )

    if not record:
        raise HTTPException(
            status_code=404,
            detail="CRM record not found for this tenant and module",
        )

    validated_values = validate_custom_values(template.fields, data.values)

    submission = (
        db.query(CustomFormSubmission)
        .filter(
            CustomFormSubmission.tenant_id == tenant_id,
            CustomFormSubmission.template_id == template.id,
            CustomFormSubmission.module_name == data.module_name,
            CustomFormSubmission.record_id == data.record_id,
        )
        .first()
    )

    if submission:
        submission.values = validated_values
    else:
        submission = CustomFormSubmission(
            tenant_id=tenant_id,
            template_id=template.id,
            module_name=data.module_name,
            record_id=data.record_id,
            values=validated_values,
        )
        db.add(submission)

    try:
        db.commit()
        db.refresh(submission)

        return {
            "message": "Custom form values saved successfully",
            "submission_id": str(submission.id),
            "template_id": str(submission.template_id),
            "module_name": submission.module_name,
            "record_id": str(submission.record_id),
            "values": submission.values,
        }

    except Exception:
        db.rollback()
        raise


@router.get("/submissions/{module_name}/{record_id}")
def get_custom_form_submission(
    module_name: str,
    record_id: UUID,
    template_id: UUID,
    current_user=Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id = get_tenant_id(current_user)

    if module_name not in MODULE_MODELS:
        raise HTTPException(
            status_code=400,
            detail="Invalid CRM module",
        )

    template = get_owned_template(template_id, tenant_id, db)

    if template.module_name != module_name:
        raise HTTPException(
            status_code=400,
            detail="Template module does not match requested module",
        )

    record_model = MODULE_MODELS[module_name]

    record = (
        db.query(record_model)
        .filter(
            record_model.id == record_id,
            record_model.tenant_id == tenant_id,
        )
        .first()
    )

    if not record:
        raise HTTPException(
            status_code=404,
            detail="CRM record not found for this tenant and module",
        )

    submission = (
        db.query(CustomFormSubmission)
        .filter(
            CustomFormSubmission.tenant_id == tenant_id,
            CustomFormSubmission.template_id == template_id,
            CustomFormSubmission.module_name == module_name,
            CustomFormSubmission.record_id == record_id,
        )
        .first()
    )

    if not submission:
        raise HTTPException(
            status_code=404,
            detail="No custom form submission found for this record",
        )

    return {
        "submission_id": str(submission.id),
        "template_id": str(submission.template_id),
        "module_name": submission.module_name,
        "record_id": str(submission.record_id),
        "values": submission.values,
    }