from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy.exc import IntegrityError
from sqlalchemy import desc
from uuid import UUID, uuid4
import logging
from app.services.notification_service import notify_assignment
from app.core.industry_modules import require_enabled_module
from app.services.lead_assignment import (
    assign_lead_automatically,
    assign_waiting_leads,
    ACTIVE_LEAD_STATUSES,
    get_active_lead_count,
    MAX_ACTIVE_LEADS,
)
from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.models.lead import Lead
from app.models.deal import Deal
from app.models.activity import Activity
from app.models.document import Document
from app.models.booking import Booking
from app.models.buyer_requirement import BuyerRequirement
from app.models.software_requirement import SoftwareRequirement
from app.models.software_estimate import SoftwareEstimate
from app.models.software_contract import SoftwareContract
from app.models.user import User
from app.schemas.lead import LeadCreate, LeadUpdate, LeadResponse
from app.models.lead_assignment_audit import LeadAssignmentAudit
from app.models.user_role import UserRole
from app.models.role_permission import RolePermission
from app.models.permission import Permission
from app.services.workflow_engine import dispatch_workflows
from app.services.audit_service import log_audit


logger = logging.getLogger(__name__)

LEAD_DELETE_BLOCKERS = (
    (Activity, "activity(ies)"),
    (Document, "document(s)"),
    (BuyerRequirement, "buyer requirement(s)"),
    (Booking, "booking(s)"),
    (SoftwareRequirement, "software requirement(s)"),
    (SoftwareEstimate, "software estimate(s)"),
    (SoftwareContract, "software contract(s)"),
)


def get_lead_delete_blockers(db: Session, tenant_id: UUID, lead_id: UUID):
    blockers = []

    for model, label in LEAD_DELETE_BLOCKERS:
        count = db.query(model).filter(
            model.tenant_id == tenant_id,
            model.lead_id == lead_id,
        ).count()

        if count:
            blockers.append(f"{count} {label}")

    return blockers


router = APIRouter(
    prefix="/api/v1/leads",
    tags=["Leads"],
    dependencies=[
        Depends(require_enabled_module("leads")),
    ],
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
    db: Session,
):
    if assigned_to is None:
        return

    user = db.query(User).filter(
        User.id == assigned_to,
        User.tenant_id == tenant_id,
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigned user does not belong to this tenant",
        )


