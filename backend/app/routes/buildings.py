import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.models.building import Building
from app.models.project import Project
from app.schemas.building import (
    BuildingCreate,
    BuildingResponse,
    BuildingUpdate,
)
from app.services.audit_service import log_audit


router = APIRouter(prefix="/api/v1/buildings", tags=["Buildings"])


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


def building_snapshot(building: Building) -> dict:
    return {
        "project_id": str(building.project_id),
        "name": building.name,
        "building_code": building.building_code,
        "building_type": building.building_type,
        "description": building.description,
        "total_floors": building.total_floors,
        "total_units": building.total_units,
        "construction_status": building.construction_status,
        "start_date": (
            building.start_date.isoformat() if building.start_date else None
        ),
        "expected_completion_date": (
            building.expected_completion_date.isoformat()
            if building.expected_completion_date
            else None
        ),
        "status": building.status,
    }


def get_project_or_404(
    db: Session,
    project_id: uuid.UUID,
    tenant_id: uuid.UUID,
) -> Project:
    project = (
        db.query(Project)
        .filter(
            Project.id == project_id,
            Project.tenant_id == tenant_id,
        )
        .first()
    )

    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Project not found",
        )

    return project


def get_building_or_404(
    db: Session,
    building_id: uuid.UUID,
    tenant_id: uuid.UUID,
) -> Building:
    building = (
        db.query(Building)
        .filter(
            Building.id == building_id,
            Building.tenant_id == tenant_id,
        )
        .first()
    )

    if not building:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Building not found",
        )

    return building


@router.post(
    "/",
    response_model=BuildingResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_building(
    payload: BuildingCreate,
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _: None = Depends(require_permission("building.create")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    get_project_or_404(db, payload.project_id, tenant_id)

    building = Building(
        tenant_id=tenant_id,
        created_by=user_id,
        **payload.model_dump(),
    )

    try:
        db.add(building)
        db.flush()

        log_audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="create",
            module="buildings",
            record_id=str(building.id),
            description=f"Created building: {building.name}",
            after_data=building_snapshot(building),
        )

        db.commit()
        db.refresh(building)
        return building

    except Exception:
        db.rollback()
        raise


@router.get("/", response_model=list[BuildingResponse])
def list_buildings(
    project_id: uuid.UUID | None = None,
    city: str | None = None,
    building_type: str | None = None,
    construction_status: str | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    search: str | None = None,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _: None = Depends(require_permission("building.view")),
):
    tenant_id, _user_id = get_tenant_and_user(current_user)

    query = (
        db.query(Building)
        .join(Project, Building.project_id == Project.id)
        .filter(
            Building.tenant_id == tenant_id,
            Project.tenant_id == tenant_id,
        )
    )

    if project_id:
        query = query.filter(Building.project_id == project_id)

    if city:
        query = query.filter(Project.city.ilike(f"%{city.strip()}%"))

    if building_type:
        query = query.filter(Building.building_type == building_type)

    if construction_status:
        query = query.filter(
            Building.construction_status == construction_status
        )

    if status_filter:
        query = query.filter(Building.status == status_filter)

    if search:
        term = f"%{search.strip()}%"
        query = query.filter(
            or_(
                Building.name.ilike(term),
                Building.building_code.ilike(term),
                Project.name.ilike(term),
            )
        )

    return (
        query.order_by(Building.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/{building_id}", response_model=BuildingResponse)
def get_building(
    building_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _: None = Depends(require_permission("building.view")),
):
    tenant_id, _user_id = get_tenant_and_user(current_user)

    building = get_building_or_404(db, building_id, tenant_id)
    get_project_or_404(db, building.project_id, tenant_id)

    return building


@router.patch("/{building_id}", response_model=BuildingResponse)
def update_building(
    building_id: uuid.UUID,
    payload: BuildingUpdate,
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _: None = Depends(require_permission("building.update")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    building = get_building_or_404(db, building_id, tenant_id)
    before_data = building_snapshot(building)
    changes = payload.model_dump(exclude_unset=True)

    if "project_id" in changes:
        if changes["project_id"] is None:
            raise HTTPException(
                status_code=422,
                detail="project_id cannot be null",
            )

        get_project_or_404(db, changes["project_id"], tenant_id)

    for field, value in changes.items():
        setattr(building, field, value)

    # Validate date consistency against the complete updated record.
    start_date = building.start_date
    completion_date = building.expected_completion_date

    if start_date and completion_date and completion_date < start_date:
        raise HTTPException(
            status_code=422,
            detail="Expected completion date cannot be before the start date",
        )

    try:
        log_audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="update",
            module="buildings",
            record_id=str(building.id),
            description=f"Updated building: {building.name}",
            before_data=before_data,
            after_data=building_snapshot(building),
        )

        db.commit()
        db.refresh(building)
        return building

    except Exception:
        db.rollback()
        raise


@router.delete("/{building_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_building(
    building_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user=Depends(require_active_user),
    _: None = Depends(require_permission("building.delete")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    building = get_building_or_404(db, building_id, tenant_id)
    before_data = building_snapshot(building)

    try:
        log_audit(
            db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="delete",
            module="buildings",
            record_id=str(building.id),
            description=f"Deleted building: {building.name}",
            before_data=before_data,
        )

        db.delete(building)
        db.commit()

    except Exception:
        db.rollback()
        raise
