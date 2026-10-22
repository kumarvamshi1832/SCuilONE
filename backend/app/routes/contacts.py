
import logging
from uuid import UUID, uuid4
from app.services.notification_service import notify_assignment
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.models.contact import Contact
from app.models.user import User
from app.models.account import Account
from app.schemas.contact import ContactCreate, ContactUpdate, ContactResponse
from app.services.workflow_engine import dispatch_workflows


logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/api/v1/contacts",
    tags=["Contacts"]
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


def validate_account(
    account_id: UUID | None,
    tenant_id,
    db: Session
):
    if account_id is None:
        return

    account = db.query(Account).filter(
        Account.id == account_id,
        Account.tenant_id == tenant_id
    ).first()

    if not account:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account does not belong to this tenant"
        )



def run_contact_workflows(
    db: Session,
    tenant_id: UUID,
    contact: Contact,
    trigger_event: str,
    event_id: str,
    changed_fields: set = None
):
    try:
        dispatch_workflows(
            db=db,
            tenant_id=tenant_id,
            module_name="contacts",
            trigger_event=trigger_event,
            record=contact,
            event_id=event_id,
            changed_fields=changed_fields
        )
        db.commit()

    except Exception:
        db.rollback()
        logger.exception(
            "Workflow dispatch failed for contact %s, event %s",
            contact.id,
            trigger_event
        )


