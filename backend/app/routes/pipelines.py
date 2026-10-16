from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission

from app.models.pipeline import Pipeline, PipelineStage

from app.schemas.pipeline import (
    PipelineCreate,
    PipelineUpdate,
    PipelineResponse,
    PipelineStageCreate,
    PipelineStageUpdate,
    PipelineStageResponse,
)


router = APIRouter(
    prefix="/api/v1/pipelines",
    tags=["Pipelines"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_tenant_pipeline(pipeline_id: UUID, tenant_id: UUID, db: Session):
    pipeline = db.query(Pipeline).filter(
        Pipeline.id == pipeline_id,
        Pipeline.tenant_id == tenant_id,
    ).first()

    if not pipeline:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pipeline not found",
        )

    return pipeline


def validate_default_pipeline(
    is_default: bool,
    tenant_id: UUID,
    db: Session,
    exclude_pipeline_id: UUID | None = None,
):
    if not is_default:
        return

    query = db.query(Pipeline).filter(
        Pipeline.tenant_id == tenant_id,
        Pipeline.is_default.is_(True),
    )

    if exclude_pipeline_id is not None:
        query = query.filter(Pipeline.id != exclude_pipeline_id)

    if query.first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This tenant already has a default pipeline",
        )


def validate_stage_status(
    is_closed_won: bool,
    is_closed_lost: bool,
):
    if is_closed_won and is_closed_lost:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A stage cannot be both Closed Won and Closed Lost",
        )


def validate_stage_position(
    pipeline_id: UUID,
    position: int,
    db: Session,
    exclude_stage_id: UUID | None = None,
):
    query = db.query(PipelineStage).filter(
        PipelineStage.pipeline_id == pipeline_id,
        PipelineStage.position == position,
    )

    if exclude_stage_id is not None:
        query = query.filter(PipelineStage.id != exclude_stage_id)

    if query.first():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This stage position is already in use",
        )


def get_pipeline_stage(
    pipeline_id: UUID,
    stage_id: UUID,
    db: Session,
):
    stage = db.query(PipelineStage).filter(
        PipelineStage.id == stage_id,
        PipelineStage.pipeline_id == pipeline_id,
    ).first()

    if not stage:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Pipeline stage not found",
        )

    return stage


@router.post(
    "/",
    response_model=PipelineResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_pipeline(
    data: PipelineCreate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("pipeline.create")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))

    validate_default_pipeline(
        data.is_default,
        tenant_id,
        db,
    )

    positions = [stage.position for stage in data.stages]

    if len(positions) != len(set(positions)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Stage positions must be unique within a pipeline",
        )

    for stage_data in data.stages:
        validate_stage_status(
            stage_data.is_closed_won,
            stage_data.is_closed_lost,
        )

    pipeline = Pipeline(
        tenant_id=tenant_id,
        name=data.name.strip(),
        description=data.description,
        is_default=data.is_default,
        is_active=data.is_active,
    )

    try:
        db.add(pipeline)
        db.flush()

        for stage_data in data.stages:
            stage = PipelineStage(
                pipeline_id=pipeline.id,
                name=stage_data.name.strip(),
                position=stage_data.position,
                is_closed_won=stage_data.is_closed_won,
                is_closed_lost=stage_data.is_closed_lost,
                is_active=stage_data.is_active,
            )
            db.add(stage)

        db.commit()
        db.refresh(pipeline)

    except Exception:
        db.rollback()
        raise

    return pipeline


