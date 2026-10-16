from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from app.services.lead_assignment import (
    assign_lead_automatically,
    assign_waiting_leads
)
from app.services.lead_assignment import ACTIVE_LEAD_STATUSES
from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.models.lead import Lead
from app.models.deal import Deal
from app.models.user import User
from app.schemas.lead import LeadCreate, LeadUpdate, LeadResponse
from app.services.lead_assignment import (
    get_active_lead_count,
    MAX_ACTIVE_LEADS
)
from fastapi import Query
from sqlalchemy import desc
from app.models.lead_assignment_audit import LeadAssignmentAudit
from app.models.user_role import UserRole
from app.models.role_permission import RolePermission
from app.models.permission import Permission


router = APIRouter(
    prefix="/api/v1/leads",
    tags=["Leads"]
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def validate_assigned_user(
    assigned_to: UUID | None,
    tenant_id,
    db: Session
):
    if assigned_to is None:
        return

    user = db.query(User).filter(
        User.id == assigned_to,
        User.tenant_id == tenant_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigned user does not belong to this tenant"
        )



@router.post(
    "/",
    response_model=LeadResponse,
    status_code=status.HTTP_201_CREATED
)
def create_lead(
    data: LeadCreate,
    current_user: dict = Depends(require_active_user),
    permission=Depends(require_permission("lead.create")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(current_user["tenant_id"])

    validate_assigned_user(
        data.assigned_to,
        tenant_id,
        db
    )

    try:
        assigned_to = data.assigned_to

        if assigned_to is None:
            assigned_to = assign_lead_automatically(
                db=db,
                tenant_id=tenant_id
            )

        lead = Lead(
            tenant_id=tenant_id,
            full_name=data.full_name,
            email=data.email,
            phone=data.phone,
            source=data.source,
            status=data.status,
            assigned_to=assigned_to,
            notes=data.notes
        )

        db.add(lead)
        db.commit()
        db.refresh(lead)

        return lead

    except Exception:
        db.rollback()
        raise

@router.get(
    "/",
    response_model=list[LeadResponse]
)
def get_leads(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.view")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(current_user["tenant_id"])

    leads = db.query(Lead).filter(
        Lead.tenant_id == tenant_id
    ).all()

    return leads


@router.get(
    "/my-leads",
    response_model=list[LeadResponse]
)
def get_my_leads(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.view")),
    db: Session = Depends(get_db)
):
    user_id = UUID(current_user["user_id"])
    tenant_id = UUID(current_user["tenant_id"])

    leads = db.query(Lead).filter(
        Lead.tenant_id == tenant_id,
        Lead.assigned_to == user_id
    ).all()

    return leads

@router.get("/assignment-history")
def get_assignment_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.view")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(current_user["tenant_id"])

    query = db.query(LeadAssignmentAudit).filter(
        LeadAssignmentAudit.tenant_id == tenant_id
    )

    total = query.count()

    records = (
        query
        .order_by(desc(LeadAssignmentAudit.created_at))
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    lead_ids = {
        record.lead_id
        for record in records
        if record.lead_id is not None
    }

    user_ids = {
        user_id
        for record in records
        for user_id in (
            record.previous_assigned_to,
            record.new_assigned_to,
            record.approved_by
        )
        if user_id is not None
    }

    leads_by_id = {}
    users_by_id = {}

    if lead_ids:
        leads_by_id = {
            lead.id: lead
            for lead in db.query(Lead).filter(
                Lead.tenant_id == tenant_id,
                Lead.id.in_(lead_ids)
            ).all()
        }

    if user_ids:
        users_by_id = {
            user.id: user
            for user in db.query(User).filter(
                User.tenant_id == tenant_id,
                User.id.in_(user_ids)
            ).all()
        }

    items = []

    for record in records:
        lead = leads_by_id.get(record.lead_id)

        previous_user = users_by_id.get(
            record.previous_assigned_to
        )
        new_user = users_by_id.get(
            record.new_assigned_to
        )
        approved_user = users_by_id.get(
            record.approved_by
        )

        items.append({
            "id": str(record.id),
            "lead_id": str(record.lead_id) if record.lead_id else None,
            "lead_name": lead.full_name if lead else None,
            "previous_assigned_to": (
                str(record.previous_assigned_to)
                if record.previous_assigned_to else None
            ),
            "previous_assignee_name": (
                previous_user.full_name if previous_user else None
            ),
            "new_assigned_to": (
                str(record.new_assigned_to)
                if record.new_assigned_to else None
            ),
            "new_assignee_name": (
                new_user.full_name if new_user else None
            ),
            "approved_by": (
                str(record.approved_by)
                if record.approved_by else None
            ),
            "approved_by_name": (
                approved_user.full_name if approved_user else None
            ),
            "reason": record.reason,
            "action": record.action,
            "created_at": record.created_at.isoformat()
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }


@router.get(
    "/{lead_id}",
    response_model=LeadResponse
)
def get_lead(
    lead_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.view")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(current_user["tenant_id"])

    lead = db.query(Lead).filter(
        Lead.id == lead_id,
        Lead.tenant_id == tenant_id
    ).first()

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )

    return lead




@router.put(
    "/{lead_id}",
    response_model=LeadResponse
)
def update_lead(
    lead_id: UUID,
    data: LeadUpdate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.update")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(current_user["tenant_id"])
    user_id = UUID(current_user["user_id"])

    lead = db.query(Lead).filter(
        Lead.id == lead_id,
        Lead.tenant_id == tenant_id
    ).first()

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )

    if data.assigned_to is not None:
        validate_assigned_user(
            data.assigned_to,
            tenant_id,
            db
        )

    previous_status = lead.status
    previous_assigned_to = lead.assigned_to
    assignment_changed = (
        data.assigned_to is not None
        and data.assigned_to != previous_assigned_to
    )

    try:
        if assignment_changed:
            target_user_id = data.assigned_to

            target_active_count = get_active_lead_count(
                db=db,
                tenant_id=tenant_id,
                user_id=target_user_id
            )

            lead_is_active = (
                lead.status in ACTIVE_LEAD_STATUSES
            )

            target_would_exceed_capacity = (
                lead_is_active
                and target_user_id != previous_assigned_to
                and target_active_count >= MAX_ACTIVE_LEADS
            )

            if target_would_exceed_capacity:
                if not data.override_capacity:
                    raise HTTPException(
                        status_code=status.HTTP_409_CONFLICT,
                        detail={
                            "code": "LEAD_CAPACITY_EXCEEDED",
                            "message": (
                                "This salesperson already has "
                                f"{target_active_count} active leads."
                            ),
                            "active_leads": target_active_count,
                            "maximum_active_leads": MAX_ACTIVE_LEADS,
                            "override_required": True
                        }
                    )

                permission = db.query(Permission).filter(
                    Permission.name == "lead.assignment.override"
                ).first()

                if not permission:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Override permission is not configured"
                    )

                has_override_permission = (
                    db.query(UserRole)
                    .join(
                        RolePermission,
                        RolePermission.role_id == UserRole.role_id
                    )
                    .filter(
                        UserRole.user_id == user_id,
                        RolePermission.permission_id == permission.id
                    )
                    .first()
                )

                if not has_override_permission:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail="You do not have permission to override lead capacity"
                    )

                reason = (
                    data.override_reason.strip()
                    if data.override_reason
                    else ""
                )

                if not reason:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail="A reason is required for a capacity override"
                    )

                audit = LeadAssignmentAudit(
                    tenant_id=tenant_id,
                    lead_id=lead.id,
                    previous_assigned_to=previous_assigned_to,
                    new_assigned_to=target_user_id,
                    approved_by=user_id,
                    reason=reason,
                    action="capacity_override"
                )

                db.add(audit)

        elif data.override_capacity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Capacity override requires a changed assignee"
            )

        if data.full_name is not None:
            lead.full_name = data.full_name

        if data.email is not None:
            lead.email = data.email

        if data.phone is not None:
            lead.phone = data.phone

        if data.source is not None:
            lead.source = data.source

        if data.status is not None:
            lead.status = data.status

        if data.assigned_to is not None:
            lead.assigned_to = data.assigned_to

        if data.notes is not None:
            lead.notes = data.notes

        db.flush()

        capacity_freed = (
            previous_status in ACTIVE_LEAD_STATUSES
            and lead.status not in ACTIVE_LEAD_STATUSES
        ) or (
            previous_assigned_to is not None
            and lead.assigned_to != previous_assigned_to
        )

        if capacity_freed:
            assign_waiting_leads(
                db=db,
                tenant_id=tenant_id
            )

        db.commit()
        db.refresh(lead)

        return lead

    except Exception:
        db.rollback()
        raise


@router.delete(
    "/{lead_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_lead(
    lead_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.delete")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(current_user["tenant_id"])

    lead = db.query(Lead).filter(
        Lead.id == lead_id,
        Lead.tenant_id == tenant_id
    ).first()

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )

    linked_deal = db.query(Deal.id).filter(
        Deal.lead_id == lead.id,
        Deal.tenant_id == tenant_id
    ).first()

    if linked_deal:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Cannot delete this lead because it is linked to a deal. "
                "Archive the lead or handle the linked deal first."
            )
        )

    try:
        db.delete(lead)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return