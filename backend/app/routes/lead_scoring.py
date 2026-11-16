from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, Response
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_active_user
from app.core.permissions import require_permission
from app.core.rate_limiter import limiter
from app.models.lead import Lead
from app.services import lead_scoring as scoring
from app.services.audit_service import log_audit

router = APIRouter(prefix="/api/v1/lead-scoring", tags=["Lead Scoring"])


def _row(lead: Lead) -> dict:
    return {
        "id": lead.id,
        "full_name": lead.full_name,
        "email": lead.email,
        "phone": lead.phone,
        "source": lead.source,
        "status": lead.status,
        "assigned_to": lead.assigned_to,
        "score": lead.score,
        "score_label": lead.score_label,
        "scored_at": lead.scored_at,
    }


@router.get("/leaderboard")
def lead_leaderboard(
    label: str | None = Query(default=None, pattern="^(Hot|Warm|Cold|Converted|Dead)$"),
    assigned_to: UUID | None = None,
    min_score: int = Query(default=0, ge=0, le=100),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.view")),
    db: Session = Depends(get_db),
):
    """Best leads first. Dead/Converted leads are hidden unless asked for via ?label=."""
    tenant_id = UUID(str(current_user["tenant_id"]))
    q = db.query(Lead).filter(Lead.tenant_id == tenant_id, Lead.score >= min_score)
    if label:
        q = q.filter(Lead.score_label == label)
    else:
        q = q.filter(Lead.score_label.in_(["Hot", "Warm", "Cold"]))
    if assigned_to:
        q = q.filter(Lead.assigned_to == assigned_to)
    leads = q.order_by(Lead.score.desc(), Lead.updated_at.desc()).offset(skip).limit(limit).all()
    return [_row(l) for l in leads]


@router.get("/leads/{lead_id}")
def lead_score_breakdown(
    lead_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.tenant_id == tenant_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return {**_row(lead), "breakdown": lead.score_breakdown or {}}


@router.post("/leads/{lead_id}/recalculate")
def recalculate_one(
    lead_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.update")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    lead = db.query(Lead).filter(Lead.id == lead_id, Lead.tenant_id == tenant_id).first()
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    scoring.recalculate_lead(db, lead)
    db.commit()
    db.refresh(lead)
    return {**_row(lead), "breakdown": lead.score_breakdown or {}}


@router.post("/recalculate-all")
@limiter.limit("5/minute")
def recalculate_all(
    request: Request,
    response: Response,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.update")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    count = scoring.recalculate_tenant(db, tenant_id)
    log_audit(
        db, tenant_id, current_user["user_id"], "RECALCULATE", "lead_scoring",
        description=f"Recalculated lead scores for {count} leads",
    )
    db.commit()
    return {"leads_scored": count}
