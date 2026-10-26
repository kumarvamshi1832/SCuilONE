
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.property_match import PropertyMatch
from app.models.site_visit import SiteVisit
from app.models.user import User
from app.schemas.site_visit import (
    SiteVisitCreate,
    SiteVisitResponse,
    SiteVisitUpdate,
)
from app.services.audit_service import log_audit

router = APIRouter(
    prefix="/api/v1/site-visits",
    tags=["Site Visits"],
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
        return tenant_id, user_id
    except (KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authenticated user context.",
        )


def get_visit_or_404(
    db: Session,
    visit_id: UUID,
    tenant_id: UUID,
) -> SiteVisit:
    visit = (
        db.query(SiteVisit)
        .filter(
            SiteVisit.id == visit_id,
            SiteVisit.tenant_id == tenant_id,
        )
        .first()
    )

    if not visit:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Site visit not found.",
        )

    return visit


def validate_assigned_user(
    db: Session,
    tenant_id: UUID,
    assigned_to: UUID | None,
):
    if assigned_to is None:
        return

    user = (
        db.query(User)
        .filter(
            User.id == assigned_to,
            User.tenant_id == tenant_id,
        )
        .first()
    )

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigned user not found in this tenant.",
        )

    user_status = getattr(user, "status", None)

    if user_status is not None and str(user_status).lower() not in (
        "active",
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot assign a site visit to an inactive user.",
        )


def validate_no_conflicts(
    db: Session,
    tenant_id: UUID,
    property_match_id: UUID,
    assigned_to: UUID | None,
    scheduled_start: datetime,
    scheduled_end: datetime,
    exclude_visit_id: UUID | None = None,
):
    query = db.query(SiteVisit).filter(
        SiteVisit.tenant_id == tenant_id,
        SiteVisit.status.in_(["Scheduled", "Rescheduled"]),
        SiteVisit.scheduled_start < scheduled_end,
        SiteVisit.scheduled_end > scheduled_start,
    )

    if exclude_visit_id is not None:
        query = query.filter(SiteVisit.id != exclude_visit_id)

    for existing in query.all():
        if existing.property_match_id == property_match_id:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "This property match already has an overlapping "
                    "site visit."
                ),
            )

        if (
            assigned_to is not None
            and existing.assigned_to == assigned_to
        ):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "The assigned salesperson already has an "
                    "overlapping site visit."
                ),
            )


def audit_data(visit: SiteVisit) -> dict:
    return {
        "id": visit.id,
        "property_match_id": visit.property_match_id,
        "assigned_to": visit.assigned_to,
        "created_by": visit.created_by,
        "scheduled_start": visit.scheduled_start,
        "scheduled_end": visit.scheduled_end,
        "status": visit.status,
        "outcome": visit.outcome,
        "buyer_feedback": visit.buyer_feedback,
        "interest_level": visit.interest_level,
        "follow_up_required": visit.follow_up_required,
        "follow_up_date": visit.follow_up_date,
        "cancellation_reason": visit.cancellation_reason,
    }