@router.post(
    "/",
    response_model=ContactResponse,
    status_code=status.HTTP_201_CREATED
)
def create_contact(
    data: ContactCreate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("contact.create")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

    validate_assigned_user(
        data.assigned_to,
        tenant_id,
        db
    )

    validate_account(
        data.account_id,
        tenant_id,
        db
    )

    assigned_to = data.assigned_to

    if assigned_to is None and data.account_id is not None:
        account = db.query(Account).filter(
            Account.id == data.account_id,
            Account.tenant_id == tenant_id
        ).first()

        if account and account.assigned_to is not None:
            assigned_to = account.assigned_to

    contact = Contact(
        tenant_id=tenant_id,
        created_by=user_id,
        account_id=data.account_id,
        full_name=data.full_name,
        email=data.email,
        phone=data.phone,
        company=data.company,
        job_title=data.job_title,
        address=data.address,
        source=data.source,
        assigned_to=assigned_to,
        notes=data.notes
    )

    db.add(contact)
    db.commit()
    db.refresh(contact)

    run_contact_workflows(
        db=db,
        tenant_id=tenant_id,
        contact=contact,
        trigger_event="record_created",
        event_id=str(contact.id)
    )

    if (
        contact.assigned_to is not None
        and contact.assigned_to != user_id
    ):
        try:
            notify_assignment(
                db=db,
                tenant_id=tenant_id,
                recipient_user_id=contact.assigned_to,
                actor_user_id=user_id,
                title="New contact assigned to you",
                message=(
                    f'Contact "{contact.full_name}" '
                    f'has been assigned to you.'
                ),
                related_module="contacts",
                related_record_id=contact.id,
            )
        except Exception:
            db.rollback()
            logger.exception(
                "Failed to notify contact assignee. Contact ID: %s",
                contact.id
            )

    db.refresh(contact)
    return contact


@router.get(
    "/",
    response_model=list[ContactResponse]
)
def get_contacts(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("contact.view")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(current_user["tenant_id"])

    contacts = db.query(Contact).filter(
        Contact.tenant_id == tenant_id
    ).all()

    return contacts


@router.get(
    "/my-contacts",
    response_model=list[ContactResponse]
)
def get_my_contacts(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("contact.view")),
    db: Session = Depends(get_db)
):
    user_id = UUID(current_user["user_id"])
    tenant_id = UUID(current_user["tenant_id"])

    contacts = db.query(Contact).filter(
        Contact.tenant_id == tenant_id,
        Contact.assigned_to == user_id
    ).all()

    return contacts


@router.get(
    "/{contact_id}",
    response_model=ContactResponse
)
def get_contact(
    contact_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("contact.view")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(current_user["tenant_id"])

    contact = db.query(Contact).filter(
        Contact.id == contact_id,
        Contact.tenant_id == tenant_id
    ).first()

    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found"
        )

    return contact




@router.put(
    "/{contact_id}",
    response_model=ContactResponse
)
def update_contact(
    contact_id: UUID,
    data: ContactUpdate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("contact.update")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

    contact = db.query(Contact).filter(
        Contact.id == contact_id,
        Contact.tenant_id == tenant_id
    ).first()

    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found"
        )

    creator_user_id = contact.created_by
    previous_assigned_to = contact.assigned_to

    if data.assigned_to is not None:
        validate_assigned_user(
            data.assigned_to,
            tenant_id,
            db
        )

    if data.account_id is not None:
        validate_account(
            data.account_id,
            tenant_id,
            db
        )

    update_data = data.model_dump(exclude_unset=True)
    changed_values = {}

    for field, new_value in update_data.items():
        old_value = getattr(contact, field, None)

        if old_value != new_value:
            changed_values[field] = (old_value, new_value)

    if not changed_values:
        return contact

    changed_fields = set(changed_values.keys())

    try:
        for field, (_, new_value) in changed_values.items():
            setattr(contact, field, new_value)

        db.commit()
        db.refresh(contact)

    except Exception:
        db.rollback()
        raise

    # Notify the new assignee when the contact is assigned or reassigned.
    if (
        contact.assigned_to is not None
        and contact.assigned_to != previous_assigned_to
        and contact.assigned_to != user_id
    ):
        try:
            notify_assignment(
                db=db,
                tenant_id=tenant_id,
                recipient_user_id=contact.assigned_to,
                actor_user_id=user_id,
                title="Contact assigned to you",
                message=(
                    f'Contact "{contact.full_name}" '
                    f'has been assigned to you.'
                ),
                related_module="contacts",
                related_record_id=contact.id,
            )
        except Exception:
            logger.exception(
                "Failed to notify contact assignee. Contact ID: %s",
                contact.id
            )
            db.rollback()

    # Notify the assigned salesperson when the creator updates the contact.
    if (
        creator_user_id is not None
        and creator_user_id == user_id
        and contact.assigned_to is not None
        and contact.assigned_to != user_id
    ):
        changed_field_names = ", ".join(sorted(changed_fields))

        try:
            notify_assignment(
                db=db,
                tenant_id=tenant_id,
                recipient_user_id=contact.assigned_to,
                actor_user_id=user_id,
                title="Assigned contact updated",
                message=(
                    f'The contact creator updated your assigned '
                    f'contact "{contact.full_name}". '
                    f"Changed fields: {changed_field_names}."
                ),
                related_module="contacts",
                related_record_id=contact.id,
                notification_type="contact_update",
            )
        except Exception:
            logger.exception(
                "Failed to notify contact assignee about creator update. "
                "Contact ID: %s",
                contact.id
            )
            db.rollback()

    # Notify the original creator when another user updates the contact.
    elif (
        creator_user_id is not None
        and creator_user_id != user_id
    ):
        if "assigned_to" in changed_values:
            message = (
                f'Contact "{contact.full_name}" was reassigned.'
            )
        else:
            message = (
                f'Contact "{contact.full_name}" was updated.'
            )

        try:
            notify_assignment(
                db=db,
                tenant_id=tenant_id,
                recipient_user_id=creator_user_id,
                actor_user_id=user_id,
                title="Contact updated",
                message=message,
                related_module="contacts",
                related_record_id=contact.id,
                notification_type="contact_update",
            )
        except Exception:
            logger.exception(
                "Failed to notify contact creator. Contact ID: %s",
                contact.id
            )
            db.rollback()

    # Preserve existing workflow dispatch.
    event_base = (
        f"{contact.id}:{contact.updated_at.isoformat()}"
        if getattr(contact, "updated_at", None)
        else f"{contact.id}:{uuid4()}"
    )

    try:
        run_contact_workflows(
            db=db,
            tenant_id=tenant_id,
            contact=contact,
            trigger_event="record_updated",
            event_id=f"{event_base}:record_updated"
        )

        run_contact_workflows(
            db=db,
            tenant_id=tenant_id,
            contact=contact,
            trigger_event="field_changed",
            event_id=f"{event_base}:field_changed",
            changed_fields=changed_fields
        )

        db.commit()
        db.refresh(contact)

    except Exception:
        db.rollback()
        logger.exception(
            "Workflow dispatch failed after contact update. Contact ID: %s",
            contact.id
        )

    return contact

@router.delete(
    "/{contact_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_contact(
    contact_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("contact.delete")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(current_user["tenant_id"])

    contact = db.query(Contact).filter(
        Contact.id == contact_id,
        Contact.tenant_id == tenant_id
    ).first()

    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found"
        )

    db.delete(contact)
    db.commit()

    return