@router.post(
    "/",
    response_model=LeadResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_lead(
    data: LeadCreate,
    current_user: dict = Depends(require_active_user),
    permission=Depends(require_permission("lead.create")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(current_user["tenant_id"])
    user_id = UUID(current_user["user_id"])

    validate_assigned_user(
        data.assigned_to,
        tenant_id,
        db,
    )

    try:
        assigned_to = data.assigned_to

        if assigned_to is None:
            assigned_to = assign_lead_automatically(
                db=db,
                tenant_id=tenant_id,
            )

        target_active_count = 0

        capacity_exceeded = (
            assigned_to is not None
            and data.status in ACTIVE_LEAD_STATUSES
        )

        if capacity_exceeded:
            target_active_count = get_active_lead_count(
                db=db,
                tenant_id=tenant_id,
                user_id=assigned_to,
            )

            capacity_exceeded = (
                target_active_count >= MAX_ACTIVE_LEADS
            )

        audit_reason = None

        if capacity_exceeded:
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
                        "override_required": True,
                    },
                )

            override_permission = db.query(Permission).filter(
                Permission.name == "lead.assignment.override"
            ).first()

            if not override_permission:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Override permission is not configured",
                )

            has_override_permission = (
                db.query(UserRole)
                .join(
                    RolePermission,
                    RolePermission.role_id == UserRole.role_id,
                )
                .filter(
                    UserRole.user_id == user_id,
                    RolePermission.permission_id
                    == override_permission.id,
                )
                .first()
            )

            if not has_override_permission:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=(
                        "You do not have permission to "
                        "override lead capacity"
                    ),
                )

            audit_reason = (
                data.override_reason.strip()
                if data.override_reason
                else ""
            )

            if not audit_reason:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                    detail=(
                        "A reason is required for a capacity override"
                    ),
                )

        elif data.override_capacity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Capacity override is not required "
                    "for this assignment"
                ),
            )

        lead = Lead(
            tenant_id=tenant_id,
            full_name=data.full_name,
            email=data.email,
            phone=data.phone,
            source=data.source,
            status=data.status,
            created_by=user_id,
            assigned_to=assigned_to,
            notes=data.notes,
        )

        db.add(lead)
        db.flush()

        if audit_reason is not None:
            audit = LeadAssignmentAudit(
                tenant_id=tenant_id,
                lead_id=lead.id,
                previous_assigned_to=None,
                new_assigned_to=assigned_to,
                approved_by=user_id,
                reason=audit_reason,
                action="capacity_override",
            )

            db.add(audit)

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="create",
            module="leads",
            record_id=lead.id,
            description=f"Created lead {lead.full_name}",
            after_data={
                "full_name": lead.full_name,
                "email": lead.email,
                "phone": lead.phone,
                "source": lead.source,
                "status": lead.status,
                "assigned_to": lead.assigned_to,
                "created_by": lead.created_by,
            },
        )

        db.commit()
        db.refresh(lead)
        if assigned_to is not None:
            notify_assignment(
            db=db,
            tenant_id=tenant_id,
            recipient_user_id=assigned_to,
            actor_user_id=user_id,
            title="New lead assigned to you",
            message=f"Lead '{lead.full_name}' has been assigned to you.",
            related_module="leads",
            related_record_id=lead.id,
        )

    except Exception:
        db.rollback()
        raise

    # Dispatch workflows after the lead has been committed.
    try:
        dispatch_workflows(
            db=db,
            tenant_id=tenant_id,
            module_name="leads",
            trigger_event="record_created",
            record=lead,
            event_id=str(lead.id),
        )

        db.commit()
        db.refresh(lead)

    except Exception:
        db.rollback()
        logger.exception(
            "Workflow dispatch failed after lead creation. Lead ID: %s",
            lead.id,
        )

        # Preserve the successfully created lead if workflow dispatch fails.
        return lead

    return lead


@router.get(
    "/",
    response_model=list[LeadResponse],
)
def get_leads(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(current_user["tenant_id"])

    leads = db.query(Lead).filter(
        Lead.tenant_id == tenant_id
    ).all()

    return leads


@router.get(
    "/my-leads",
    response_model=list[LeadResponse],
)
def get_my_leads(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.view")),
    db: Session = Depends(get_db),
):
    user_id = UUID(current_user["user_id"])
    tenant_id = UUID(current_user["tenant_id"])

    leads = db.query(Lead).filter(
        Lead.tenant_id == tenant_id,
        Lead.assigned_to == user_id,
    ).all()

    return leads


@router.get("/assignment-history")
def get_assignment_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.view")),
    db: Session = Depends(get_db),
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
            record.approved_by,
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
                Lead.id.in_(lead_ids),
            ).all()
        }

    if user_ids:
        users_by_id = {
            user.id: user
            for user in db.query(User).filter(
                User.tenant_id == tenant_id,
                User.id.in_(user_ids),
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
            "lead_id": (
                str(record.lead_id)
                if record.lead_id
                else None
            ),
            "lead_name": (
                lead.full_name
                if lead
                else None
            ),
            "previous_assigned_to": (
                str(record.previous_assigned_to)
                if record.previous_assigned_to
                else None
            ),
            "previous_assignee_name": (
                previous_user.full_name
                if previous_user
                else None
            ),
            "new_assigned_to": (
                str(record.new_assigned_to)
                if record.new_assigned_to
                else None
            ),
            "new_assignee_name": (
                new_user.full_name
                if new_user
                else None
            ),
            "approved_by": (
                str(record.approved_by)
                if record.approved_by
                else None
            ),
            "approved_by_name": (
                approved_user.full_name
                if approved_user
                else None
            ),
            "reason": record.reason,
            "action": record.action,
            "created_at": (
                record.created_at.isoformat()
                if record.created_at
                else None
            ),
        })

    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (
            (total + page_size - 1) // page_size
        ),
    }


