import math
from datetime import date, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.activity import Activity
from app.models.activity_link import ActivityLink
from app.models.software_time_entry import SoftwareTimeEntry
from app.services.audit_service import log_audit
from app.schemas.software_time_entry import (
    ManualTimeEntryCreate,
    SoftwareTimeEntryResponse,
    TimerStartRequest,
)


router = APIRouter(
    prefix="/api/v1/software-time-entries",
    tags=["Software Time Tracking"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_activity_or_404(db: Session, tenant_id: UUID, activity_id: UUID) -> Activity:
    activity = db.query(Activity).filter(
        Activity.id == activity_id,
        Activity.tenant_id == tenant_id,
        Activity.activity_type == "Task",
    ).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Task not found for this tenant",
        )
    return activity


def get_time_entry_or_404(
    db: Session, tenant_id: UUID, entry_id: UUID
) -> SoftwareTimeEntry:
    entry = db.query(SoftwareTimeEntry).filter(
        SoftwareTimeEntry.id == entry_id,
        SoftwareTimeEntry.tenant_id == tenant_id,
    ).first()
    if not entry:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Time entry not found",
        )
    return entry


@router.post(
    "/manual",
    response_model=SoftwareTimeEntryResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_manual_time_entry(
    data: ManualTimeEntryCreate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.update")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))
    get_activity_or_404(db, tenant_id, data.activity_id)

    entry = SoftwareTimeEntry(
        tenant_id=tenant_id,
        activity_id=data.activity_id,
        user_id=user_id,
        duration_minutes=data.duration_minutes,
        work_date=data.work_date or date.today(),
        notes=data.notes,
        is_billable=data.is_billable,
        source="manual",
    )
    db.add(entry)
    try:
        db.commit()
        db.refresh(entry)
    except Exception:
        db.rollback()
        raise
    return entry


@router.post(
    "/timer/start",
    response_model=SoftwareTimeEntryResponse,
    status_code=status.HTTP_201_CREATED,
)
def start_timer(
    data: TimerStartRequest,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.update")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))
    get_activity_or_404(db, tenant_id, data.activity_id)

    active_timer = db.query(SoftwareTimeEntry).filter(
        SoftwareTimeEntry.tenant_id == tenant_id,
        SoftwareTimeEntry.user_id == user_id,
        SoftwareTimeEntry.source == "timer",
        SoftwareTimeEntry.stopped_at.is_(None),
    ).first()
    if active_timer:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="You already have an active timer. Stop it before starting another.",
        )

    now = datetime.utcnow()
    entry = SoftwareTimeEntry(
        tenant_id=tenant_id,
        activity_id=data.activity_id,
        user_id=user_id,
        duration_minutes=None,
        work_date=now.date(),
        notes=data.notes,
        is_billable=data.is_billable,
        source="timer",
        started_at=now,
    )
    db.add(entry)
    try:
        db.commit()
        db.refresh(entry)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An active timer already exists for your account.",
        )
    except Exception:
        db.rollback()
        raise
    return entry


@router.post(
    "/{entry_id}/timer/stop",
    response_model=SoftwareTimeEntryResponse,
)
def stop_timer(
    entry_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.update")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))
    entry = get_time_entry_or_404(db, tenant_id, entry_id)

    if entry.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You can only stop your own timer",
        )
    if entry.source != "timer" or entry.started_at is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This entry is not a timer",
        )
    if entry.stopped_at is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This timer has already been stopped",
        )

    stopped_at = datetime.utcnow()
    elapsed_seconds = max(0, (stopped_at - entry.started_at).total_seconds())
    entry.stopped_at = stopped_at
    entry.duration_minutes = max(1, math.ceil(elapsed_seconds / 60))
    try:
        db.commit()
        db.refresh(entry)
    except Exception:
        db.rollback()
        raise
    return entry


@router.post(
    "/{entry_id}/approve-billing",
    response_model=SoftwareTimeEntryResponse,
)
def approve_time_entry_for_billing(
    entry_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("software_contract.update")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))
    entry = get_time_entry_or_404(db, tenant_id, entry_id)
    if not entry.is_billable:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only billable time entries can be approved for invoicing",
        )
    if entry.duration_minutes is None or (entry.source == "timer" and entry.stopped_at is None):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Time entry must be completed before billing approval",
        )
    if entry.billing_status == "Rejected":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Rejected time entries cannot be approved without a review workflow",
        )
    old_billing_status = entry.billing_status
    entry.billing_status = "Approved"
    log_audit(
        db, tenant_id, user_id, "billing_approved", "software_time_entry", entry.id,
        "Approved billable time entry for invoicing",
        before_data={"billing_status": old_billing_status},
        after_data={"billing_status": "Approved", "duration_minutes": entry.duration_minutes,
                    "is_billable": entry.is_billable},
    )
    try:
        db.commit()
        db.refresh(entry)
    except Exception:
        db.rollback()
        raise
    return entry


@router.get("/", response_model=list[SoftwareTimeEntryResponse])
def list_time_entries(
    activity_id: UUID | None = None,
    project_id: UUID | None = None,
    sprint_id: UUID | None = None,
    user_id: UUID | None = None,
    from_date: date | None = None,
    to_date: date | None = None,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    query = db.query(SoftwareTimeEntry).filter(
        SoftwareTimeEntry.tenant_id == tenant_id
    )

    if activity_id is not None:
        query = query.filter(SoftwareTimeEntry.activity_id == activity_id)
    if user_id is not None:
        query = query.filter(SoftwareTimeEntry.user_id == user_id)
    if from_date is not None:
        query = query.filter(SoftwareTimeEntry.work_date >= from_date)
    if to_date is not None:
        query = query.filter(SoftwareTimeEntry.work_date <= to_date)
    if from_date and to_date and from_date > to_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="from_date must be on or before to_date",
        )
    if project_id is not None or sprint_id is not None:
        query = query.join(
            Activity,
            (Activity.id == SoftwareTimeEntry.activity_id)
            & (Activity.tenant_id == SoftwareTimeEntry.tenant_id),
        ).join(
            ActivityLink,
            (ActivityLink.activity_id == Activity.id)
            & (ActivityLink.tenant_id == tenant_id),
        )
        if project_id is not None:
            query = query.filter(
                ActivityLink.module == "software_project",
                ActivityLink.record_id == project_id,
            )
        if sprint_id is not None:
            query = query.filter(
                ActivityLink.module == "software_sprint",
                ActivityLink.record_id == sprint_id,
            )

    return query.order_by(SoftwareTimeEntry.work_date.desc(), SoftwareTimeEntry.created_at.desc()).all()
