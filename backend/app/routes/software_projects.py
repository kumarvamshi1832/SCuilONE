import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import and_, case, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import require_active_user
from app.core.industry_modules import require_enabled_module
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.activity import Activity
from app.models.activity_link import ActivityLink
from app.models.software_contract import SoftwareContract
from app.models.software_contract_milestone import SoftwareContractMilestone
from app.models.software_project import SoftwareProject
from app.models.software_sprint import SoftwareSprint
from app.models.software_time_entry import SoftwareTimeEntry
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.software_project import (
    ProjectDeliverySummary,
    ProjectTimeSummary,
    ProjectTimeSummaryResponse,
    SoftwareProjectCreate,
    SoftwareProjectResponse,
    SoftwareProjectUpdate,
)
from app.services.audit_service import log_audit

try:
    from app.services.hourly_deal_completion import maybe_mark_hourly_deal_won
except ImportError:
    # Graceful fallback if service is in user's external environment
    def maybe_mark_hourly_deal_won(db, tenant_id, project_id):
        pass


router = APIRouter(
    prefix="/api/v1/software-projects",
    tags=["Software Projects"],
    dependencies=[
        Depends(require_enabled_module("software_projects")),
    ],
)


PROJECT_STATUS_TRANSITIONS = {
    "Planned": {"Active", "On Hold", "Cancelled"},
    "Active": {"On Hold", "Completed", "Cancelled"},
    "On Hold": {"Active", "Cancelled"},
    "Completed": set(),
    "Cancelled": set(),
}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_tenant_and_user(current_user: dict):
    try:
        tenant_id = uuid.UUID(str(current_user["tenant_id"]))
        user_id = uuid.UUID(str(current_user["user_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user or tenant information.",
        )

    return tenant_id, user_id


def require_software_industry(db: Session, tenant_id: uuid.UUID):
    tenant = (
        db.query(Tenant)
        .filter(Tenant.id == tenant_id)
        .first()
    )

    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found.",
        )

    industry = (
        getattr(tenant, "industry", None) or ""
    ).strip().lower()

    allowed_industries = {
        "software",
        "software services",
        "software services / it consulting",
        "software_services",
        "it consulting",
        "it & software",
        "it and software",
        "software companies",
    }

    if industry not in allowed_industries:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Software Projects are available only to software tenants.",
        )


def validate_project_manager(
    db: Session,
    tenant_id: uuid.UUID,
    manager_id: uuid.UUID | None,
):
    if manager_id is None:
        return

    manager = (
        db.query(User)
        .filter(
            User.id == manager_id,
            User.tenant_id == tenant_id,
            User.status == "Active",
        )
        .first()
    )

    if not manager:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Project manager must be active and belong to this tenant."
            ),
        )


def generate_project_number():
    return f"PRJ-{date.today():%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"


def project_snapshot(project: SoftwareProject) -> dict:
    return {
        "project_number": project.project_number,
        "name": project.name,
        "software_contract_id": str(project.software_contract_id),
        "deal_id": str(project.deal_id) if project.deal_id else None,
        "project_manager_id": (
            str(project.project_manager_id)
            if project.project_manager_id
            else None
        ),
        "status": project.status,
        "priority": project.priority,
        "budget": str(project.budget),
        "currency": project.currency,
        "start_date": (
            project.start_date.isoformat()
            if project.start_date
            else None
        ),
        "target_end_date": (
            project.target_end_date.isoformat()
            if project.target_end_date
            else None
        ),
        "actual_end_date": (
            project.actual_end_date.isoformat()
            if project.actual_end_date
            else None
        ),
    }


def get_project_or_404(
    db: Session,
    tenant_id: uuid.UUID,
    project_id: uuid.UUID,
):
    project = (
        db.query(SoftwareProject)
        .filter(
            SoftwareProject.id == project_id,
            SoftwareProject.tenant_id == tenant_id,
        )
        .first()
    )

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Software project not found.",
        )

    return project


