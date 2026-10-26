
from datetime import datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_active_user
from app.models.lead import Lead
from app.models.contact import Contact
from app.models.account import Account
from app.models.deal import Deal
from app.models.activity import Activity

router = APIRouter(
    prefix="/api/v1/dashboard",
    tags=["Dashboard"],
)

WON_STAGES = {
    "won",
    "closed won",
    "closed_won",
    "closed-won",
}

LOST_STAGES = {
    "lost",
    "closed lost",
    "closed_lost",
    "closed-lost",
}

COMPLETED_STATUSES = {
    "completed",
    "complete",
    "done",
}

INACTIVE_TASK_STATUSES = COMPLETED_STATUSES | {
    "cancelled",
    "canceled",
}


@router.get("/summary")
def get_dashboard_summary(
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
):
    tenant_id = current_user["tenant_id"]
    now = datetime.utcnow()

    leads = db.query(Lead).filter(
        Lead.tenant_id == tenant_id
    )

    contacts = db.query(Contact).filter(
        Contact.tenant_id == tenant_id
    )

    accounts = db.query(Account).filter(
        Account.tenant_id == tenant_id
    )

    deals = db.query(Deal).filter(
        Deal.tenant_id == tenant_id
    )

    tasks = db.query(Activity).filter(
        Activity.tenant_id == tenant_id,
        func.lower(Activity.activity_type) == "task",
    )

    total_leads = leads.count()
    qualified_leads = leads.filter(
        func.lower(func.trim(Lead.status)) == "qualified"
    ).count()

    lead_status_rows = (
        db.query(Lead.status, func.count(Lead.id))
        .filter(Lead.tenant_id == tenant_id)
        .group_by(Lead.status)
        .all()
    )

    deal_stage_rows = (
        db.query(Deal.stage, func.count(Deal.id))
        .filter(Deal.tenant_id == tenant_id)
        .group_by(Deal.stage)
        .all()
    )

    normalized_stage = func.lower(func.trim(Deal.stage))

    won_revenue = (
        db.query(func.coalesce(func.sum(Deal.amount), 0))
        .filter(
            Deal.tenant_id == tenant_id,
            normalized_stage.in_(WON_STAGES),
        )
        .scalar()
    )

    total_deals = deals.count()

    open_deals = deals.filter(
        ~normalized_stage.in_(WON_STAGES | LOST_STAGES)
    ).count()

    completed_tasks = tasks.filter(
        func.lower(func.trim(Activity.status)).in_(
            COMPLETED_STATUSES
        )
    ).count()

    overdue_tasks = tasks.filter(
        Activity.due_date < now,
        Activity.due_date.isnot(None),
        ~func.lower(func.trim(Activity.status)).in_(
            INACTIVE_TASK_STATUSES
        ),
    ).count()

    pending_tasks = tasks.filter(
        ~func.lower(func.trim(Activity.status)).in_(
            INACTIVE_TASK_STATUSES
        ),
        or_(
            Activity.due_date.is_(None),
            Activity.due_date >= now
        ),
    ).count()

    return {
        "summary": {
            "total_leads": total_leads,
            "qualified_leads": qualified_leads,
            "total_contacts": contacts.count(),
            "total_accounts": accounts.count(),
            "total_deals": total_deals,
            "open_deals": open_deals,
            "won_revenue": float(won_revenue or 0),
            "pending_tasks": pending_tasks,
            "completed_tasks": completed_tasks,
            "overdue_tasks": overdue_tasks,
        },
        "lead_status_breakdown": [
            {"status": status, "count": count}
            for status, count in lead_status_rows
        ],
        "deal_stage_breakdown": [
            {"stage": stage, "count": count}
            for stage, count in deal_stage_rows
        ],
    }
