from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.industry_modules import require_enabled_module
from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission

from app.models.activity import Activity
from app.models.activity_link import ActivityLink
from app.models.user import User
from app.models.lead import Lead
from app.models.contact import Contact
from app.models.account import Account
from app.models.deal import Deal
from app.models.tenant import Tenant
from app.models.property import Property
from app.models.building import Building
from app.models.project import Project as RealEstateProject
from app.models.buyer_requirement import BuyerRequirement
from app.models.property_match import PropertyMatch
from app.models.site_visit import SiteVisit
from app.models.booking import Booking
from app.models.software_project import SoftwareProject
from app.models.software_sprint import SoftwareSprint

from app.schemas.activity import (
    ActivityCreate,
    ActivityUpdate,
    ActivityResponse,
    ActivityLinkInput,
)

from app.services.notification_service import notify_assignment
from app.services.audit_service import log_audit


router = APIRouter(
    prefix="/api/v1/activities",
    tags=["Activities & Tasks"],
    dependencies=[
        Depends(require_enabled_module("activities")),
    ],
)

SOFTWARE_INDUSTRIES = {
    "software",
    "software services",
    "software services / it consulting",
    "software_services",
    "it consulting",
}

REAL_ESTATE_INDUSTRIES = {
    "real estate",
    "real_estate",
    "real-estate",
    "real estate services",
}

RELATED_MODULES = {
    "property": (Property, "real_estate"),
    "building": (Building, "real_estate"),
    "real_estate_project": (RealEstateProject, "real_estate"),
    "buyer_requirement": (BuyerRequirement, "real_estate"),
    "property_match": (PropertyMatch, "real_estate"),
    "site_visit": (SiteVisit, "real_estate"),
    "booking": (Booking, "real_estate"),
    "software_project": (SoftwareProject, "software"),
    "software_sprint": (SoftwareSprint, "software"),
}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_tenant_industry(db: Session, tenant_id: UUID) -> str:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found",
        )
    return (tenant.industry or "").strip().lower()


def classify_industry(industry: str) -> str | None:
    normalized = industry.replace("_", " ").replace("-", " ").strip().lower()
    if (
        normalized in {
            "software",
            "software services",
            "software services / it consulting",
            "it consulting",
        }
        or "software" in normalized
        or "it consulting" in normalized
    ):
        return "software"
    if "real estate" in normalized:
        return "real_estate"
    return None


def activity_audit_data(activity: Activity):
    return {
        "title": activity.title,
        "description": activity.description,
        "activity_type": activity.activity_type,
        "status": activity.status,
        "priority": activity.priority,
        "due_date": activity.due_date,
        "assigned_to": activity.assigned_to,
        "lead_id": activity.lead_id,
        "contact_id": activity.contact_id,
        "account_id": activity.account_id,
        "deal_id": activity.deal_id,
        "created_by": activity.created_by,
        "related_records": [
            {
                "module": link.module,
                "record_id": str(link.record_id),
            }
            for link in activity.related_records
        ],
    }


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
            model.tenant_id == tenant_id,
        ).first()

        if not record:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"{label} does not belong to this tenant",
            )


