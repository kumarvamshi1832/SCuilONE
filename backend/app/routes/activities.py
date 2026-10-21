from uuid import UUID
from app.services.notification_service import notify_assignment
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission

from app.models.activity import Activity
from app.models.user import User
from app.models.lead import Lead
from app.models.contact import Contact
from app.models.account import Account
from app.models.deal import Deal

from app.schemas.activity import (
    ActivityCreate,
    ActivityUpdate,
    ActivityResponse
)


router = APIRouter(
    prefix="/api/v1/activities",
    tags=["Activities & Tasks"]
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def validate_related_records(data, tenant_id, db: Session):
    related_records = [
        (User, "assigned_to", "Assigned user"),
        (Lead, "lead_id", "Lead"),
        (Contact, "contact_id", "Contact"),
        (Account, "account_id", "Account"),
        (Deal, "deal_id", "Deal"),
    ]

    for model, field, label in related_records:
        record_id = getattr(data, field, None)

        if record_id is None:
            continue

        record = db.query(model).filter(
            model.id == record_id,
            model.tenant_id == tenant_id
        ).first()

        if not record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{label} does not belong to this tenant"
            )


@router.post(
    "/",
    response_model=ActivityResponse,
    status_code=status.HTTP_201_CREATED
)
def create_activity(
    data: ActivityCreate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.create")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(current_user["tenant_id"])
    user_id = UUID(current_user["user_id"])

    activity_data = data.model_dump()

    # Automatically assign a task to its linked lead's salesperson.
    if (
        activity_data["activity_type"] == "Task"
        and activity_data["assigned_to"] is None
        and activity_data["lead_id"] is not None
    ):
        linked_lead = db.query(Lead).filter(
            Lead.id == activity_data["lead_id"],
            Lead.tenant_id == tenant_id
        ).first()

        if linked_lead:
            activity_data["assigned_to"] = linked_lead.assigned_to

    # Validate the assignee and linked CRM records.
    validated_data = ActivityCreate(**activity_data)
    validate_related_records(validated_data, tenant_id, db)

    activity = Activity(
        tenant_id=tenant_id,
        created_by=user_id,
        **activity_data
    )

    try:
        db.add(activity)
        db.commit()
        db.refresh(activity)
    except Exception:
        db.rollback()
        raise

    # Notify the assignee after the task has been saved.
    if (
        activity.activity_type == "Task"
        and activity.assigned_to is not None
    ):
        notify_assignment(
            db=db,
            tenant_id=tenant_id,
            recipient_user_id=activity.assigned_to,
            actor_user_id=user_id,
            title="New task assigned to you",
            message=(
                f'Task "{activity.title}" has been assigned to you.'
            ),
            related_module="activities",
            related_record_id=activity.id,
        )

    return activity

@router.get(
    "/",
    response_model=list[ActivityResponse]
)
def get_activities(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.view")),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    return db.query(Activity).filter(
        Activity.tenant_id == tenant_id
    ).order_by(Activity.created_at.desc()).all()


@router.get(
    "/my-tasks",
    response_model=list[ActivityResponse]
)
def get_my_tasks(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.view")),
    db: Session = Depends(get_db)
):
    user_id = UUID(current_user["user_id"])
    tenant_id = UUID(current_user["tenant_id"])

    tasks = db.query(Activity).filter(
        Activity.tenant_id == tenant_id,
        Activity.assigned_to == user_id
    ).order_by(Activity.created_at.desc()).all()

    return tasks


@router.get(
    "/{activity_id}",
    response_model=ActivityResponse
)
def get_activity(
    activity_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.view")),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    activity = db.query(Activity).filter(
        Activity.id == activity_id,
        Activity.tenant_id == tenant_id
    ).first()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found"
        )

    return activity



@router.put(
    "/{activity_id}",
    response_model=ActivityResponse
)
def update_activity(
    activity_id: UUID,
    data: ActivityUpdate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.update")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(current_user["tenant_id"])
    user_id = UUID(current_user["user_id"])

    activity = db.query(Activity).filter(
        Activity.id == activity_id,
        Activity.tenant_id == tenant_id
    ).first()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found"
        )

    previous_assigned_to = activity.assigned_to
    creator_user_id = activity.created_by
    changes = data.model_dump(exclude_unset=True)
    changed_fields = {}

    for field, value in changes.items():
        if value is not None:
            old_value = getattr(activity, field)

            if old_value != value:
                changed_fields[field] = (old_value, value)
                setattr(activity, field, value)

    updated_data = ActivityCreate(
        title=activity.title,
        description=activity.description,
        activity_type=activity.activity_type,
        status=activity.status,
        priority=activity.priority,
        due_date=activity.due_date,
        assigned_to=activity.assigned_to,
        lead_id=activity.lead_id,
        contact_id=activity.contact_id,
        account_id=activity.account_id,
        deal_id=activity.deal_id
    )

    validate_related_records(updated_data, tenant_id, db)

    if (
        activity.activity_type == "Task"
        and activity.assigned_to is None
        and activity.lead_id is not None
    ):
        linked_lead = db.query(Lead).filter(
            Lead.id == activity.lead_id,
            Lead.tenant_id == tenant_id
        ).first()

        if linked_lead:
            activity.assigned_to = linked_lead.assigned_to

    try:
        db.commit()
        db.refresh(activity)
    except Exception:
        db.rollback()
        raise

    if (
        activity.activity_type == "Task"
        and activity.assigned_to is not None
        and activity.assigned_to != previous_assigned_to
    ):
        notify_assignment(
            db=db,
            tenant_id=tenant_id,
            recipient_user_id=activity.assigned_to,
            actor_user_id=user_id,
            title="Task assigned to you",
            message=(
                f'Task "{activity.title}" has been assigned to you.'
            ),
            related_module="activities",
            related_record_id=activity.id,
        )

    if (
        activity.activity_type == "Task"
        and creator_user_id is not None
        and creator_user_id != user_id
        and changed_fields
    ):
        if "status" in changed_fields:
            old_status, new_status = changed_fields["status"]
            message = (
                f'The assigned salesperson updated your task '
                f'"{activity.title}" from {old_status} to {new_status}.'
            )
        else:
            message = (
                f'The assigned salesperson updated your task '
                f'"{activity.title}".'
            )

        notify_assignment(
            db=db,
            tenant_id=tenant_id,
            recipient_user_id=creator_user_id,
            actor_user_id=user_id,
            title="Task updated",
            message=message,
            related_module="activities",
            related_record_id=activity.id,
            notification_type="task_update",
        )

    return activity


@router.delete(
    "/{activity_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_activity(
    activity_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.delete")),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    activity = db.query(Activity).filter(
        Activity.id == activity_id,
        Activity.tenant_id == tenant_id
    ).first()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found"
        )

    db.delete(activity)
    db.commit()

    return
