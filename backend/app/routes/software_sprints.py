
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.core.industry_modules import require_enabled_module
from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.models.software_project import SoftwareProject
from app.models.software_sprint import SoftwareSprint
from app.models.tenant import Tenant
from app.schemas.software_sprint import (
    SoftwareSprintCreate,
    SoftwareSprintResponse,
    SoftwareSprintUpdate,
)
from app.services.audit_service import log_audit


router = APIRouter(
    prefix="/api/v1/software-sprints",
    tags=["Software Sprints"],
    dependencies=[
        Depends(require_enabled_module("software_sprints")),
    ],
)


SPRINT_STATUS_TRANSITIONS = {
    "Planned": {"Active", "Cancelled"},
    "Active": {"Completed", "Cancelled"},
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


def require_software_industry(
    db: Session,
    tenant_id: uuid.UUID,
):
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
            detail=(
                "Software Sprints are available only to "
                "software tenants."
            ),
        )


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


def get_sprint_or_404(
    db: Session,
    tenant_id: uuid.UUID,
    sprint_id: uuid.UUID,
):
    sprint = (
        db.query(SoftwareSprint)
        .filter(
            SoftwareSprint.id == sprint_id,
            SoftwareSprint.tenant_id == tenant_id,
        )
        .first()
    )

    if not sprint:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Software sprint not found.",
        )

    return sprint


def sprint_snapshot(sprint: SoftwareSprint) -> dict:
    return {
        "software_project_id": str(sprint.software_project_id),
        "name": sprint.name,
        "goal": sprint.goal,
        "status": sprint.status,
        "start_date": sprint.start_date.isoformat(),
        "end_date": sprint.end_date.isoformat(),
    }


@router.post(
    "",
    response_model=SoftwareSprintResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[
        Depends(require_permission("software_project.create"))
    ],
)
def create_software_sprint(
    payload: SoftwareSprintCreate,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    require_software_industry(db, tenant_id)

    get_project_or_404(
        db,
        tenant_id,
        payload.software_project_id,
    )

    sprint = SoftwareSprint(
        tenant_id=tenant_id,
        software_project_id=payload.software_project_id,
        created_by=user_id,
        name=payload.name,
        goal=payload.goal,
        status=payload.status,
        start_date=payload.start_date,
        end_date=payload.end_date,
    )

    try:
        db.add(sprint)
        db.flush()

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="CREATE",
            module="software_sprints",
            record_id=sprint.id,
            description=f"Created software sprint: {sprint.name}",
            after_data=sprint_snapshot(sprint),
        )

        db.commit()
        db.refresh(sprint)

        return sprint

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A sprint with this name already exists "
                "in this software project."
            ),
        )
    except Exception:
        db.rollback()
        raise


@router.get(
    "",
    response_model=list[SoftwareSprintResponse],
    dependencies=[
        Depends(require_permission("software_project.view"))
    ],
)
def list_software_sprints(
    software_project_id: uuid.UUID | None = None,
    sprint_status: str | None = Query(
        default=None,
        alias="status",
        max_length=20,
    ),
    search: str | None = Query(
        default=None,
        max_length=150,
    ),
    offset: int = Query(default=0, ge=0),
    limit: int = Query(default=50, ge=1, le=100),
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, _ = get_tenant_and_user(current_user)

    require_software_industry(db, tenant_id)

    query = db.query(SoftwareSprint).filter(
        SoftwareSprint.tenant_id == tenant_id
    )

    if software_project_id is not None:
        get_project_or_404(
            db,
            tenant_id,
            software_project_id,
        )

        query = query.filter(
            SoftwareSprint.software_project_id
            == software_project_id
        )

    if sprint_status is not None:
        if sprint_status not in SPRINT_STATUS_TRANSITIONS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid sprint status filter.",
            )

        query = query.filter(
            SoftwareSprint.status == sprint_status
        )

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            SoftwareSprint.name.ilike(term)
            | SoftwareSprint.goal.ilike(term)
        )

    return (
        query.order_by(SoftwareSprint.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )


@router.get(
    "/{sprint_id}",
    response_model=SoftwareSprintResponse,
    dependencies=[
        Depends(require_permission("software_project.view"))
    ],
)
def get_software_sprint(
    sprint_id: uuid.UUID,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, _ = get_tenant_and_user(current_user)

    require_software_industry(db, tenant_id)

    return get_sprint_or_404(
        db,
        tenant_id,
        sprint_id,
    )


@router.patch(
    "/{sprint_id}",
    response_model=SoftwareSprintResponse,
    dependencies=[
        Depends(require_permission("software_project.update"))
    ],
)
def update_software_sprint(
    sprint_id: uuid.UUID,
    payload: SoftwareSprintUpdate,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    require_software_industry(db, tenant_id)

    sprint = get_sprint_or_404(
        db,
        tenant_id,
        sprint_id,
    )

    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        return sprint

    requested_status = changes.get("status")

    if (
        requested_status is not None
        and requested_status != sprint.status
    ):
        allowed = SPRINT_STATUS_TRANSITIONS.get(
            sprint.status,
            set(),
        )

        if requested_status not in allowed:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    f"Cannot change sprint status from "
                    f"'{sprint.status}' to '{requested_status}'."
                ),
            )

    merged_start = changes.get(
        "start_date",
        sprint.start_date,
    )
    merged_end = changes.get(
        "end_date",
        sprint.end_date,
    )

    if merged_end < merged_start:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="End date cannot be before start date.",
        )

    before_data = sprint_snapshot(sprint)

    try:
        for field, value in changes.items():
            setattr(sprint, field, value)

        db.flush()

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="UPDATE",
            module="software_sprints",
            record_id=sprint.id,
            description=f"Updated software sprint: {sprint.name}",
            before_data=before_data,
            after_data=sprint_snapshot(sprint),
        )

        db.commit()
        db.refresh(sprint)

        return sprint

    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "A sprint with this name already exists "
                "in this software project."
            ),
        )
    except Exception:
        db.rollback()
        raise


@router.delete(
    "/{sprint_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[
        Depends(require_permission("software_project.delete"))
    ],
)
def delete_software_sprint(
    sprint_id: uuid.UUID,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    require_software_industry(db, tenant_id)

    sprint = get_sprint_or_404(
        db,
        tenant_id,
        sprint_id,
    )

    before_data = sprint_snapshot(sprint)

    try:
        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="DELETE",
            module="software_sprints",
            record_id=sprint.id,
            description=f"Deleted software sprint: {sprint.name}",
            before_data=before_data,
        )

        db.delete(sprint)
        db.commit()

    except Exception:
        db.rollback()
        raise
