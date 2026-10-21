
from datetime import date, datetime, time, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_active_user
from app.models.lead import Lead
from app.models.deal import Deal
from app.models.activity import Activity
from app.models.pipeline import Pipeline, PipelineStage

router = APIRouter(
    prefix="/api/v1/reports",
    tags=["Reports"],
)

WON_STAGES = {"won", "closed won", "closed_won", "closed-won"}
LOST_STAGES = {"lost", "closed lost", "closed_lost", "closed-lost"}
COMPLETED_STATUSES = {"completed", "complete", "done"}
INACTIVE_TASK_STATUSES = COMPLETED_STATUSES | {"cancelled", "canceled"}


def apply_date_filter(query, model, start_date, end_date):
    if start_date:
        query = query.filter(
            model.created_at >= datetime.combine(start_date, time.min)
        )
    if end_date:
        query = query.filter(
            model.created_at < datetime.combine(
                end_date + timedelta(days=1), time.min
            )
        )
    return query


@router.get("/summary")
def get_reports_summary(
    start_date: date | None = Query(default=None),
    end_date: date | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=400,
            detail="start_date must be before or equal to end_date",
        )

    tenant_id = current_user["tenant_id"]
    now = datetime.utcnow()

    leads = apply_date_filter(
        db.query(Lead).filter(Lead.tenant_id == tenant_id),
        Lead,
        start_date,
        end_date,
    )

    
    deals = apply_date_filter(
        db.query(Deal)
        .outerjoin(
            Pipeline,
            (Pipeline.id == Deal.pipeline_id)
            & (Pipeline.tenant_id == tenant_id),
        )
        .outerjoin(
            PipelineStage,
            (PipelineStage.id == Deal.pipeline_stage_id)
            & (PipelineStage.pipeline_id == Pipeline.id),
        )
        .filter(Deal.tenant_id == tenant_id),
        Deal,
        start_date,
        end_date,
    )

    tasks = apply_date_filter(
        db.query(Activity).filter(
            Activity.tenant_id == tenant_id,
            func.lower(Activity.activity_type) == "task",
        ),
        Activity,
        start_date,
        end_date,
    )

    normalized_stage = func.lower(func.trim(Deal.stage))

    won_condition = or_(
        normalized_stage.in_(WON_STAGES),
        (Pipeline.id.isnot(None) & PipelineStage.is_closed_won.is_(True)),
    )

    lost_condition = or_(
        normalized_stage.in_(LOST_STAGES),
        (Pipeline.id.isnot(None) & PipelineStage.is_closed_lost.is_(True)),
    )

    total_leads = leads.count()
    qualified_leads = leads.filter(
        func.lower(func.trim(Lead.status)) == "qualified"
    ).count()

    total_deals = deals.count()
    won_deals = deals.filter(won_condition).count()
    lost_deals = deals.filter(lost_condition).count()
    open_deals = deals.filter(
        ~won_condition,
        ~lost_condition,
    ).count()

    won_revenue = (
        deals.filter(won_condition)
        .with_entities(func.coalesce(func.sum(Deal.amount), 0))
        .scalar()
    )

    lead_status_rows = (
        leads.with_entities(Lead.status, func.count(Lead.id))
        .group_by(Lead.status)
        .all()
    )

    stage_label = func.coalesce(
        func.nullif(
            func.trim(
                func.coalesce(
                    PipelineStage.name,
                    "",
                )
            ),
            "",
        ),
        Deal.stage,
    )

    pipeline_label = func.coalesce(
        Pipeline.name,
        "Unassigned pipeline",
    )

    pipeline_rows = (
        deals.with_entities(
            pipeline_label.label("pipeline_name"),
            stage_label.label("stage_name"),
            func.count(Deal.id).label("count"),
        )
        .group_by(pipeline_label, stage_label)
        .order_by(pipeline_label, stage_label)
        .all()
    )

    task_total = tasks.count()

    completed_tasks = tasks.filter(
        func.lower(func.trim(Activity.status)).in_(COMPLETED_STATUSES)
    ).count()

    pending_tasks = tasks.filter(
        ~func.lower(func.trim(Activity.status)).in_(INACTIVE_TASK_STATUSES)
    ).count()

    overdue_tasks = tasks.filter(
        Activity.due_date.isnot(None),
        Activity.due_date < now,
        ~func.lower(func.trim(Activity.status)).in_(INACTIVE_TASK_STATUSES),
    ).count()

    task_status_rows = (
        tasks.with_entities(Activity.status, func.count(Activity.id))
        .group_by(Activity.status)
        .all()
    )

    return {
        "filters": {
            "start_date": start_date.isoformat() if start_date else None,
            "end_date": end_date.isoformat() if end_date else None,
        },
        "sales": {
            "total_deals": total_deals,
            "won_deals": won_deals,
            "lost_deals": lost_deals,
            "open_deals": open_deals,
            "won_revenue": float(won_revenue or 0),
        },
        "leads": {
            "total_leads": total_leads,
            "qualified_leads": qualified_leads,
            "conversion_rate": round(
                qualified_leads / total_leads * 100, 2
            ) if total_leads else 0,
            "status_breakdown": [
                {"status": status or "Unspecified", "count": count}
                for status, count in lead_status_rows
            ],
        },
        "pipeline": [
            {
                "pipeline_name": pipeline_name,
                "stage_name": stage_name or "Unspecified",
                "count": count,
            }
            for pipeline_name, stage_name, count in pipeline_rows
        ],
        "tasks": {
            "total_tasks": task_total,
            "pending_tasks": pending_tasks,
            "completed_tasks": completed_tasks,
            "overdue_tasks": overdue_tasks,
            "status_breakdown": [
                {"status": status or "Unspecified", "count": count}
                for status, count in task_status_rows
            ],
        },
    }
