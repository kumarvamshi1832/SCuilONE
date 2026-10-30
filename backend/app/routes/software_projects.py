import uuid
from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from app.models.software_sprint import SoftwareSprint
from sqlalchemy.orm import Session
from app.core.industry_modules import require_enabled_module
from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.models.software_contract import SoftwareContract
from app.models.software_project import SoftwareProject
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.software_project import (
    SoftwareProjectCreate,
    SoftwareProjectResponse,
    SoftwareProjectUpdate,
)
from app.services.audit_service import log_audit
from sqlalchemy import func

from app.models.activity import Activity
from app.models.activity_link import ActivityLink


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


def get_project_progress(
    db: Session,
    tenant_id: uuid.UUID,
    project_id: uuid.UUID,
) -> int:
    filters = [
        Activity.tenant_id == tenant_id,
        ActivityLink.tenant_id == tenant_id,
        ActivityLink.module == "software_project",
        ActivityLink.record_id == project_id,
        Activity.activity_type == "Task",
    ]

    total_tasks = (
        db.query(func.count(func.distinct(Activity.id)))
        .join(
            ActivityLink,
            ActivityLink.activity_id == Activity.id,
        )
        .filter(
            *filters,
            Activity.status != "Cancelled",
        )
        .scalar()
        or 0
    )

    if total_tasks == 0:
        return 0

    completed_tasks = (
        db.query(func.count(func.distinct(Activity.id)))
        .join(
            ActivityLink,
            ActivityLink.activity_id == Activity.id,
        )
        .filter(
            *filters,
            Activity.status == "Completed",
        )
        .scalar()
        or 0
    )

    return round((completed_tasks / total_tasks) * 100)


def project_response_with_progress(
    db: Session,
    tenant_id: uuid.UUID,
    project: SoftwareProject,
) -> dict:
    response = SoftwareProjectResponse.model_validate(
        project
    ).model_dump()

    response["progress_percentage"] = get_project_progress(
        db,
        tenant_id,
        project.id,
    )

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