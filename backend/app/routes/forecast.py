from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_active_user
from app.core.permissions import require_permission
from app.models.pipeline import Pipeline, PipelineStage
from app.services.audit_service import log_audit
from app.services.forecast_service import build_forecast

router = APIRouter(prefix="/api/v1/forecast", tags=["Sales Forecast"])


@router.get("/summary")
def forecast_summary(
    months: int = Query(default=6, ge=1, le=24),
    pipeline_id: UUID | None = None,
    assigned_to: UUID | None = None,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("forecast.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    return build_forecast(db, tenant_id, months=months, pipeline_id=pipeline_id, assigned_to=assigned_to)


@router.get("/stages")
def list_stage_probabilities(
    pipeline_id: UUID | None = None,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("pipeline.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    q = (
        db.query(PipelineStage, Pipeline.name)
        .join(Pipeline, Pipeline.id == PipelineStage.pipeline_id)
        .filter(Pipeline.tenant_id == tenant_id)
    )
    if pipeline_id:
        q = q.filter(PipelineStage.pipeline_id == pipeline_id)
    rows = q.order_by(Pipeline.name, PipelineStage.position).all()
    return [
        {
            "stage_id": s.id,
            "pipeline_id": s.pipeline_id,
            "pipeline_name": pname,
            "stage_name": s.name,
            "position": s.position,
            "probability": s.probability,
            "is_closed_won": s.is_closed_won,
            "is_closed_lost": s.is_closed_lost,
        }
        for s, pname in rows
    ]


class StageProbabilityUpdate(BaseModel):
    probability: int = Field(ge=0, le=100)


@router.put("/stages/{stage_id}/probability")
def set_stage_probability(
    stage_id: UUID,
    payload: StageProbabilityUpdate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("pipeline.update")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    stage = (
        db.query(PipelineStage)
        .join(Pipeline, Pipeline.id == PipelineStage.pipeline_id)
        .filter(PipelineStage.id == stage_id, Pipeline.tenant_id == tenant_id)
        .first()
    )
    if not stage:
        raise HTTPException(status_code=404, detail="Pipeline stage not found")
    if stage.is_closed_won or stage.is_closed_lost:
        raise HTTPException(status_code=422, detail="Closed Won is always 100% and Closed Lost is always 0%.")
    before = stage.probability
    stage.probability = payload.probability
    log_audit(
        db, tenant_id, current_user["user_id"], "UPDATE", "pipeline_stage", stage.id,
        description=f"Stage '{stage.name}' win probability changed",
        before_data={"probability": before}, after_data={"probability": payload.probability},
    )
    db.commit()
    return {"stage_id": stage.id, "stage_name": stage.name, "probability": stage.probability}
