
import csv
import io
from datetime import date
from decimal import Decimal, InvalidOperation
from uuid import UUID

from fastapi import File, UploadFile
from app.models.lead import Lead
from app.models.contact import Contact
from app.models.account import Account
from app.models.deal import Deal
from app.models.user import User
from app.models.pipeline import Pipeline, PipelineStage
from app.services.workflow_engine import dispatch_workflows
from app.services.notification_service import notify_assignment

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.form_template import FormTemplate, FormField, CustomFormSubmission


router = APIRouter(
    prefix="/api/v1/import-export",
    tags=["Import & Export"],
)

MODULES = {
    "leads": {
        "model": Lead,
        "permission": "lead.view",
        "create_permission": "lead.create",
        "columns": [
            "full_name", "email", "phone", "source", "status", "notes"
        ],
    },
    "contacts": {
        "model": Contact,
        "permission": "contact.view",
        "create_permission": "contact.create",
        "columns": [
            "full_name", "email", "phone", "company", "job_title",
            "address", "source", "account_id", "notes"
        ],
    },
    "accounts": {
        "model": Account,
        "permission": "account.view",
        "create_permission": "account.create",
        "columns": [
            "name", "email", "phone", "website", "industry", "address",
            "city", "state", "country", "postal_code", "status",
            "source", "notes"
        ],
    },
    "deals": {
        "model": Deal,
        "permission": "deal.view",
        "create_permission": "deal.create",
        "columns": [
            "name", "account_id", "contact_id", "lead_id", "amount",
            "stage", "pipeline_id", "pipeline_stage_id",
            "expected_close_date", "description"
        ],
    },
}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def require_module_permission(permission_type: str):
    def permission_checker(
        module_name: str,
        current_user: dict = Depends(require_active_user),
        db: Session = Depends(get_db),
    ):
        if module_name not in MODULES:
            raise HTTPException(
                status_code=404,
                detail="Unknown CRM module",
            )

        permission_name = MODULES[module_name][permission_type]
        checker = require_permission(permission_name)
        return checker(current_user=current_user, db=db)

    return permission_checker


def safe_csv_value(value):
    if value is None:
        return ""

    value = str(value)

    if value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + value

    return value


def make_csv(filename, columns, records):
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=columns)
    writer.writeheader()

    for record in records:
        writer.writerow({
            column: safe_csv_value(record.get(column))
            for column in columns
        })

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )


def get_template(db, tenant_id, module_name, template_id):
    if template_id is None:
        return None

    template = (
        db.query(FormTemplate)
        .filter(
            FormTemplate.id == template_id,
            FormTemplate.tenant_id == tenant_id,
            FormTemplate.module_name == module_name,
            FormTemplate.is_active.is_(True),
        )
        .first()
    )

    if template is None:
        raise HTTPException(
            status_code=404,
            detail="Active form template not found for this tenant and module.",
        )

    return template


def get_columns(module_name, template):
    columns = list(MODULES[module_name]["columns"])

    if template:
        for field in template.fields:
            if field.field_key in columns:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "Custom field key conflicts with a standard column: "
                        + field.field_key
                    ),
                )
            columns.append(field.field_key)

    return columns


def export_records(db, tenant_id, module_name, template):
    model = MODULES[module_name]["model"]

    records = (
        db.query(model)
        .filter(model.tenant_id == tenant_id)
        .order_by(model.created_at.desc())
        .all()
    )

    values_by_record = {}

    if template:
        submissions = (
            db.query(CustomFormSubmission)
            .filter(
                CustomFormSubmission.tenant_id == tenant_id,
                CustomFormSubmission.template_id == template.id,
                CustomFormSubmission.module_name == module_name,
            )
            .all()
        )

        values_by_record = {
            str(submission.record_id): submission.values or {}
            for submission in submissions
        }

    output = []

    for record in records:
        row = {}

        for column in MODULES[module_name]["columns"]:
            value = getattr(record, column, None)
            row[column] = str(value) if value is not None else ""

        if template:
            custom_values = values_by_record.get(str(record.id), {})
            for field in template.fields:
                row[field.field_key] = custom_values.get(
                    field.field_key, ""
                )

        output.append(row)

    return output



@router.get("/{module_name}/template")
def download_template(
    module_name: str,
    template_id: UUID | None = Query(default=None),
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
    _permission=Depends(require_module_permission("create_permission")),
):
    if module_name not in MODULES:
        raise HTTPException(status_code=404, detail="Unknown CRM module")

    tenant_id = UUID(str(current_user["tenant_id"]))
    template = get_template(db, tenant_id, module_name, template_id)
    columns = get_columns(module_name, template)

    return make_csv(f"{module_name}_template.csv", columns, [])



