from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.core.dependencies import get_current_user
from app.core.permissions import require_permission
from app.models.contact import Contact
from app.models.user import User
from app.schemas.contact import ContactCreate, ContactUpdate, ContactResponse


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


@router.post(
    "/",
    response_model=ContactResponse,
    status_code=status.HTTP_201_CREATED
)
def create_contact(
    data: ContactCreate,
    current_user: dict = Depends(get_current_user),
    permission=Depends(require_permission("contact.create")),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    validate_assigned_user(
        data.assigned_to,
        tenant_id,
        db
    )

    contact = Contact(
        tenant_id=tenant_id,
        full_name=data.full_name,
        email=data.email,
        phone=data.phone,
        company=data.company,
        job_title=data.job_title,
        address=data.address,
        source=data.source,
        assigned_to=data.assigned_to,
        notes=data.notes
    )

    db.add(contact)
    db.commit()
    db.refresh(contact)

    return contact


@router.get(
    "/",
    response_model=list[ContactResponse]
)
def get_contacts(
    current_user: dict = Depends(get_current_user),
    _=Depends(require_permission("contact.view")),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    contacts = db.query(Contact).filter(
        Contact.tenant_id == tenant_id
    ).all()

    return contacts


@router.get(
    "/{contact_id}",
    response_model=ContactResponse
)
def get_contact(
    contact_id: UUID,
    current_user: dict = Depends(get_current_user),
    _=Depends(require_permission("contact.view")),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

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
    current_user: dict = Depends(get_current_user),
    _=Depends(require_permission("contact.update")),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    if data.assigned_to is not None:
        validate_assigned_user(
            data.assigned_to,
            tenant_id,
            db
        )

    contact = db.query(Contact).filter(
        Contact.id == contact_id,
        Contact.tenant_id == tenant_id
    ).first()

    if not contact:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Contact not found"
        )

    if data.full_name is not None:
        contact.full_name = data.full_name

    if data.email is not None:
        contact.email = data.email

    if data.phone is not None:
        contact.phone = data.phone

    if data.company is not None:
        contact.company = data.company

    if data.job_title is not None:
        contact.job_title = data.job_title

    if data.address is not None:
        contact.address = data.address

    if data.source is not None:
        contact.source = data.source

    if data.assigned_to is not None:
        contact.assigned_to = data.assigned_to

    if data.notes is not None:
        contact.notes = data.notes

    db.commit()
    db.refresh(contact)

    return contact


@router.delete(
    "/{contact_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_contact(
    contact_id: UUID,
    current_user: dict = Depends(get_current_user),
    _=Depends(require_permission("contact.delete")),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

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