@router.get(
    "/",
    response_model=list[PipelineResponse],
)
def get_pipelines(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("pipeline.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))

    return db.query(Pipeline).filter(
        Pipeline.tenant_id == tenant_id,
    ).order_by(
        Pipeline.is_default.desc(),
        Pipeline.created_at.desc(),
    ).all()


@router.get(
    "/{pipeline_id}",
    response_model=PipelineResponse,
)
def get_pipeline(
    pipeline_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("pipeline.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))

    return get_tenant_pipeline(
        pipeline_id,
        tenant_id,
        db,
    )


@router.get(
    "/{pipeline_id}/stages",
    response_model=list[PipelineStageResponse],
)
def get_pipeline_stages(
    pipeline_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("pipeline.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))

    get_tenant_pipeline(pipeline_id, tenant_id, db)

    return db.query(PipelineStage).filter(
        PipelineStage.pipeline_id == pipeline_id,
    ).order_by(
        PipelineStage.position.asc(),
    ).all()


@router.put(
    "/{pipeline_id}",
    response_model=PipelineResponse,
)
def update_pipeline(
    pipeline_id: UUID,
    data: PipelineUpdate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("pipeline.update")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))

    pipeline = get_tenant_pipeline(
        pipeline_id,
        tenant_id,
        db,
    )

    changes = data.model_dump(exclude_unset=True)

    if "name" in changes and changes["name"] is not None:
        changes["name"] = changes["name"].strip()

        if not changes["name"]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Pipeline name cannot be empty",
            )

    if changes.get("is_default") is True:
        validate_default_pipeline(
            True,
            tenant_id,
            db,
            exclude_pipeline_id=pipeline.id,
        )

    for field, value in changes.items():
        setattr(pipeline, field, value)

    try:
        db.commit()
        db.refresh(pipeline)
    except Exception:
        db.rollback()
        raise

    return pipeline


@router.delete(
    "/{pipeline_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_pipeline(
    pipeline_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("pipeline.delete")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))

    pipeline = get_tenant_pipeline(
        pipeline_id,
        tenant_id,
        db,
    )

    if pipeline.is_default:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Set another pipeline as default before deleting this pipeline",
        )

    db.delete(pipeline)
    db.commit()

    return None


@router.post(
    "/{pipeline_id}/stages",
    response_model=PipelineStageResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_pipeline_stage(
    pipeline_id: UUID,
    data: PipelineStageCreate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("pipeline.update")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))

    get_tenant_pipeline(pipeline_id, tenant_id, db)

    validate_stage_status(
        data.is_closed_won,
        data.is_closed_lost,
    )

    validate_stage_position(
        pipeline_id,
        data.position,
        db,
    )

    stage = PipelineStage(
        pipeline_id=pipeline_id,
        name=data.name.strip(),
        position=data.position,
        is_closed_won=data.is_closed_won,
        is_closed_lost=data.is_closed_lost,
        is_active=data.is_active,
    )

    try:
        db.add(stage)
        db.commit()
        db.refresh(stage)
    except Exception:
        db.rollback()
        raise

    return stage


@router.put(
    "/{pipeline_id}/stages/{stage_id}",
    response_model=PipelineStageResponse,
)
def update_pipeline_stage(
    pipeline_id: UUID,
    stage_id: UUID,
    data: PipelineStageUpdate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("pipeline.update")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))

    get_tenant_pipeline(pipeline_id, tenant_id, db)

    stage = get_pipeline_stage(
        pipeline_id,
        stage_id,
        db,
    )

    changes = data.model_dump(exclude_unset=True)

    effective_won = changes.get(
        "is_closed_won",
        stage.is_closed_won,
    )
    effective_lost = changes.get(
        "is_closed_lost",
        stage.is_closed_lost,
    )

    validate_stage_status(
        effective_won,
        effective_lost,
    )

    if "name" in changes and changes["name"] is not None:
        changes["name"] = changes["name"].strip()

        if not changes["name"]:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Stage name cannot be empty",
            )

    if changes.get("position") is not None:
        validate_stage_position(
            pipeline_id,
            changes["position"],
            db,
            exclude_stage_id=stage.id,
        )

    for field, value in changes.items():
        setattr(stage, field, value)

    try:
        db.commit()
        db.refresh(stage)
    except Exception:
        db.rollback()
        raise

    return stage


@router.delete(
    "/{pipeline_id}/stages/{stage_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_pipeline_stage(
    pipeline_id: UUID,
    stage_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("pipeline.update")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))

    get_tenant_pipeline(pipeline_id, tenant_id, db)

    stage = get_pipeline_stage(
        pipeline_id,
        stage_id,
        db,
    )

    db.delete(stage)
    db.commit()

    return None
