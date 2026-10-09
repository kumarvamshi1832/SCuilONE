
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.core.dependencies import get_current_user
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
    current_user: dict = Depends(get_current_user),
    _=Depends(require_permission("activity.create")),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    validate_related_records(data, tenant_id, db)

    activity = Activity(
        tenant_id=tenant_id,
        **data.model_dump()
    )

    db.add(activity)
    db.commit()
    db.refresh(activity)

    return activity


@router.get(
    "/",
    response_model=list[ActivityResponse]
)
def get_activities(
    current_user: dict = Depends(get_current_user),
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
    current_user: dict = Depends(get_current_user),
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
    current_user: dict = Depends(get_current_user),
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
    current_user: dict = Depends(get_current_user),
    _=Depends(require_permission("activity.update")),
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

    changes = data.model_dump(exclude_unset=True)

    for field, value in changes.items():
        if value is not None:
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

    db.commit()
    db.refresh(activity)

    return activity


@router.delete(
    "/{activity_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_activity(
    activity_id: UUID,
    current_user: dict = Depends(get_current_user),
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