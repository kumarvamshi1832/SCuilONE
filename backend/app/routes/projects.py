from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from app.core.industry_modules import require_enabled_module
from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.models.project import Project
from app.models.building import Building
from app.schemas.project import ProjectCreate, ProjectUpdate, ProjectResponse
from app.services.audit_service import log_audit



router = APIRouter(
    prefix="/api/v1/projects",
    tags=["Projects"],
    dependencies=[
        Depends(require_enabled_module("real_estate_projects")),
    ],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_tenant_and_user(current_user: dict):
    try:
        tenant_id = UUID(str(current_user["tenant_id"]))
        user_id = UUID(str(current_user["user_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid user or tenant context.",
        )

    return tenant_id, user_id


def project_snapshot(project: Project) -> dict:
    return {
        "name": project.name,
        "developer_name": project.developer_name,
        "project_type": project.project_type,
        "city": project.city,
        "state": project.state,
        "construction_status": project.construction_status,
        "status": project.status,
    }


@router.post(
    "/",
    response_model=ProjectResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("project.create"))],
)
def create_project(
    data: ProjectCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    project = Project(
        **data.model_dump(),
        tenant_id=tenant_id,
        created_by=user_id,
    )

    try:
        db.add(project)
        db.flush()

        log_audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="CREATE",
            module="projects",
            record_id=str(project.id),
            description=f"Created project: {project.name}",
            after_data=project_snapshot(project),
        )

        db.commit()
        db.refresh(project)
        return project

    except Exception:
        db.rollback()
        raise


@router.get(
    "/",
    response_model=list[ProjectResponse],
    dependencies=[Depends(require_permission("project.view"))],
)
def list_projects(
    city: str | None = Query(default=None, max_length=100),
    project_type: str | None = Query(default=None, max_length=50),
    project_status: str | None = Query(
        default=None,
        alias="status",
        max_length=30,
    ),
    construction_status: str | None = Query(default=None, max_length=30),
    search: str | None = Query(default=None, max_length=200),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=20, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
):
    tenant_id, _ = get_tenant_and_user(current_user)

    query = db.query(Project).filter(Project.tenant_id == tenant_id)

    if city:
        query = query.filter(Project.city.ilike(f"%{city.strip()}%"))

    if project_type:
        query = query.filter(Project.project_type == project_type)

    if project_status:
        query = query.filter(Project.status == project_status)

    if construction_status:
        query = query.filter(
            Project.construction_status == construction_status
        )

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            Project.name.ilike(term)
            | Project.developer_name.ilike(term)
            | Project.city.ilike(term)
            | Project.address.ilike(term)
        )

    return (
        query.order_by(Project.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get(
    "/{project_id}",
    response_model=ProjectResponse,
    dependencies=[Depends(require_permission("project.view"))],
)
def get_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
):
    tenant_id, _ = get_tenant_and_user(current_user)

    project = db.query(Project).filter(
        Project.id == project_id,
        Project.tenant_id == tenant_id,
    ).first()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    return project


@router.patch(
    "/{project_id}",
    response_model=ProjectResponse,
    dependencies=[Depends(require_permission("project.update"))],
)
def update_project(
    project_id: UUID,
    data: ProjectUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    project = db.query(Project).filter(
        Project.id == project_id,
        Project.tenant_id == tenant_id,
    ).first()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    changes = data.model_dump(exclude_unset=True)

    if not changes:
        return project

    merged = {
        "start_date": project.start_date,
        "expected_completion_date": project.expected_completion_date,
    }
    merged.update(changes)

    start_date = merged["start_date"]
    completion_date = merged["expected_completion_date"]

    if (
        start_date is not None
        and completion_date is not None
        and completion_date < start_date
    ):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Expected completion date cannot be before start date.",
        )

    if changes.get("construction_status") == "Completed" or changes.get("status") == "Completed":
        from app.models.property import Property

        linked_buildings = (
            db.query(Building)
            .filter(Building.tenant_id == tenant_id, Building.project_id == project.id)
            .all()
        )
        pending_buildings = [
            f"{b.name} [{b.construction_status}]"
            for b in linked_buildings
            if (b.construction_status or "").strip() != "Completed"
        ]
        if pending_buildings:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    f"Cannot mark project Completed: {len(pending_buildings)} linked building(s) "
                    f"still pending construction ({', '.join(pending_buildings)})."
                ),
            )

        building_ids = [b.id for b in linked_buildings]
        if building_ids:
            inactive_units = (
                db.query(Property)
                .filter(
                    Property.tenant_id == tenant_id,
                    Property.building_id.in_(building_ids),
                    Property.status == "Inactive",
                )
                .all()
            )
            if inactive_units:
                sample = ", ".join(u.unit_number or u.name for u in inactive_units[:5])
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail=(
                        f"Cannot mark project Completed: {len(inactive_units)} unit(s) are still Inactive "
                        f"and not released for sale ({sample})."
                    ),
                )

    before_data = project_snapshot(project)

    try:
        for field, value in changes.items():
            setattr(project, field, value)

        db.flush()

        log_audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="UPDATE",
            module="projects",
            record_id=str(project.id),
            description=f"Updated project: {project.name}",
            before_data=before_data,
            after_data=project_snapshot(project),
        )

        db.commit()
        db.refresh(project)
        return project

    except Exception:
        db.rollback()
        raise