def get_project_delivery_summary(
    db: Session,
    tenant_id: uuid.UUID,
    project: SoftwareProject,
) -> dict:
    """Compute real-world CRM project progress and delivery metrics across
    tasks, sprints, contract milestones, and project lifecycle status.
    """
    # 1. Sprint metrics
    sprints = (
        db.query(SoftwareSprint.id, SoftwareSprint.status)
        .filter(
            SoftwareSprint.tenant_id == tenant_id,
            SoftwareSprint.software_project_id == project.id,
            SoftwareSprint.status != "Cancelled",
        )
        .all()
    )
    total_sprints = len(sprints)
    completed_sprints = sum(1 for s in sprints if s.status == "Completed")
    active_sprints = sum(1 for s in sprints if s.status in {"Planned", "Active"})
    sprint_completion_pct = (
        round((completed_sprints / total_sprints) * 100)
        if total_sprints > 0
        else 0
    )

    # 2. Task metrics (across project and non-cancelled sprints)
    all_project_sprint_ids = (
        db.query(SoftwareSprint.id)
        .filter(
            SoftwareSprint.tenant_id == tenant_id,
            SoftwareSprint.software_project_id == project.id,
        )
        .subquery()
    )

    task_filter = [
        Activity.tenant_id == tenant_id,
        ActivityLink.tenant_id == tenant_id,
        Activity.activity_type == "Task",
        or_(
            and_(
                ActivityLink.module == "software_project",
                ActivityLink.record_id == project.id,
            ),
            and_(
                ActivityLink.module == "software_sprint",
                ActivityLink.record_id.in_(db.query(all_project_sprint_ids.c.id)),
            ),
        ),
    ]

    total_tasks = (
        db.query(func.count(func.distinct(Activity.id)))
        .join(
            ActivityLink,
            ActivityLink.activity_id == Activity.id,
        )
        .filter(
            *task_filter,
            Activity.status != "Cancelled",
        )
        .scalar()
        or 0
    )

    completed_tasks = (
        (
            db.query(func.count(func.distinct(Activity.id)))
            .join(
                ActivityLink,
                ActivityLink.activity_id == Activity.id,
            )
            .filter(
                *task_filter,
                Activity.status == "Completed",
            )
            .scalar()
            or 0
        )
        if total_tasks > 0
        else 0
    )
    open_tasks = max(total_tasks - completed_tasks, 0)
    task_completion_pct = (
        round((completed_tasks / total_tasks) * 100)
        if total_tasks > 0
        else 0
    )

    # 3. Contract Milestone metrics (Fixed Price contracts)
    milestones = (
        db.query(SoftwareContractMilestone)
        .filter(
            SoftwareContractMilestone.tenant_id == tenant_id,
            SoftwareContractMilestone.contract_id == project.software_contract_id,
        )
        .all()
    )
    total_milestones = len(milestones)
    completed_milestones = sum(
        1 for m in milestones if m.status in {"Ready", "Invoiced", "Paid"}
    )
    milestone_completion_pct = (
        min(
            round(
                sum(
                    float(m.percentage)
                    for m in milestones
                    if m.status in {"Ready", "Invoiced", "Paid"}
                )
            ),
            100,
        )
        if total_milestones > 0
        else 0
    )

    # 4. Overall Project Progress Calculation (Real-World CRM Lifecycle Rules)
    if project.status in {"Planned", "Cancelled"}:
        overall_progress = 0
    elif project.status == "Completed":
        overall_progress = 100
    else:
        # Project is Active or On Hold
        signals: list[float] = []
        if total_milestones > 0:
            signals.append(float(milestone_completion_pct))
        if total_sprints > 0:
            signals.append((completed_sprints / total_sprints) * 100.0)
        if total_tasks > 0:
            raw_task_pct = (completed_tasks / total_tasks) * 100.0
            # Prevent the "1 finished task = 100% project progress" trap when
            # early in a project with fewer than 5 tasks and no sprints/milestones.
            if total_sprints == 0 and total_milestones == 0 and total_tasks < 5:
                dampened_task_pct = min(raw_task_pct, completed_tasks * 20.0)
                signals.append(dampened_task_pct)
            else:
                signals.append(raw_task_pct)

        if not signals:
            overall_progress = 0
        else:
            # Cap at 95% until the project manager formally transitions status to Completed
            overall_progress = min(round(sum(signals) / len(signals)), 95)

    return {
        "progress_percentage": overall_progress,
        "total_tasks": total_tasks,
        "completed_tasks": completed_tasks,
        "open_tasks": open_tasks,
        "task_completion_percentage": task_completion_pct,
        "total_sprints": total_sprints,
        "completed_sprints": completed_sprints,
        "active_sprints": active_sprints,
        "sprint_completion_percentage": sprint_completion_pct,
        "total_milestones": total_milestones,
        "completed_milestones": completed_milestones,
        "milestone_completion_percentage": milestone_completion_pct,
    }