@router.get("/{module_name}/export")
def export_module(
    module_name: str,
    template_id: UUID | None = Query(default=None),
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
    _permission=Depends(require_module_permission("permission")),
):
    if module_name not in MODULES:
        raise HTTPException(status_code=404, detail="Unknown CRM module")

    tenant_id = UUID(str(current_user["tenant_id"]))
    template = get_template(db, tenant_id, module_name, template_id)
    columns = get_columns(module_name, template)
    records = export_records(db, tenant_id, module_name, template)

    return make_csv(f"{module_name}_export.csv", columns, records)

@router.post("/{module_name}/import")
async def import_module(
    module_name: str,
    file: UploadFile = File(...),
    template_id: UUID | None = Query(default=None),
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
    _permission=Depends(require_module_permission("create_permission")),
):
    if module_name not in {"contacts", "accounts", "deals"}:
        raise HTTPException(
            status_code=404,
            detail="CSV import is supported for contacts, accounts, and deals only",
        )

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Please upload a CSV file")

    content = await file.read(5 * 1024 * 1024 + 1)
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="CSV file must be 5 MB or smaller")

    try:
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        if not reader.fieldnames:
            raise HTTPException(status_code=400, detail="CSV headers are required")

        headers = [h.strip() for h in reader.fieldnames if h and h.strip()]
        if len(headers) != len(reader.fieldnames) or len(set(headers)) != len(headers):
            raise HTTPException(
                status_code=400,
                detail="CSV headers must be non-empty and unique",
            )

        rows = list(reader)
    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="CSV must use UTF-8 encoding",
        )
    except csv.Error:
        raise HTTPException(status_code=400, detail="Invalid CSV file")

    if len(rows) > 1000:
        raise HTTPException(
            status_code=400,
            detail="A maximum of 1000 data rows is allowed per import",
        )

    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

    template = get_template(db, tenant_id, module_name, template_id)
    allowed_columns = get_columns(module_name, template)
    unknown_columns = sorted(set(headers) - set(allowed_columns))

    if unknown_columns:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "CSV contains unsupported columns",
                "columns": unknown_columns,
            },
        )

    required_columns = {
        "contacts": {"full_name"},
        "accounts": {"name"},
        "deals": {"name"},
    }[module_name]

    missing_columns = sorted(required_columns - set(headers))
    if missing_columns:
        raise HTTPException(
            status_code=400,
            detail={
                "message": "Required CSV columns are missing",
                "columns": missing_columns,
            },
        )

    imported = 0
    errors = []

    for row_number, raw_row in enumerate(rows, start=2):
        record = None
        try:
            row = {
                (key or "").strip(): (value or "").strip()
                for key, value in raw_row.items()
                if key is not None
            }

            if not any(row.values()):
                continue

            custom_values = {}
            if template:
                for field in template.fields:
                    value = row.get(field.field_key, "")
                    if field.is_required and not value:
                        raise ValueError(
                            f"Custom field '{field.field_label}' is required"
                        )
                    if value:
                        custom_values[field.field_key] = value

            def optional_uuid(field_name):
                value = row.get(field_name, "")
                if not value:
                    return None
                try:
                    return UUID(value)
                except (ValueError, TypeError):
                    raise ValueError(f"'{field_name}' must be a valid UUID")

            def related_record(model, record_id, label):
                if record_id is None:
                    return None
                related = db.query(model).filter(
                    model.id == record_id,
                    model.tenant_id == tenant_id,
                ).first()
                if related is None:
                    raise ValueError(
                        f"{label} does not exist in this company"
                    )
                return related

            account_id = optional_uuid("account_id")
            contact_id = optional_uuid("contact_id")
            lead_id = optional_uuid("lead_id")

            account = related_record(Account, account_id, "Account") \
                if module_name != "accounts" else None

            if module_name == "contacts":
                record = Contact(
                    tenant_id=tenant_id,
                    created_by=user_id,
                    full_name=row.get("full_name", ""),
                    email=row.get("email") or None,
                    phone=row.get("phone") or None,
                    company=row.get("company") or None,
                    job_title=row.get("job_title") or None,
                    address=row.get("address") or None,
                    source=row.get("source") or None,
                    account_id=account_id,
                    assigned_to=account.assigned_to if account else None,
                    notes=row.get("notes") or None,
                )

            elif module_name == "accounts":
                status_value = row.get("status") or "Prospect"
                if status_value not in {
                    "Active", "Inactive", "Prospect", "Churned"
                }:
                    raise ValueError(
                        "Account status must be Active, Inactive, Prospect, or Churned"
                    )

                record = Account(
                    tenant_id=tenant_id,
                    created_by=user_id,
                    name=row.get("name", ""),
                    email=row.get("email") or None,
                    phone=row.get("phone") or None,
                    website=row.get("website") or None,
                    industry=row.get("industry") or None,
                    address=row.get("address") or None,
                    city=row.get("city") or None,
                    state=row.get("state") or None,
                    country=row.get("country") or None,
                    postal_code=row.get("postal_code") or None,
                    status=status_value,
                    source=row.get("source") or None,
                    notes=row.get("notes") or None,
                )

            else:
                lead = related_record(Lead, lead_id, "Lead")
                contact = related_record(Contact, contact_id, "Contact")

                if (lead_id or contact_id) and not account_id:
                    raise ValueError(
                        "An account_id is required when linking a lead or contact"
                    )

                if lead and lead.account_id != account_id:
                    raise ValueError(
                        "The lead must belong to the selected account"
                    )

                if contact and contact.account_id != account_id:
                    raise ValueError(
                        "The contact must belong to the selected account"
                    )

                amount_text = row.get("amount", "")
                try:
                    amount = Decimal(amount_text) if amount_text else Decimal("0")
                except InvalidOperation:
                    raise ValueError("'amount' must be a valid number")

                if not amount.is_finite() or amount < 0:
                    raise ValueError("'amount' must be a non-negative number")

                expected_close_date = None
                if row.get("expected_close_date"):
                    try:
                        expected_close_date = date.fromisoformat(
                            row["expected_close_date"]
                        )
                    except ValueError:
                        raise ValueError(
                            "'expected_close_date' must use YYYY-MM-DD format"
                        )

                pipeline_id = optional_uuid("pipeline_id")
                pipeline_stage_id = optional_uuid("pipeline_stage_id")

                if bool(pipeline_id) != bool(pipeline_stage_id):
                    raise ValueError(
                        "pipeline_id and pipeline_stage_id must both be provided"
                    )

                stage_name = row.get("stage") or "New"

                if pipeline_id:
                    pipeline = db.query(Pipeline).filter(
                        Pipeline.id == pipeline_id,
                        Pipeline.tenant_id == tenant_id,
                        Pipeline.is_active.is_(True),
                    ).first()
                    if not pipeline:
                        raise ValueError(
                            "Pipeline does not exist or is inactive in this company"
                        )

                    pipeline_stage = db.query(PipelineStage).filter(
                        PipelineStage.id == pipeline_stage_id,
                        PipelineStage.pipeline_id == pipeline_id,
                        PipelineStage.is_active.is_(True),
                    ).first()
                    if not pipeline_stage:
                        raise ValueError(
                            "Stage does not belong to the selected active pipeline"
                        )

                    stage_name = pipeline_stage.name

                assigned_to = (
                    lead.assigned_to if lead and lead.assigned_to else
                    contact.assigned_to if contact and contact.assigned_to else
                    account.assigned_to if account else None
                )

                record = Deal(
                    tenant_id=tenant_id,
                    created_by=user_id,
                    name=row.get("name", ""),
                    lead_id=lead_id,
                    contact_id=contact_id,
                    account_id=account_id,
                    assigned_to=assigned_to,
                    amount=amount,
                    stage=stage_name,
                    pipeline_id=pipeline_id,
                    pipeline_stage_id=pipeline_stage_id,
                    expected_close_date=expected_close_date,
                    description=row.get("description") or None,
                )

            if not getattr(record, "full_name", None) and module_name == "contacts":
                raise ValueError("'full_name' cannot be empty")
            if not getattr(record, "name", None) and module_name in {"accounts", "deals"}:
                raise ValueError("'name' cannot be empty")

            db.add(record)
            db.flush()

            if template and custom_values:
                db.add(
                    CustomFormSubmission(
                        tenant_id=tenant_id,
                        template_id=template.id,
                        module_name=module_name,
                        record_id=record.id,
                        values=custom_values,
                    )
                )

            db.commit()
            db.refresh(record)
            imported += 1

            try:
                dispatch_workflows(
                    db=db,
                    tenant_id=tenant_id,
                    module_name=module_name,
                    trigger_event="record_created",
                    record=record,
                    event_id=str(record.id),
                )
            except Exception:
                db.rollback()

        except Exception as exc:
            db.rollback()
            errors.append({
                "row": row_number,
                "error": str(exc.detail if isinstance(exc, HTTPException) else exc),
            })

    return {
        "module": module_name,
        "total_rows": len(rows),
        "imported": imported,
        "failed": len(errors),
        "errors": errors,
    }