"""Task center: overdue / due today / upcoming lists, follow-up gaps, quick actions.

Tasks are the existing Activity records (Task, Call, Meeting) that already carry a due date,
an owner (assigned_to) and links to a lead, contact, account or deal.
"""
from datetime import datetime, timedelta
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import exists, func
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_active_user
from app.core.permissions import require_permission
from app.models.activity import Activity
from app.models.deal import Deal
from app.models.lead import Lead
from app.models.user import User
from app.services.audit_service import log_audit
from app.services.lead_assignment import ACTIVE_LEAD_STATUSES
from app.services.notification_service import notify_assignment

router = APIRouter(prefix="/api/v1/tasks", tags=["Task Center"])

INACTIVE = {"completed", "complete", "done", "cancelled", "canceled"}
View = Literal["open", "overdue", "today", "upcoming", "completed", "all"]


def _status_norm():
    return func.lower(func.trim(Activity.status))


def _day_bounds(now: datetime) -> tuple[datetime, datetime]:
    start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    return start, start + timedelta(days=1)


def _scoped(db: Session, tenant_id: UUID):
    return db.query(Activity).filter(Activity.tenant_id == tenant_id)


def _apply_view(q, view: str, now: datetime, upcoming_days: int):
    day_start, day_end = _day_bounds(now)
    open_ = ~_status_norm().in_(INACTIVE)
    if view == "open":
        return q.filter(open_)
    if view == "overdue":
        return q.filter(open_, Activity.due_date.isnot(None), Activity.due_date < now)
    if view == "today":
        return q.filter(open_, Activity.due_date >= day_start, Activity.due_date < day_end)
    if view == "upcoming":
        return q.filter(open_, Activity.due_date >= day_end, Activity.due_date < day_end + timedelta(days=upcoming_days))
    if view == "completed":
        return q.filter(_status_norm().in_({"completed", "complete", "done"}))
    return q