def get_project_progress(
    db: Session,
    tenant_id: uuid.UUID,
    project_or_id: SoftwareProject | uuid.UUID,
) -> int:
    if isinstance(project_or_id, SoftwareProject):
        project = project_or_id
    else:
        project = (
            db.query(SoftwareProject)
            .filter(
                SoftwareProject.id == project_or_id,
                SoftwareProject.tenant_id == tenant_id,
            )
            .first()
        )
        if not project:
            return 0

    return get_project_delivery_summary(db, tenant_id, project)[
        "progress_percentage"
    ]


def validate_project_completion_readiness(
    db: Session,
    tenant_id: uuid.UUID,
    project: SoftwareProject,
):
    """Ensure a project cannot be marked Completed while it still has open sprints or tasks."""
    delivery = get_project_delivery_summary(db, tenant_id, project)
    if delivery["active_sprints"] > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot mark project as Completed while {delivery['active_sprints']} "
                "sprint(s) are still Planned or Active. Complete or cancel open sprints first."
            ),
        )
    if delivery["open_tasks"] > 0:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"Cannot mark project as Completed while {delivery['open_tasks']} "
                "linked task(s) are still Pending or In Progress. Complete or cancel open tasks first."
            ),
        )


def get_project_time_summary(
    db: Session,
    tenant_id: uuid.UUID,
    project_id: uuid.UUID,
) -> dict:
    sprint_ids = (
        db.query(SoftwareSprint.id)
        .filter(
            SoftwareSprint.tenant_id == tenant_id,
            SoftwareSprint.software_project_id == project_id,
        )
        .subquery()
    )

    task_ids = (
        db.query(Activity.id)
        .join(
            ActivityLink,
            (ActivityLink.activity_id == Activity.id)
            & (ActivityLink.tenant_id == tenant_id),
        )
        .filter(
            Activity.tenant_id == tenant_id,
            Activity.activity_type == "Task",
            or_(
                and_(
                    ActivityLink.module == "software_project",
                    ActivityLink.record_id == project_id,
                ),
                and_(
                    ActivityLink.module == "software_sprint",
                    ActivityLink.record_id.in_(db.query(sprint_ids.c.id)),
                ),
            ),
        )
        .distinct()
        .subquery()
    )

    row = (
        db.query(
            func.coalesce(func.sum(SoftwareTimeEntry.duration_minutes), 0).label(
                "total_tracked_minutes"
            ),
            func.coalesce(
                func.sum(
                    case(
                        (
                            and_(
                                SoftwareTimeEntry.is_billable.is_(True),
                                SoftwareTimeEntry.billing_status == "Approved",
                            ),
                            SoftwareTimeEntry.duration_minutes,
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("approved_billable_minutes"),
            func.coalesce(
                func.sum(
                    case(
                        (
                            SoftwareTimeEntry.is_billable.is_(False),
                            SoftwareTimeEntry.duration_minutes,
                        ),
                        else_=0,
                    )
                ),
                0,
            ).label("non_billable_minutes"),
        )
        .filter(
            SoftwareTimeEntry.tenant_id == tenant_id,
            SoftwareTimeEntry.activity_id.in_(db.query(task_ids.c.id)),
            SoftwareTimeEntry.duration_minutes.isnot(None),
            SoftwareTimeEntry.duration_minutes > 0,
            ~and_(
                SoftwareTimeEntry.source == "timer",
                SoftwareTimeEntry.stopped_at.is_(None),
            ),
        )
        .first()
    )

    total_mins = (
        int(row.total_tracked_minutes)
        if row and row.total_tracked_minutes
        else 0
    )
    approved_billable_mins = (
        int(row.approved_billable_minutes)
        if row and row.approved_billable_minutes
        else 0
    )
    non_billable_mins = (
        int(row.non_billable_minutes)
        if row and row.non_billable_minutes
        else 0
    )

    return {
        "total_tracked_minutes": total_mins,
        "total_tracked_hours": round(total_mins / 60.0, 2),
        "approved_billable_minutes": approved_billable_mins,
        "approved_billable_hours": round(approved_billable_mins / 60.0, 2),
        "non_billable_minutes": non_billable_mins,
        "non_billable_hours": round(non_billable_mins / 60.0, 2),
    }


def project_response_with_progress(
    db: Session,
    tenant_id: uuid.UUID,
    project: SoftwareProject,
) -> dict:
    response = SoftwareProjectResponse.model_validate(
        project
    ).model_dump()

    delivery = get_project_delivery_summary(
        db,
        tenant_id,
        project,
    )
    response["progress_percentage"] = delivery["progress_percentage"]
    response["total_tasks"] = delivery["total_tasks"]
    response["completed_tasks"] = delivery["completed_tasks"]
    response["open_tasks"] = delivery["open_tasks"]
    response["task_completion_percentage"] = delivery["task_completion_percentage"]
    response["total_sprints"] = delivery["total_sprints"]
    response["completed_sprints"] = delivery["completed_sprints"]
    response["active_sprints"] = delivery["active_sprints"]
    response["sprint_completion_percentage"] = delivery["sprint_completion_percentage"]
    response["total_milestones"] = delivery["total_milestones"]
    response["completed_milestones"] = delivery["completed_milestones"]
    response["milestone_completion_percentage"] = delivery["milestone_completion_percentage"]
    response["delivery_summary"] = {
        k: v for k, v in delivery.items() if k != "progress_percentage"
    }

    summary = get_project_time_summary(
        db,
        tenant_id,
        project.id,
    )
    response["time_summary"] = summary
    response["total_tracked_minutes"] = summary["total_tracked_minutes"]
    response["total_tracked_hours"] = summary["total_tracked_hours"]
    response["approved_billable_minutes"] = summary["approved_billable_minutes"]
    response["approved_billable_hours"] = summary["approved_billable_hours"]
    response["non_billable_minutes"] = summary["non_billable_minutes"]
    response["non_billable_hours"] = summary["non_billable_hours"]

    return response


@router.post(
    "",
    response_model=SoftwareProjectResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(require_permission("software_project.create"))
    ],
)
def create_software_project(
    payload: SoftwareProjectCreate,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, user_id = get_tenant_and_user(current_user)
    require_software_industry(db, tenant_id)

    contract = (
        db.query(SoftwareContract)
        .filter(
            SoftwareContract.id == payload.software_contract_id,
            SoftwareContract.tenant_id == tenant_id,
        )
        .with_for_update()
        .first()
    )

    if not contract:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Software contract not found.",
        )

    if contract.status not in {"Signed", "Active"}:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "A software project can only be created from a "
                "Signed or Active contract."
            ),
        )

    existing_project = (
        db.query(SoftwareProject)
        .filter(
            SoftwareProject.tenant_id == tenant_id,
            SoftwareProject.software_contract_id == contract.id,
        )
        .first()
    )

    if existing_project:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="A project already exists for this contract.",
        )

    manager_id = (
        payload.project_manager_id
        if payload.project_manager_id is not None
        else contract.assigned_to
    )

    validate_project_manager(db, tenant_id, manager_id)

    start_date = (
        payload.start_date
        if payload.start_date is not None
        else contract.start_date
    )

    target_end_date = (
        payload.target_end_date
        if payload.target_end_date is not None
        else contract.end_date
    )

    if (
        start_date is not None
        and target_end_date is not None
        and target_end_date < start_date
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Target end date cannot be before start date.",
        )

    project = SoftwareProject(
        tenant_id=tenant_id,
        created_by=user_id,
        software_contract_id=contract.id,
        deal_id=contract.deal_id,
        project_manager_id=manager_id,
        project_number=(
            payload.project_number or generate_project_number()
        ),
        name=payload.name or contract.title,
        description=(
            payload.description
            if payload.description is not None
            else contract.description
        ),
        scope_of_work=contract.scope_of_work,
        deliverables=contract.deliverables,
        status="Planned",
        priority=payload.priority,
        budget=Decimal(str(contract.contract_value)),
        currency=contract.currency,
        start_date=start_date,
        target_end_date=target_end_date,
        contract_snapshot={
            "contract_id": str(contract.id),
            "contract_number": contract.contract_number,
            "title": contract.title,
            "contract_value": str(contract.contract_value),
            "currency": contract.currency,
            "scope_of_work": contract.scope_of_work,
            "deliverables": contract.deliverables,
            "start_date": (
                contract.start_date.isoformat()
                if contract.start_date
                else None
            ),
            "end_date": (
                contract.end_date.isoformat()
                if contract.end_date
                else None
            ),
        },
        notes=payload.notes,
    )

    try:
        db.add(project)
        db.flush()

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="CREATE",
            module="software_projects",
            record_id=project.id,
            description=f"Created software project: {project.name}",
            after_data=project_snapshot(project),
        )

        # Hourly Deals are won only after project completion and billing settlement.
        if project.status == "Completed":
            maybe_mark_hourly_deal_won(db, tenant_id, project.id)

        db.commit()
        db.refresh(project)
        return project_response_with_progress(
            db,
            tenant_id,
            project,
        )

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "The project number already exists or this contract "
                "already has a project."
            ),
        )
    except Exception:
        db.rollback()
        raise