def validate_activity_links(
    related_records: list[ActivityLinkInput],
    tenant_id: UUID,
    db: Session,
) -> list[tuple[str, UUID]]:
    if not related_records:
        return []

    industry = get_tenant_industry(db, tenant_id)
    tenant_industry_type = classify_industry(industry)
    if tenant_industry_type is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Related activity links are not configured for this tenant industry",
        )

    normalized_links: list[tuple[str, UUID]] = []
    seen: set[tuple[str, UUID]] = set()

    for link in related_records:
        module = link.module
        record_id = link.record_id

        if module not in RELATED_MODULES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Unsupported related module: {module}",
            )

        model, module_industry = RELATED_MODULES[module]
        if module_industry != tenant_industry_type:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"The {module} relationship is not available for this tenant industry",
            )

        key = (module, record_id)
        if key in seen:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=f"Duplicate related record: {module} {record_id}",
            )
        seen.add(key)

        target = db.query(model).filter(
            model.id == record_id,
            model.tenant_id == tenant_id,
        ).first()
        if not target:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"The selected {module.replace('_', ' ')} does not belong to this tenant or does not exist",
            )

        normalized_links.append(key)

    link_map = dict(normalized_links)
    sprint_id = link_map.get("software_sprint")
    project_id = link_map.get("software_project")

    if sprint_id is not None:
        if project_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Select the Software Project when linking a task to a Software Sprint",
            )

        sprint = db.query(SoftwareSprint).filter(
            SoftwareSprint.id == sprint_id,
            SoftwareSprint.tenant_id == tenant_id,
        ).first()
        if sprint is None or sprint.software_project_id != project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The selected Software Sprint does not belong to the selected Software Project",
            )

    return normalized_links


def sync_activity_links(
    activity: Activity,
    links: list[tuple[str, UUID]],
    tenant_id: UUID,
) -> None:
    existing = {(link.module, link.record_id) for link in activity.related_records}
    requested = set(links)
    if existing == requested:
        return

    activity.related_records.clear()
    for module, record_id in links:
        activity.related_records.append(
            ActivityLink(
                tenant_id=tenant_id,
                module=module,
                record_id=record_id,
            )
        )