@router.post(
    "/",
    response_model=SiteVisitResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_site_visit(
    payload: SiteVisitCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    permission=Depends(require_permission("site_visit.create")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    match = (
        db.query(PropertyMatch)
        .filter(
            PropertyMatch.id == payload.property_match_id,
            PropertyMatch.tenant_id == tenant_id,
        )
        .first()
    )

    if not match:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Property match not found in this tenant.",
        )

    assigned_to = (
        payload.assigned_to
        if payload.assigned_to is not None
        else match.assigned_to
    )

    validate_assigned_user(db, tenant_id, assigned_to)

    validate_no_conflicts(
        db=db,
        tenant_id=tenant_id,
        property_match_id=match.id,
        assigned_to=assigned_to,
        scheduled_start=payload.scheduled_start,
        scheduled_end=payload.scheduled_end,
    )

    visit = SiteVisit(
        tenant_id=tenant_id,
        property_match_id=match.id,
        assigned_to=assigned_to,
        created_by=user_id,
        scheduled_start=payload.scheduled_start,
        scheduled_end=payload.scheduled_end,
        status="Scheduled",
    )

    try:
        db.add(visit)
        db.flush()

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="CREATE",
            module="site_visits",
            record_id=visit.id,
            description="Created a site visit appointment.",
            after_data=audit_data(visit),
        )

        db.commit()
        db.refresh(visit)
        return visit

    except Exception:
        db.rollback()
        raise


@router.get("/", response_model=list[SiteVisitResponse])
def list_site_visits(
    visit_status: str | None = Query(default=None, alias="status"),
    assigned_to: UUID | None = Query(default=None),
    property_match_id: UUID | None = Query(default=None),
    scheduled_from: datetime | None = Query(default=None),
    scheduled_to: datetime | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    permission=Depends(require_permission("site_visit.view")),
):
    tenant_id, _ = get_tenant_and_user(current_user)

    query = db.query(SiteVisit).filter(
        SiteVisit.tenant_id == tenant_id
    )

    if visit_status:
        query = query.filter(SiteVisit.status == visit_status)

    if assigned_to:
        query = query.filter(SiteVisit.assigned_to == assigned_to)

    if property_match_id:
        query = query.filter(
            SiteVisit.property_match_id == property_match_id
        )

    if scheduled_from:
        query = query.filter(
            SiteVisit.scheduled_start >= scheduled_from
        )

    if scheduled_to:
        query = query.filter(
            SiteVisit.scheduled_start <= scheduled_to
        )

    return (
        query.order_by(SiteVisit.scheduled_start.asc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/{visit_id}", response_model=SiteVisitResponse)
def get_site_visit(
    visit_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    permission=Depends(require_permission("site_visit.view")),
):
    tenant_id, _ = get_tenant_and_user(current_user)

    return get_visit_or_404(db, visit_id, tenant_id)


@router.patch("/{visit_id}", response_model=SiteVisitResponse)
def update_site_visit(
    visit_id: UUID,
    payload: SiteVisitUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    permission=Depends(require_permission("site_visit.update")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    visit = get_visit_or_404(db, visit_id, tenant_id)
    before_data = audit_data(visit)

    changes = payload.model_dump(exclude_unset=True)

    if not changes:
        return visit

    if visit.status in ("Completed", "Cancelled", "No-show"):
        if any(
            field in changes
            for field in (
                "scheduled_start",
                "scheduled_end",
                "assigned_to",
            )
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Completed, cancelled, or no-show visits cannot "
                    "be rescheduled or reassigned."
                ),
            )

    new_start = changes.get(
        "scheduled_start", visit.scheduled_start
    )
    new_end = changes.get(
        "scheduled_end", visit.scheduled_end
    )
    new_assigned_to = changes.get(
        "assigned_to", visit.assigned_to
    )
    new_status = changes.get("status", visit.status)

    if new_start is None or new_end is None or new_end <= new_start:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="scheduled_end must be after scheduled_start.",
        )

    if "assigned_to" in changes:
        validate_assigned_user(
            db,
            tenant_id,
            new_assigned_to,
        )

    rescheduling = (
        "scheduled_start" in changes
        or "scheduled_end" in changes
    )

    if (
        rescheduling or "assigned_to" in changes
    ) and new_status not in ("Cancelled", "Completed", "No-show"):
        validate_no_conflicts(
            db=db,
            tenant_id=tenant_id,
            property_match_id=visit.property_match_id,
            assigned_to=new_assigned_to,
            scheduled_start=new_start,
            scheduled_end=new_end,
            exclude_visit_id=visit.id,
        )

        if rescheduling and "status" not in changes:
            changes["status"] = "Rescheduled"

    if (
        changes.get("status") == "Cancelled"
        and not changes.get("cancellation_reason")
        and not visit.cancellation_reason
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Provide a cancellation_reason when cancelling "
                "a site visit."
            ),
        )

    if (
        changes.get("status") == "Rescheduled"
        and not rescheduling
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Provide a new scheduled_start or scheduled_end "
                "when rescheduling."
            ),
        )

    try:
        for field, value in changes.items():
            setattr(visit, field, value)

        visit.updated_at = datetime.utcnow()
        db.flush()

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="UPDATE",
            module="site_visits",
            record_id=visit.id,
            description="Updated a site visit appointment.",
            before_data=before_data,
            after_data=audit_data(visit),
        )

        db.commit()
        db.refresh(visit)
        return visit

    except Exception:
        db.rollback()
        raise
