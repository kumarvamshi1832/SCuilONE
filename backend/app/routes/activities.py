from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission, require_any_permission

from app.models.activity import Activity
from app.models.user import User
from app.models.role import Role
from app.models.user_role import UserRole
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


def check_is_team_lead(current_user: dict, db: Session) -> bool:
    role_str = (current_user.get("role") or "").upper()
    team_lead_roles = ("OWNER", "ADMIN", "MANAGER", "AUDITOR", "READ_ONLY", "READ-ONLY")
    if any(r in role_str for r in team_lead_roles):
        return True

    user_id = UUID(str(current_user["user_id"]))
    user_roles = (
        db.query(Role)
        .join(UserRole, UserRole.role_id == Role.id)
        .filter(UserRole.user_id == user_id)
        .all()
    )
    for r in user_roles:
        r_name = r.name.upper()
        if any(lead_role in r_name for lead_role in team_lead_roles):
            return True

    return False


def validate_related_records(data, tenant_id: UUID, db: Session):
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
    "",
    response_model=ActivityResponse,
    status_code=status.HTTP_201_CREATED,
    include_in_schema=False
)
@router.post(
    "/",
    response_model=ActivityResponse,
    status_code=status.HTTP_201_CREATED
)
def create_activity(
    data: ActivityCreate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_any_permission("activity.create", "task.create")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(str(current_user["tenant_id"]))

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
    "",
    response_model=list[ActivityResponse],
    include_in_schema=False
)
@router.get(
    "/",
    response_model=list[ActivityResponse]
)
def get_activities(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_any_permission("activity.view", "task.view")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

    is_team_lead = check_is_team_lead(current_user, db)

    if not is_team_lead:
        return db.query(Activity).filter(
            Activity.tenant_id == tenant_id,
            Activity.assigned_to == user_id
        ).order_by(Activity.created_at.desc()).all()

    return db.query(Activity).filter(
        Activity.tenant_id == tenant_id
    ).order_by(Activity.created_at.desc()).all()


@router.get(
    "/my-tasks",
    response_model=list[ActivityResponse]
)
def get_my_tasks(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_any_permission("activity.view", "task.view")),
    db: Session = Depends(get_db)
):
    user_id = UUID(str(current_user["user_id"]))
    tenant_id = UUID(str(current_user["tenant_id"]))

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
    _=Depends(require_any_permission("activity.view", "task.view")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

    activity = db.query(Activity).filter(
        Activity.id == activity_id,
        Activity.tenant_id == tenant_id
    ).first()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found"
        )

    is_team_lead = check_is_team_lead(current_user, db)
    if not is_team_lead and activity.assigned_to != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to access this activity"
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
    _=Depends(require_any_permission("activity.update", "task.update")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

    activity = db.query(Activity).filter(
        Activity.id == activity_id,
        Activity.tenant_id == tenant_id
    ).first()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found"
        )

    is_team_lead = check_is_team_lead(current_user, db)
    if not is_team_lead and activity.assigned_to != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to modify this activity"
        )

    changes = data.model_dump(exclude_unset=True)

    for field, value in changes.items():
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
    current_user: dict = Depends(require_active_user),
    _=Depends(require_any_permission("activity.delete", "task.delete")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

    activity = db.query(Activity).filter(
        Activity.id == activity_id,
        Activity.tenant_id == tenant_id
    ).first()

    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found"
        )

    is_team_lead = check_is_team_lead(current_user, db)
    if not is_team_lead and activity.assigned_to != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to delete this activity"
        )

    db.delete(activity)
    db.commit()

    return