@router.get(
    "",
    response_model=list[SoftwareProjectResponse],
    dependencies=[
        Depends(require_permission("software_project.view"))
    ],
)
def list_software_projects(
    project_status: str | None = Query(
        default=None,
        alias="status",
        max_length=30,
    ),
    priority: str | None = Query(default=None, max_length=20),
    project_manager_id: uuid.UUID | None = None,
    software_contract_id: uuid.UUID | None = None,
    deal_id: uuid.UUID | None = None,
    search: str | None = Query(default=None, max_length=200),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, _ = get_tenant_and_user(current_user)
    require_software_industry(db, tenant_id)

    query = db.query(SoftwareProject).filter(
        SoftwareProject.tenant_id == tenant_id
    )

    if project_status:
        if project_status not in PROJECT_STATUS_TRANSITIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid project status filter.",
            )
        query = query.filter(SoftwareProject.status == project_status)

    if priority:
        if priority not in {"Low", "Medium", "High", "Critical"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid project priority filter.",
            )
        query = query.filter(SoftwareProject.priority == priority)

    if project_manager_id:
        query = query.filter(
            SoftwareProject.project_manager_id == project_manager_id
        )

    if software_contract_id:
        query = query.filter(
            SoftwareProject.software_contract_id == software_contract_id
        )

    if deal_id:
        query = query.filter(SoftwareProject.deal_id == deal_id)

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            SoftwareProject.name.ilike(term)
            | SoftwareProject.project_number.ilike(term)
            | SoftwareProject.description.ilike(term)
        )

    projects = (
        query.order_by(SoftwareProject.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return [
        project_response_with_progress(db, tenant_id, project)
        for project in projects
    ]


@router.get(
    "/{project_id}",
    response_model=SoftwareProjectResponse,
    dependencies=[
        Depends(require_permission("software_project.view"))
    ],
)
def get_software_project(
    project_id: uuid.UUID,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, _ = get_tenant_and_user(current_user)
    require_software_industry(db, tenant_id)

    project = get_project_or_404(
        db,
        tenant_id,
        project_id,
    )

    return project_response_with_progress(
        db,
        tenant_id,
        project,
    )


@router.get(
    "/{project_id}/time-summary",
    response_model=ProjectTimeSummaryResponse,
    dependencies=[
        Depends(require_permission("software_project.view"))
    ],
)
def get_software_project_time_summary(
    project_id: uuid.UUID,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, _ = get_tenant_and_user(current_user)
    require_software_industry(db, tenant_id)

    project = get_project_or_404(
        db,
        tenant_id,
        project_id,
    )

    summary = get_project_time_summary(
        db,
        tenant_id,
        project.id,
    )

    return {
        "project_id": project.id,
        "project_number": project.project_number,
        "name": project.name,
        **summary,
    }


@router.patch(
    "/{project_id}",
    response_model=SoftwareProjectResponse,
    dependencies=[
        Depends(require_permission("software_project.update"))
    ],
)
def update_software_project(
    project_id: uuid.UUID,
    payload: SoftwareProjectUpdate,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, user_id = get_tenant_and_user(current_user)
    require_software_industry(db, tenant_id)

    project = get_project_or_404(db, tenant_id, project_id)
    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        return project_response_with_progress(
            db,
            tenant_id,
            project,
        )

    if "project_manager_id" in changes:
        validate_project_manager(
            db,
            tenant_id,
            changes["project_manager_id"],
        )

    requested_status = changes.get("status")

    if requested_status is not None and requested_status != project.status:
        allowed = PROJECT_STATUS_TRANSITIONS.get(project.status, set())

        if requested_status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot change project status from "
                    f"'{project.status}' to '{requested_status}'."
                ),
            )

        if requested_status == "Completed":
            validate_project_completion_readiness(db, tenant_id, project)

    merged_start = changes.get("start_date", project.start_date)
    merged_target = changes.get(
        "target_end_date",
        project.target_end_date,
    )
    merged_actual = changes.get(
        "actual_end_date",
        project.actual_end_date,
    )

    if (
        merged_start is not None
        and merged_target is not None
        and merged_target < merged_start
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Target end date cannot be before start date.",
        )

    if (
        merged_start is not None
        and merged_actual is not None
        and merged_actual < merged_start
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Actual end date cannot be before start date.",
        )

    if requested_status == "Completed" and not merged_actual:
        changes["actual_end_date"] = date.today()

    before_data = project_snapshot(project)

    try:
        for field, value in changes.items():
            setattr(project, field, value)

        db.flush()

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="UPDATE",
            module="software_projects",
            record_id=project.id,
            description=f"Updated software project: {project.name}",
            before_data=before_data,
            after_data=project_snapshot(project),
        )

        # Hourly Deals are won only after project completion and billing settlement.
        if project.status == "Completed":
            maybe_mark_hourly_deal_won(db, tenant_id, project.id)

        db.commit()
        db.refresh(project)
        return project_response_with_progress(
            db,
            tenant_id,
            project,
        )

    except Exception:
        db.rollback()
        raise


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[
        Depends(require_permission("software_project.delete"))
    ],
)
def delete_software_project(
    project_id: uuid.UUID,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, user_id = get_tenant_and_user(current_user)
    require_software_industry(db, tenant_id)

    project = get_project_or_404(db, tenant_id, project_id)
    before_data = project_snapshot(project)

    sprint_count = (
        db.query(SoftwareSprint)
        .filter(
            SoftwareSprint.tenant_id == tenant_id,
            SoftwareSprint.software_project_id == project.id,
        )
        .count()
    )

    if sprint_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This project has {sprint_count} sprint(s) and cannot "
                "be deleted. Delete its sprints first, or set the project "
                "status to Cancelled instead."
            ),
        )

    try:
        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="DELETE",
            module="software_projects",
            record_id=project.id,
            description=f"Deleted software project: {project.name}",
            before_data=before_data,
        )

        db.delete(project)
        db.commit()

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "This record is still referenced by other records "
                "and cannot be deleted."
            ),
        )
    except Exception:
        db.rollback()
        raise