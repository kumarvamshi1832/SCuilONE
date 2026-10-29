from datetime import date
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func
from sqlalchemy.orm import Session

from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.activity import Activity
from app.models.activity_link import ActivityLink
from app.models.software_project import SoftwareProject
from app.models.software_sprint import SoftwareSprint
from app.models.software_time_entry import SoftwareTimeEntry
from app.models.user import User

router = APIRouter(
    prefix="/api/v1/software-reports",
    tags=["Software Delivery Reports"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def _date_filters(query, from_date: date | None, to_date: date | None):
    if from_date and to_date and from_date > to_date:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="from_date must be on or before to_date",
        )
    if from_date:
        query = query.filter(SoftwareTimeEntry.work_date >= from_date)
    if to_date:
        query = query.filter(SoftwareTimeEntry.work_date <= to_date)
    return query


def _check_project(db: Session, tenant_id: UUID, project_id: UUID):
    project = db.query(SoftwareProject.id).filter(
        SoftwareProject.id == project_id,
        SoftwareProject.tenant_id == tenant_id,
    ).first()
    if not project:
        raise HTTPException(status_code=404, detail="Software project not found")


def _check_sprint(db: Session, tenant_id: UUID, sprint_id: UUID):
    sprint = db.query(SoftwareSprint.id).filter(
        SoftwareSprint.id == sprint_id,
        SoftwareSprint.tenant_id == tenant_id,
    ).first()
    if not sprint:
        raise HTTPException(status_code=404, detail="Software sprint not found")


def _entry_base(db: Session, tenant_id: UUID, from_date: date | None, to_date: date | None):
    query = db.query(SoftwareTimeEntry).filter(
        SoftwareTimeEntry.tenant_id == tenant_id,
        SoftwareTimeEntry.duration_minutes.isnot(None),
    )
    return _date_filters(query, from_date, to_date)


def _totals(query):
    row = query.with_entities(
        func.coalesce(func.sum(SoftwareTimeEntry.duration_minutes), 0).label("total_minutes"),
        func.coalesce(
            func.sum(case((SoftwareTimeEntry.is_billable.is_(True), SoftwareTimeEntry.duration_minutes), else_=0)),
            0,
        ).label("billable_minutes"),
        func.coalesce(
            func.sum(case((SoftwareTimeEntry.is_billable.is_(False), SoftwareTimeEntry.duration_minutes), else_=0)),
            0,
        ).label("non_billable_minutes"),
        func.count(SoftwareTimeEntry.id).label("entry_count"),
    ).first()
    total = int(row.total_minutes or 0)
    billable = int(row.billable_minutes or 0)
    non_billable = int(row.non_billable_minutes or 0)
    return {
        "total_minutes": total,
        "total_hours": round(total / 60, 2),
        "billable_minutes": billable,
        "billable_hours": round(billable / 60, 2),
        "non_billable_minutes": non_billable,
        "non_billable_hours": round(non_billable / 60, 2),
        "entry_count": int(row.entry_count or 0),
    }


@router.get("/projects/{project_id}/time-summary")
def project_time_summary(
    project_id: UUID,
    from_date: date | None = None,
    to_date: date | None = None,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    _check_project(db, tenant_id, project_id)
    query = _entry_base(db, tenant_id, from_date, to_date).join(
        Activity,
        (Activity.id == SoftwareTimeEntry.activity_id)
        & (Activity.tenant_id == SoftwareTimeEntry.tenant_id),
    ).join(
        ActivityLink,
        (ActivityLink.activity_id == Activity.id)
        & (ActivityLink.tenant_id == tenant_id),
    ).filter(
        ActivityLink.module == "software_project",
        ActivityLink.record_id == project_id,
        Activity.activity_type == "Task",
    )
    return {"project_id": str(project_id), **_totals(query)}


@router.get("/projects/{project_id}/tasks")
def project_task_time_report(
    project_id: UUID,
    from_date: date | None = None,
    to_date: date | None = None,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    _check_project(db, tenant_id, project_id)
    query = _entry_base(db, tenant_id, from_date, to_date).join(
        Activity,
        (Activity.id == SoftwareTimeEntry.activity_id)
        & (Activity.tenant_id == SoftwareTimeEntry.tenant_id),
    ).join(
        ActivityLink,
        (ActivityLink.activity_id == Activity.id)
        & (ActivityLink.tenant_id == tenant_id),
    ).filter(
        ActivityLink.module == "software_project",
        ActivityLink.record_id == project_id,
        Activity.activity_type == "Task",
    )
    rows = query.with_entities(
        Activity.id.label("activity_id"),
        Activity.title.label("task_title"),
        Activity.status.label("status"),
        func.coalesce(func.sum(SoftwareTimeEntry.duration_minutes), 0).label("total_minutes"),
        func.coalesce(func.sum(case((SoftwareTimeEntry.is_billable.is_(True), SoftwareTimeEntry.duration_minutes), else_=0)), 0).label("billable_minutes"),
        func.count(SoftwareTimeEntry.id).label("entry_count"),
    ).group_by(Activity.id, Activity.title, Activity.status).order_by(Activity.title).all()
    return {
        "project_id": str(project_id),
        "tasks": [
            {
                "activity_id": str(row.activity_id),
                "task_title": row.task_title,
                "status": row.status,
                "total_minutes": int(row.total_minutes or 0),
                "total_hours": round(int(row.total_minutes or 0) / 60, 2),
                "billable_minutes": int(row.billable_minutes or 0),
                "entry_count": int(row.entry_count or 0),
            }
            for row in rows
        ],
    }


@router.get("/sprints/{sprint_id}/time-summary")
def sprint_time_summary(
    sprint_id: UUID,
    from_date: date | None = None,
    to_date: date | None = None,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    _check_sprint(db, tenant_id, sprint_id)
    query = _entry_base(db, tenant_id, from_date, to_date).join(
        Activity,
        (Activity.id == SoftwareTimeEntry.activity_id)
        & (Activity.tenant_id == SoftwareTimeEntry.tenant_id),
    ).join(
        ActivityLink,
        (ActivityLink.activity_id == Activity.id)
        & (ActivityLink.tenant_id == tenant_id),
    ).filter(
        ActivityLink.module == "software_sprint",
        ActivityLink.record_id == sprint_id,
        Activity.activity_type == "Task",
    )
    return {"sprint_id": str(sprint_id), **_totals(query)}


@router.get("/team/time-summary")
def team_time_summary(
    from_date: date | None = None,
    to_date: date | None = None,
    project_id: UUID | None = None,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    query = _entry_base(db, tenant_id, from_date, to_date)
    if project_id is not None:
        _check_project(db, tenant_id, project_id)
        query = query.join(
            Activity,
            (Activity.id == SoftwareTimeEntry.activity_id)
            & (Activity.tenant_id == SoftwareTimeEntry.tenant_id),
        ).join(
            ActivityLink,
            (ActivityLink.activity_id == Activity.id)
            & (ActivityLink.tenant_id == tenant_id),
        ).filter(
            ActivityLink.module == "software_project",
            ActivityLink.record_id == project_id,
        )
    rows = query.join(
        User,
        (User.id == SoftwareTimeEntry.user_id)
        & (User.tenant_id == SoftwareTimeEntry.tenant_id),
    ).with_entities(
        User.id.label("user_id"),
        User.full_name.label("user_name"),
        func.coalesce(func.sum(SoftwareTimeEntry.duration_minutes), 0).label("total_minutes"),
        func.coalesce(func.sum(case((SoftwareTimeEntry.is_billable.is_(True), SoftwareTimeEntry.duration_minutes), else_=0)), 0).label("billable_minutes"),
        func.count(SoftwareTimeEntry.id).label("entry_count"),
    ).group_by(User.id, User.full_name).order_by(User.full_name).all()
    return {
        "project_id": str(project_id) if project_id else None,
        "team": [
            {
                "user_id": str(row.user_id),
                "user_name": row.user_name,
                "total_minutes": int(row.total_minutes or 0),
                "total_hours": round(int(row.total_minutes or 0) / 60, 2),
                "billable_minutes": int(row.billable_minutes or 0),
                "entry_count": int(row.entry_count or 0),
            }
            for row in rows
        ],
    }


@router.get("/billing/time-summary")
def billing_time_summary(
    from_date: date | None = None,
    to_date: date | None = None,
    project_id: UUID | None = None,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    query = _entry_base(db, tenant_id, from_date, to_date)
    if project_id is not None:
        _check_project(db, tenant_id, project_id)
        query = query.join(
            Activity,
            (Activity.id == SoftwareTimeEntry.activity_id)
            & (Activity.tenant_id == SoftwareTimeEntry.tenant_id),
        ).join(
            ActivityLink,
            (ActivityLink.activity_id == Activity.id)
            & (ActivityLink.tenant_id == tenant_id),
        ).filter(
            ActivityLink.module == "software_project",
            ActivityLink.record_id == project_id,
        )
    return {"project_id": str(project_id) if project_id else None, **_totals(query)}