@router.delete(
    "/{project_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("project.delete"))],
)
def delete_project(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    project = db.query(Project).filter(
        Project.id == project_id,
        Project.tenant_id == tenant_id,
    ).first()

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found.",
        )

    before_data = project_snapshot(project)

    building_count = db.query(Building).filter(
        Building.tenant_id == tenant_id,
        Building.project_id == project.id,
    ).count()

    if building_count:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                f"This project has {building_count} building(s) and cannot "
                "be deleted. Delete its buildings first, or change the "
                "project status instead."
            ),
        )

    try:
        log_audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="DELETE",
            module="projects",
            record_id=str(project.id),
            description=f"Deleted project: {project.name}",
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



@router.get(
    "/{project_id}/summary",
    dependencies=[Depends(require_permission("project.view"))],
)
def get_project_summary(
    project_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
):
    """Live project-wide inventory rollup and verified earnings across all buildings."""
    from decimal import Decimal
    from app.routes.buildings import _compute_building_summary

    tenant_id, _ = get_tenant_and_user(current_user)
    project = (
        db.query(Project)
        .filter(Project.id == project_id, Project.tenant_id == tenant_id)
        .first()
    )
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found.")

    buildings = (
        db.query(Building)
        .filter(Building.tenant_id == tenant_id, Building.project_id == project.id)
        .order_by(Building.name.asc())
        .all()
    )
    building_summaries = [_compute_building_summary(db, tenant_id, b) for b in buildings]

    totals = {
        "actual_buildings": len(building_summaries),
        "actual_units": sum(b["total_units"] for b in building_summaries),
        "available": sum(b["available"] for b in building_summaries),
        "reserved": sum(b["reserved"] for b in building_summaries),
        "booked": sum(b["booked"] for b in building_summaries),
        "sold": sum(b["sold"] for b in building_summaries),
        "rented_or_leased": sum(b["rented_or_leased"] for b in building_summaries),
        "inactive": sum(b["inactive"] for b in building_summaries),
        "total_agreed_value": f"{sum((Decimal(b['total_agreed_value']) for b in building_summaries), Decimal('0.00')):.2f}",
        "verified_sale_collected": f"{sum((Decimal(b['verified_sale_collected']) for b in building_summaries), Decimal('0.00')):.2f}",
        "verified_rental_collected": f"{sum((Decimal(b['verified_rental_collected']) for b in building_summaries), Decimal('0.00')):.2f}",
        "total_earned": f"{sum((Decimal(b['total_earned']) for b in building_summaries), Decimal('0.00')):.2f}",
    }
    return {
        "project_id": str(project.id),
        "project_name": project.name,
        "construction_status": project.construction_status,
        "status": project.status,
        **totals,
        "buildings": building_summaries,
    }