def _serialize(db: Session, tenant_id: UUID, rows: list[Activity], now: datetime) -> list[dict]:
    user_ids = {r.assigned_to for r in rows if r.assigned_to}
    lead_ids = {r.lead_id for r in rows if r.lead_id}
    deal_ids = {r.deal_id for r in rows if r.deal_id}
    users = {u.id: u.full_name for u in db.query(User.id, User.full_name).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    leads = {l.id: l.full_name for l in db.query(Lead.id, Lead.full_name).filter(Lead.tenant_id == tenant_id, Lead.id.in_(lead_ids)).all()} if lead_ids else {}
    deals = {d.id: d.name for d in db.query(Deal.id, Deal.name).filter(Deal.tenant_id == tenant_id, Deal.id.in_(deal_ids)).all()} if deal_ids else {}
    out = []
    for r in rows:
        is_open = (r.status or "").strip().lower() not in INACTIVE
        overdue = bool(is_open and r.due_date and r.due_date < now)
        out.append({
            "id": r.id, "title": r.title, "activity_type": r.activity_type, "status": r.status,
            "priority": r.priority, "due_date": r.due_date,
            "assigned_to": r.assigned_to, "assigned_to_name": users.get(r.assigned_to),
            "lead_id": r.lead_id, "lead_name": leads.get(r.lead_id),
            "deal_id": r.deal_id, "deal_name": deals.get(r.deal_id),
            "contact_id": r.contact_id, "account_id": r.account_id,
            "is_overdue": overdue,
            "days_overdue": (now - r.due_date).days if overdue else 0,
        })
    return out


@router.get("")
def list_tasks(
    view: View = "open",
    mine: bool = False,
    assigned_to: UUID | None = None,
    lead_id: UUID | None = None,
    deal_id: UUID | None = None,
    contact_id: UUID | None = None,
    account_id: UUID | None = None,
    priority: Literal["Low", "Medium", "High"] | None = None,
    activity_type: Literal["Task", "Call", "Meeting"] | None = None,
    upcoming_days: int = Query(default=7, ge=1, le=60),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    now = datetime.utcnow()
    q = _apply_view(_scoped(db, tenant_id), view, now, upcoming_days)
    if mine:
        q = q.filter(Activity.assigned_to == UUID(str(current_user["user_id"])))
    elif assigned_to:
        q = q.filter(Activity.assigned_to == assigned_to)
    for col, val in ((Activity.lead_id, lead_id), (Activity.deal_id, deal_id),
                     (Activity.contact_id, contact_id), (Activity.account_id, account_id),
                     (Activity.priority, priority), (Activity.activity_type, activity_type)):
        if val:
            q = q.filter(col == val)
    order = Activity.updated_at.desc() if view == "completed" else (Activity.due_date.asc().nullslast(), Activity.created_at.desc())
    q = q.order_by(*order) if isinstance(order, tuple) else q.order_by(order)
    return _serialize(db, tenant_id, q.offset(skip).limit(limit).all(), now)


@router.get("/summary")
def task_summary(
    mine: bool = False,
    upcoming_days: int = Query(default=7, ge=1, le=60),
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))
    now = datetime.utcnow()

    def scoped():
        q = _scoped(db, tenant_id)
        return q.filter(Activity.assigned_to == user_id) if mine else q

    counts = {v: _apply_view(scoped(), v, now, upcoming_days).count() for v in ("open", "overdue", "today", "upcoming")}
    no_due = scoped().filter(~_status_norm().in_(INACTIVE), Activity.due_date.is_(None)).count()
    done_week = scoped().filter(
        _status_norm().in_({"completed", "complete", "done"}), Activity.updated_at >= now - timedelta(days=7)
    ).count()

    result = {
        "open": counts["open"], "overdue": counts["overdue"], "due_today": counts["today"],
        "upcoming": counts["upcoming"], "upcoming_days": upcoming_days,
        "open_without_due_date": no_due, "completed_last_7_days": done_week,
    }
    if not mine:
        rows = (
            _apply_view(
                db.query(Activity.assigned_to, func.count(Activity.id)).filter(Activity.tenant_id == tenant_id),
                "overdue", now, upcoming_days,
            ).group_by(Activity.assigned_to).order_by(func.count(Activity.id).desc()).limit(10).all()
        )
        ids = [r[0] for r in rows if r[0]]
        names = {u.id: u.full_name for u in db.query(User.id, User.full_name).filter(User.id.in_(ids)).all()} if ids else {}
        result["overdue_by_assignee"] = [
            {"user_id": uid, "user_name": names.get(uid, "Unassigned") if uid else "Unassigned", "overdue": n}
            for uid, n in rows
        ]
    return result


def _open_task_exists(tenant_id: UUID):
    return exists().where(
        Activity.lead_id == Lead.id, Activity.tenant_id == tenant_id, ~_status_norm().in_(INACTIVE)
    )


@router.get("/leads-without-follow-up")
def leads_without_follow_up(
    mine: bool = False,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.view")),
    db: Session = Depends(get_db),
):
    """Active leads (New/Contacted/Qualified) that have no open task: nobody is following them up."""
    tenant_id = UUID(str(current_user["tenant_id"]))
    q = db.query(Lead).filter(
        Lead.tenant_id == tenant_id, Lead.status.in_(ACTIVE_LEAD_STATUSES), ~_open_task_exists(tenant_id)
    )
    if mine:
        q = q.filter(Lead.assigned_to == UUID(str(current_user["user_id"])))
    total = q.count()
    leads = q.order_by(Lead.score.desc(), Lead.created_at.asc()).offset(skip).limit(limit).all()
    return {
        "total": total,
        "leads": [
            {"id": l.id, "full_name": l.full_name, "status": l.status, "assigned_to": l.assigned_to,
             "score": l.score, "score_label": l.score_label, "created_at": l.created_at}
            for l in leads
        ],
    }


def _get_task(db: Session, tenant_id: UUID, task_id: UUID) -> Activity:
    task = db.query(Activity).filter(Activity.id == task_id, Activity.tenant_id == tenant_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/{task_id}/complete")
def complete_task(
    task_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.update")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))
    task = _get_task(db, tenant_id, task_id)
    if (task.status or "").strip().lower() in {"completed", "complete", "done"}:
        return _serialize(db, tenant_id, [task], datetime.utcnow())[0]
    old_status = task.status
    task.status = "Completed"
    log_audit(db, tenant_id, user_id, "update", "activities", task.id,
              description=f"Completed activity {task.title}",
              before_data={"status": old_status}, after_data={"status": "Completed"})
    db.commit()
    db.refresh(task)
    if task.activity_type == "Task" and task.created_by and task.created_by != user_id:
        notify_assignment(
            db=db, tenant_id=tenant_id, recipient_user_id=task.created_by, actor_user_id=user_id,
            title="Task updated", message=f'Task "{task.title}" was marked Completed.',
            related_module="activities", related_record_id=task.id, notification_type="task_update",
        )
    return _serialize(db, tenant_id, [task], datetime.utcnow())[0]


class SnoozeRequest(BaseModel):
    days: int = Field(default=1, ge=1, le=30)


@router.post("/{task_id}/snooze")
def snooze_task(
    task_id: UUID,
    payload: SnoozeRequest,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.update")),
    db: Session = Depends(get_db),
):
    """Move the due date forward by N days (from now if it is overdue or has no date)."""
    tenant_id = UUID(str(current_user["tenant_id"]))
    task = _get_task(db, tenant_id, task_id)
    if (task.status or "").strip().lower() in INACTIVE:
        raise HTTPException(status_code=409, detail="Completed or cancelled tasks cannot be snoozed.")
    now = datetime.utcnow()
    base = task.due_date if task.due_date and task.due_date > now else now
    before = task.due_date
    task.due_date = base + timedelta(days=payload.days)
    log_audit(db, tenant_id, current_user["user_id"], "update", "activities", task.id,
              description=f"Snoozed activity {task.title} by {payload.days} day(s)",
              before_data={"due_date": str(before)}, after_data={"due_date": str(task.due_date)})
    db.commit()
    db.refresh(task)
    return _serialize(db, tenant_id, [task], now)[0]