@router.post(
    "/",
    response_model=ActivityResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_activity(
    data: ActivityCreate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.create")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

    activity_data = data.model_dump(exclude={"related_records"})

    if (
        activity_data["activity_type"] == "Task"
        and activity_data["assigned_to"] is None
        and activity_data["lead_id"] is not None
    ):
        linked_lead = db.query(Lead).filter(
            Lead.id == activity_data["lead_id"],
            Lead.tenant_id == tenant_id,
        ).first()
        if linked_lead:
            activity_data["assigned_to"] = linked_lead.assigned_to

    validated_data = ActivityCreate(**activity_data)
    validate_related_records(validated_data, tenant_id, db)
    validated_links = validate_activity_links(data.related_records, tenant_id, db)

    activity = Activity(
        tenant_id=tenant_id,
        created_by=user_id,
        **activity_data,
    )

    try:
        db.add(activity)
        db.flush()
        sync_activity_links(activity, validated_links, tenant_id)
        db.flush()

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="create",
            module="activities",
            record_id=activity.id,
            description=f"Created activity {activity.title}",
            after_data=activity_audit_data(activity),
        )

        db.commit()
        db.refresh(activity)

    except Exception:
        db.rollback()
        raise

    if activity.activity_type == "Task" and activity.assigned_to is not None:
        notify_assignment(
            db=db,
            tenant_id=tenant_id,
            recipient_user_id=activity.assigned_to,
            actor_user_id=user_id,
            title="New task assigned to you",
            message=f'Task "{activity.title}" has been assigned to you.',
            related_module="activities",
            related_record_id=activity.id,
        )

    return activity


@router.get("/", response_model=list[ActivityResponse])
def get_activities(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    return db.query(Activity).filter(
        Activity.tenant_id == tenant_id
    ).order_by(Activity.created_at.desc()).all()


@router.get("/my-tasks", response_model=list[ActivityResponse])
def get_my_tasks(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.view")),
    db: Session = Depends(get_db),
):
    user_id = UUID(str(current_user["user_id"]))
    tenant_id = UUID(str(current_user["tenant_id"]))
    return db.query(Activity).filter(
        Activity.tenant_id == tenant_id,
        Activity.assigned_to == user_id,
    ).order_by(Activity.created_at.desc()).all()


@router.get("/related-modules")
def get_activity_related_modules(
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """Return related-record selectors supported for the signed-in tenant's industry."""
    tenant_id = UUID(str(current_user["tenant_id"]))
    industry = get_tenant_industry(db, tenant_id)

    tenant_industry_type = classify_industry(industry)
    if tenant_industry_type == "software":
        modules = [
            {"module": "software_project", "label": "Software Project"},
            {"module": "software_sprint", "label": "Sprint"},
        ]
    elif tenant_industry_type == "real_estate":
        modules = [
            {"module": "property", "label": "Property"},
            {"module": "building", "label": "Building"},
            {"module": "real_estate_project", "label": "Real Estate Project"},
            {"module": "buyer_requirement", "label": "Buyer Requirement"},
            {"module": "property_match", "label": "Property Match"},
            {"module": "site_visit", "label": "Site Visit"},
            {"module": "booking", "label": "Booking"},
        ]
    else:
        modules = []

    return {"industry": industry, "related_modules": modules}


@router.get("/{activity_id}", response_model=ActivityResponse)
def get_activity(
    activity_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    activity = db.query(Activity).filter(
        Activity.id == activity_id,
        Activity.tenant_id == tenant_id,
    ).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )
    return activity


@router.put("/{activity_id}", response_model=ActivityResponse)
def update_activity(
    activity_id: UUID,
    data: ActivityUpdate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.update")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

    activity = db.query(Activity).filter(
        Activity.id == activity_id,
        Activity.tenant_id == tenant_id,
    ).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )

    previous_assigned_to = activity.assigned_to
    creator_user_id = activity.created_by
    before_data = activity_audit_data(activity)

    changes = data.model_dump(exclude_unset=True)
    requested_links = None
    links_were_supplied = "related_records" in changes
    if links_were_supplied:
        requested_links = changes.pop("related_records")
        if requested_links is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="related_records must be a list; use an empty list to remove all links",
            )

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
        deal_id=activity.deal_id,
    )
    validate_related_records(updated_data, tenant_id, db)

    validated_links = None
    if links_were_supplied:
        link_inputs = [ActivityLinkInput(**item) for item in requested_links]
        validated_links = validate_activity_links(link_inputs, tenant_id, db)

    if (
        activity.activity_type == "Task"
        and activity.assigned_to is None
        and activity.lead_id is not None
    ):
        linked_lead = db.query(Lead).filter(
            Lead.id == activity.lead_id,
            Lead.tenant_id == tenant_id,
        ).first()
        if linked_lead:
            activity.assigned_to = linked_lead.assigned_to

    try:
        if validated_links is not None:
            sync_activity_links(activity, validated_links, tenant_id)

        db.flush()
        after_data = activity_audit_data(activity)
        has_changes = before_data != after_data

        if has_changes:
            log_audit(
                db=db,
                tenant_id=tenant_id,
                user_id=user_id,
                action="update",
                module="activities",
                record_id=activity.id,
                description=f"Updated activity {activity.title}",
                before_data=before_data,
                after_data=after_data,
            )

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
            message=f'Task "{activity.title}" has been assigned to you.',
            related_module="activities",
            related_record_id=activity.id,
        )

    if (
        activity.activity_type == "Task"
        and creator_user_id is not None
        and creator_user_id != user_id
        and before_data != after_data
    ):
        if "status" in changed_fields:
            old_status, new_status = changed_fields["status"]
            message = (
                f'The assigned salesperson updated your task '
                f'"{activity.title}" from {old_status} to {new_status}.'
            )
        else:
            message = f'The assigned salesperson updated your task "{activity.title}".'

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


@router.delete("/{activity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_activity(
    activity_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("activity.delete")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

    activity = db.query(Activity).filter(
        Activity.id == activity_id,
        Activity.tenant_id == tenant_id,
    ).first()
    if not activity:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Activity not found",
        )

    try:
        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="delete",
            module="activities",
            record_id=activity.id,
            description=f"Deleted activity {activity.title}",
            before_data=activity_audit_data(activity),
        )
        db.delete(activity)
        db.commit()
    except Exception:
        db.rollback()
        raise

    return None