@router.get(
    "/{lead_id}",
    response_model=LeadResponse,
)
def get_lead(
    lead_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(current_user["tenant_id"])

    lead = db.query(Lead).filter(
        Lead.id == lead_id,
        Lead.tenant_id == tenant_id,
    ).first()

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found",
        )

    return lead




@router.put(
    "/{lead_id}",
    response_model=LeadResponse,
)
def update_lead(
    lead_id: UUID,
    data: LeadUpdate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.update")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(current_user["tenant_id"])
    user_id = UUID(current_user["user_id"])

    lead = db.query(Lead).filter(
        Lead.id == lead_id,
        Lead.tenant_id == tenant_id,
    ).first()

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found",
        )

    if data.assigned_to is not None:
        validate_assigned_user(
            data.assigned_to,
            tenant_id,
            db,
        )

    previous_status = lead.status
    previous_assigned_to = lead.assigned_to
    lead_creator_id = lead.created_by

    update_data = data.model_dump(
        exclude_unset=True,
        exclude={"override_capacity", "override_reason"},
    )

    changed_fields = set()

    for field, new_value in update_data.items():
        old_value = getattr(lead, field, None)

        if old_value != new_value:
            changed_fields.add(field)

    before_data = {
        field: getattr(lead, field, None)
        for field in changed_fields
    }

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
                user_id=target_user_id,
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
                            "override_required": True,
                        },
                    )

                override_permission = db.query(Permission).filter(
                    Permission.name == "lead.assignment.override"
                ).first()

                if not override_permission:
                    raise HTTPException(
                        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                        detail="Override permission is not configured",
                    )

                has_override_permission = (
                    db.query(UserRole)
                    .join(
                        RolePermission,
                        RolePermission.role_id == UserRole.role_id,
                    )
                    .filter(
                        UserRole.user_id == user_id,
                        RolePermission.permission_id
                        == override_permission.id,
                    )
                    .first()
                )

                if not has_override_permission:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=(
                            "You do not have permission to "
                            "override lead capacity"
                        ),
                    )

                reason = (
                    data.override_reason.strip()
                    if data.override_reason
                    else ""
                )

                if not reason:
                    raise HTTPException(
                        status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                        detail=(
                            "A reason is required for a capacity override"
                        ),
                    )

                db.add(
                    LeadAssignmentAudit(
                        tenant_id=tenant_id,
                        lead_id=lead.id,
                        previous_assigned_to=previous_assigned_to,
                        new_assigned_to=target_user_id,
                        approved_by=user_id,
                        reason=reason,
                        action="capacity_override",
                    )
                )

        elif data.override_capacity:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=(
                    "Capacity override requires a changed assignee"
                ),
            )

        for field, new_value in update_data.items():
            if field in changed_fields:
                setattr(lead, field, new_value)

        db.flush()

        capacity_freed = (
            (
                previous_status in ACTIVE_LEAD_STATUSES
                and lead.status not in ACTIVE_LEAD_STATUSES
            )
            or (
                previous_assigned_to is not None
                and lead.assigned_to != previous_assigned_to
            )
        )

        if capacity_freed:
            assign_waiting_leads(
                db=db,
                tenant_id=tenant_id,
            )

        if changed_fields:
            log_audit(
                db=db,
                tenant_id=tenant_id,
                user_id=user_id,
                action="update",
                module="leads",
                record_id=lead.id,
                description=f"Updated lead {lead.full_name}",
                before_data=before_data,
                after_data={
                    field: getattr(lead, field, None)
                    for field in changed_fields
                },
            )

        db.commit()
        db.refresh(lead)

    except Exception:
        db.rollback()
        raise

    # Notify the new assignee when the lead is reassigned.
    if (
        lead.assigned_to is not None
        and lead.assigned_to != previous_assigned_to
    ):
        notify_assignment(
            db=db,
            tenant_id=tenant_id,
            recipient_user_id=lead.assigned_to,
            actor_user_id=user_id,
            title="Lead assigned to you",
            message=(
                f"Lead '{lead.full_name}' has been assigned to you."
            ),
            related_module="leads",
            related_record_id=lead.id,
        )

    # Notify the assigned salesperson when the creator updates the lead.
    if (
        changed_fields
        and user_id == lead_creator_id
        and lead.assigned_to is not None
        and lead.assigned_to != user_id
    ):
        changed_field_names = ", ".join(sorted(changed_fields))

        if "status" in changed_fields:
            message = (
                f"The lead creator updated your assigned lead "
                f"'{lead.full_name}' from '{previous_status}' "
                f"to '{lead.status}'. "
                f"Changed fields: {changed_field_names}."
            )
        else:
            message = (
                f"The creator updated your assigned lead "
                f"'{lead.full_name}'. "
                f"Changed fields: {changed_field_names}."
            )

        notify_assignment(
            db=db,
            tenant_id=tenant_id,
            recipient_user_id=lead.assigned_to,
            actor_user_id=user_id,
            title="Assigned lead updated",
            message=message,
            related_module="leads",
            related_record_id=lead.id,
            notification_type="lead_update",
        )

    # Notify the original creator when the assigned salesperson updates the lead.
    elif (
        changed_fields
        and user_id == lead.assigned_to
        and lead_creator_id is not None
        and lead_creator_id != user_id
    ):
        changed_field_names = ", ".join(sorted(changed_fields))

        if "status" in changed_fields:
            message = (
                f"The assigned salesperson updated your lead "
                f"'{lead.full_name}' from '{previous_status}' "
                f"to '{lead.status}'. "
                f"Changed fields: {changed_field_names}."
            )
        else:
            message = (
                f"The assigned salesperson updated your lead "
                f"'{lead.full_name}'. "
                f"Changed fields: {changed_field_names}."
            )

        notify_assignment(
            db=db,
            tenant_id=tenant_id,
            recipient_user_id=lead_creator_id,
            actor_user_id=user_id,
            title="Your lead was updated",
            message=message,
            related_module="leads",
            related_record_id=lead.id,
            notification_type="lead_update",
        )


    if not changed_fields:
        return lead

    event_base = (
        f"{lead.id}:{lead.updated_at.isoformat()}"
        if lead.updated_at
        else f"{lead.id}:{uuid4()}"
    )

    try:
        dispatch_workflows(
            db=db,
            tenant_id=tenant_id,
            module_name="leads",
            trigger_event="record_updated",
            record=lead,
            event_id=f"{event_base}:record_updated",
        )

        dispatch_workflows(
            db=db,
            tenant_id=tenant_id,
            module_name="leads",
            trigger_event="field_changed",
            record=lead,
            event_id=f"{event_base}:field_changed",
            changed_fields=changed_fields,
        )

        db.commit()
        db.refresh(lead)

    except Exception:
        db.rollback()
        logger.exception(
            "Workflow dispatch failed after lead update. Lead ID: %s",
            lead.id,
        )
        return lead

    return lead


@router.delete(
    "/{lead_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_lead(
    lead_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.delete")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(current_user["tenant_id"])

    lead = db.query(Lead).filter(
        Lead.id == lead_id,
        Lead.tenant_id == tenant_id,
    ).first()

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found",
        )

    linked_deal = db.query(Deal.id).filter(
        Deal.lead_id == lead.id,
        Deal.tenant_id == tenant_id,
    ).first()

    if linked_deal:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Cannot delete this lead because it is linked to a deal. "
                "Archive the lead or handle the linked deal first."
            ),
        )

    blockers = get_lead_delete_blockers(db, tenant_id, lead.id)

    if blockers:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=(
                "Cannot delete this lead because it is linked to "
                + ", ".join(blockers)
                + ". Update the lead's status instead of deleting it."
            ),
        )

    try:
        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=UUID(str(current_user["user_id"])),
            action="delete",
            module="leads",
            record_id=lead.id,
            description=f"Deleted lead {lead.full_name}",
            before_data={
                "full_name": lead.full_name,
                "email": lead.email,
                "phone": lead.phone,
                "source": lead.source,
                "status": lead.status,
                "assigned_to": lead.assigned_to,
                "created_by": lead.created_by,
            },
        )
        db.delete(lead)
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

    return