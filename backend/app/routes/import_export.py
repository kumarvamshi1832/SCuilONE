import csv
import io
import logging
from uuid import UUID

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.lead import Lead
from app.models.user import User
from app.services.lead_assignment import (
    assign_lead_automatically,
    ACTIVE_LEAD_STATUSES,
    get_active_lead_count,
    MAX_ACTIVE_LEADS,
)
from app.models.lead_assignment_audit import LeadAssignmentAudit
from app.services.notification_service import notify_assignment
from app.services.workflow_engine import dispatch_workflows

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/import-export",
    tags=["Import & Export"],
)

MAX_FILE_SIZE = 5 * 1024 * 1024
MAX_ROWS = 5000

LEAD_COLUMNS = [
    "full_name",
    "email",
    "phone",
    "source",
    "status",
    "notes",
]

ALLOWED_LEAD_STATUSES = {
    "New",
    "Contacted",
    "Qualified",
    "Converted",
    "Lost",
}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def safe_csv_value(value):
    if value is None:
        return ""

    value = str(value)

    if value.lstrip().startswith(("=", "+", "-", "@", "\t", "\r")):
        return "'" + value

    return value


def csv_response(filename, columns, records):
    output = io.StringIO(newline="")
    writer = csv.DictWriter(output, fieldnames=columns)
    writer.writeheader()

    for record in records:
        writer.writerow({
            column: safe_csv_value(record.get(column))
            for column in columns
        })

    output.seek(0)

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        },
    )


@router.get("/leads/template")
def download_lead_template(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.create")),
):
    return csv_response(
        "leads_template.csv",
        LEAD_COLUMNS,
        [],
    )


@router.get("/leads/export")
def export_leads(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))

    leads = (
        db.query(Lead)
        .filter(Lead.tenant_id == tenant_id)
        .order_by(Lead.created_at.desc())
        .all()
    )

    records = [
        {
            "full_name": lead.full_name,
            "email": lead.email,
            "phone": lead.phone,
            "source": lead.source,
            "status": lead.status,
            "notes": lead.notes,
        }
        for lead in leads
    ]

    return csv_response("leads_export.csv", LEAD_COLUMNS, records)


@router.post("/leads/import")
async def import_leads(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.create")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

    filename = (file.filename or "").lower()

    if not filename.endswith(".csv"):
        raise HTTPException(
            status_code=400,
            detail="Please upload a CSV file.",
        )

    contents = await file.read(MAX_FILE_SIZE + 1)

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="The uploaded CSV file is empty.",
        )

    if len(contents) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=413,
            detail="CSV file must be 5 MB or smaller.",
        )

    try:
        text = contents.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        headers = reader.fieldnames or []

        if len(headers) != len(set(headers)):
            raise HTTPException(
                status_code=400,
                detail="CSV contains duplicate column names.",
            )

        missing_columns = set(LEAD_COLUMNS) - set(headers)

        if missing_columns:
            raise HTTPException(
                status_code=400,
                detail={
                    "message": "CSV is missing required columns.",
                    "missing_columns": sorted(missing_columns),
                    "expected_columns": LEAD_COLUMNS,
                },
            )

        rows = []

        for row_number, row in enumerate(reader, start=2):
            if row_number > MAX_ROWS + 1:
                raise HTTPException(
                    status_code=400,
                    detail=f"CSV cannot contain more than {MAX_ROWS} data rows.",
                )

            rows.append((row_number, row))

    except UnicodeDecodeError:
        raise HTTPException(
            status_code=400,
            detail="CSV must use UTF-8 encoding.",
        )

    except csv.Error:
        raise HTTPException(
            status_code=400,
            detail="CSV format is invalid.",
        )

    results = {
        "total_rows": len(rows),
        "imported": 0,
        "failed": 0,
        "errors": [],
    }

    try:
        for row_number, row in rows:
            name = (row.get("full_name") or "").strip()
            email = (row.get("email") or "").strip() or None
            phone = (row.get("phone") or "").strip() or None
            source = (row.get("source") or "").strip() or None
            status_value = (row.get("status") or "New").strip()
            notes = (row.get("notes") or "").strip() or None

            errors = []

            if not name:
                errors.append("full_name is required")
            elif len(name) > 150:
                errors.append("full_name must be 150 characters or fewer")

            if email:
                from pydantic import TypeAdapter, ValidationError, EmailStr

                try:
                    TypeAdapter(EmailStr).validate_python(email)
                except ValidationError:
                    errors.append("email is invalid")

            if phone and len(phone) > 30:
                errors.append("phone must be 30 characters or fewer")

            if status_value not in ALLOWED_LEAD_STATUSES:
                errors.append(
                    "status must be one of: "
                    + ", ".join(sorted(ALLOWED_LEAD_STATUSES))
                )

            if errors:
                results["failed"] += 1
                results["errors"].append({
                    "row": row_number,
                    "errors": errors,
                })
                continue

            duplicate_query = db.query(Lead).filter(
                Lead.tenant_id == tenant_id
            )

            if email:
                duplicate_query = duplicate_query.filter(
                    Lead.email.ilike(email)
                )

                if duplicate_query.first():
                    results["failed"] += 1
                    results["errors"].append({
                        "row": row_number,
                        "errors": ["A lead with this email already exists"],
                    })
                    continue

            assigned_to = assign_lead_automatically(
                db=db,
                tenant_id=tenant_id,
            )

            if assigned_to is not None:
                active_count = get_active_lead_count(
                    db=db,
                    tenant_id=tenant_id,
                    user_id=assigned_to,
                )

                if (
                    status_value in ACTIVE_LEAD_STATUSES
                    and active_count >= MAX_ACTIVE_LEADS
                ):
                    assigned_to = None

            lead = Lead(
                tenant_id=tenant_id,
                created_by=user_id,
                full_name=name,
                email=email,
                phone=phone,
                source=source,
                status=status_value,
                notes=notes,
                assigned_to=assigned_to,
            )

            db.add(lead)
            db.flush()

            db.commit()
            db.refresh(lead)

            if assigned_to is not None:
                try:
                    notify_assignment(
                        db=db,
                        tenant_id=tenant_id,
                        recipient_user_id=assigned_to,
                        actor_user_id=user_id,
                        title="New lead assigned to you",
                        message=f"Lead '{lead.full_name}' has been assigned to you.",
                        related_module="leads",
                        related_record_id=lead.id,
                    )
                except Exception:
                    logger.exception(
                        "Import assignment notification failed for lead %s",
                        lead.id,
                    )
                    db.rollback()

            try:
                dispatch_workflows(
                    db=db,
                    tenant_id=tenant_id,
                    module_name="leads",
                    trigger_event="record_created",
                    record=lead,
                    event_id=str(lead.id),
                )
                db.commit()
            except Exception:
                db.rollback()
                logger.exception(
                    "Import workflow dispatch failed for lead %s",
                    lead.id,
                )

            results["imported"] += 1

    except Exception:
        db.rollback()
        raise

    return results
