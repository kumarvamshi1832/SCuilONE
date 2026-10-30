import uuid
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session, selectinload

from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.account import Account
from app.models.contact import Contact
from app.models.software_project import SoftwareProject
from app.models.support_ticket import SupportTicket, SupportTicketComment
from app.models.user import User
from app.schemas.support_tickets import (
    SupportTicketCommentCreate, SupportTicketCommentResponse,
    SupportTicketCreate, SupportTicketDetailResponse, SupportTicketListResponse,
    SupportTicketResponse, SupportTicketUpdate,
)
from app.services.audit_service import log_audit


router = APIRouter(prefix="/api/v1/support-tickets", tags=["Customer Support"])

STATUS_TRANSITIONS = {
    "Open": {"In Progress", "Waiting on Customer", "Resolved", "Closed"},
    "In Progress": {"Open", "Waiting on Customer", "Resolved", "Closed"},
    "Waiting on Customer": {"Open", "In Progress", "Resolved", "Closed"},
    "Resolved": {"Open", "Closed"},
    "Closed": set(),
}


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_tenant_user(current_user: dict) -> tuple[UUID, UUID]:
    try:
        return UUID(str(current_user["tenant_id"])), UUID(str(current_user["user_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid user or tenant information.")


def generate_ticket_number() -> str:
    return f"SUP-{datetime.utcnow():%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"


def ticket_snapshot(ticket: SupportTicket) -> dict:
    return {
        "ticket_number": ticket.ticket_number,
        "subject": ticket.subject,
        "category": ticket.category,
        "status": ticket.status,
        "priority": ticket.priority,
        "source": ticket.source,
        "account_id": ticket.account_id,
        "contact_id": ticket.contact_id,
        "software_project_id": ticket.software_project_id,
        "assigned_to": ticket.assigned_to,
        "resolution": ticket.resolution,
    }


def get_ticket_or_404(db: Session, tenant_id: UUID, ticket_id: UUID) -> SupportTicket:
    ticket = db.query(SupportTicket).filter(
        SupportTicket.id == ticket_id,
        SupportTicket.tenant_id == tenant_id,
    ).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found.")
    return ticket


def validate_references(db: Session, tenant_id: UUID, payload) -> None:
    values = payload.model_dump(exclude_unset=True)
    assigned_to = values.get("assigned_to")
    if assigned_to is not None:
        user = db.query(User).filter(
            User.id == assigned_to, User.tenant_id == tenant_id, User.status == "Active"
        ).first()
        if not user:
            raise HTTPException(status_code=400, detail="Assigned support agent must be active and belong to this tenant.")

    for field, model, label in (
        ("account_id", Account, "Account"),
        ("contact_id", Contact, "Contact"),
        ("software_project_id", SoftwareProject, "Software project"),
    ):
        record_id = values.get(field)
        if record_id is not None:
            record = db.query(model).filter(
                model.id == record_id, model.tenant_id == tenant_id
            ).first()
            if not record:
                raise HTTPException(status_code=400, detail=f"{label} does not belong to this tenant or does not exist.")

    contact_id = values.get("contact_id")
    account_id = values.get("account_id")
    if contact_id and account_id:
        contact = db.query(Contact).filter(
            Contact.id == contact_id, Contact.tenant_id == tenant_id
        ).first()
        if contact and contact.account_id and contact.account_id != account_id:
            raise HTTPException(status_code=400, detail="The selected contact does not belong to the selected account.")


def apply_status_transition(ticket: SupportTicket, requested_status: str | None, resolution: str | None) -> None:
    if requested_status and requested_status != ticket.status:
        if requested_status not in STATUS_TRANSITIONS.get(ticket.status, set()):
            raise HTTPException(status_code=400, detail=f"Cannot change ticket status from '{ticket.status}' to '{requested_status}'.")
        if requested_status == "Resolved":
            if not (resolution or ticket.resolution):
                raise HTTPException(status_code=400, detail="Provide a resolution before resolving the ticket.")
            ticket.resolved_at = datetime.utcnow()
        elif requested_status == "Closed":
            ticket.closed_at = datetime.utcnow()
        elif requested_status == "Open":
            ticket.resolved_at = None
            ticket.closed_at = None
        ticket.status = requested_status


@router.post("", response_model=SupportTicketResponse, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_permission("support_ticket.create"))])
def create_support_ticket(payload: SupportTicketCreate,
                          current_user: dict = Depends(require_active_user),
                          db: Session = Depends(get_db)):
    tenant_id, user_id = get_tenant_user(current_user)
    validate_references(db, tenant_id, payload)
    ticket_data = payload.model_dump(mode="python")
    if ticket_data.get("requester_email"):
        ticket_data["requester_email"] = ticket_data["requester_email"].strip().lower()
    ticket = SupportTicket(
        tenant_id=tenant_id, ticket_number=generate_ticket_number(),
        created_by=user_id, **ticket_data,
    )
    try:
        db.add(ticket)
        db.flush()
        log_audit(db, tenant_id, user_id, "CREATE", "support_tickets", ticket.id,
                  f"Created support ticket {ticket.ticket_number}", after_data=ticket_snapshot(ticket))
        db.commit()
        db.refresh(ticket)
        return ticket
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Could not create ticket due to a conflicting ticket number.")
    except Exception:
        db.rollback()
        raise


@router.get("", response_model=SupportTicketListResponse,
            dependencies=[Depends(require_permission("support_ticket.view"))])
def list_support_tickets(current_user: dict = Depends(require_active_user),
                         db: Session = Depends(get_db),
                         ticket_status: str | None = Query(default=None, alias="status"),
                         priority: str | None = None,
                         assigned_to: UUID | None = None,
                         account_id: UUID | None = None,
                         search: str | None = Query(default=None, min_length=1, max_length=200),
                         limit: int = Query(default=20, ge=1, le=100),
                         offset: int = Query(default=0, ge=0)):
    tenant_id, _ = get_tenant_user(current_user)
    query = db.query(SupportTicket).filter(SupportTicket.tenant_id == tenant_id)
    if ticket_status:
        query = query.filter(SupportTicket.status == ticket_status)
    if priority:
        query = query.filter(SupportTicket.priority == priority)
    if assigned_to:
        query = query.filter(SupportTicket.assigned_to == assigned_to)
    if account_id:
        query = query.filter(SupportTicket.account_id == account_id)
    if search:
        query = query.filter(
            SupportTicket.subject.ilike(f"%{search}%") |
            SupportTicket.ticket_number.ilike(f"%{search}%") |
            SupportTicket.requester_name.ilike(f"%{search}%")
        )
    total = query.count()
    items = query.order_by(SupportTicket.created_at.desc()).offset(offset).limit(limit).all()
    return {"items": items, "total": total, "limit": limit, "offset": offset}


@router.get("/{ticket_id}", response_model=SupportTicketDetailResponse,
            dependencies=[Depends(require_permission("support_ticket.view"))])
def get_support_ticket(ticket_id: UUID, current_user: dict = Depends(require_active_user),
                       db: Session = Depends(get_db)):
    tenant_id, _ = get_tenant_user(current_user)
    ticket = db.query(SupportTicket).options(selectinload(SupportTicket.comments)).filter(
        SupportTicket.id == ticket_id, SupportTicket.tenant_id == tenant_id
    ).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found.")
    return ticket


@router.patch("/{ticket_id}", response_model=SupportTicketResponse,
              dependencies=[Depends(require_permission("support_ticket.update"))])
def update_support_ticket(ticket_id: UUID, payload: SupportTicketUpdate,
                          current_user: dict = Depends(require_active_user),
                          db: Session = Depends(get_db)):
    tenant_id, user_id = get_tenant_user(current_user)
    ticket = get_ticket_or_404(db, tenant_id, ticket_id)
    changes = payload.model_dump(exclude_unset=True, mode="python")
    validate_references(db, tenant_id, payload)
    effective_account_id = changes.get("account_id", ticket.account_id)
    effective_contact_id = changes.get("contact_id", ticket.contact_id)
    if effective_account_id and effective_contact_id:
        effective_contact = db.query(Contact).filter(
            Contact.id == effective_contact_id,
            Contact.tenant_id == tenant_id,
        ).first()
        if effective_contact and effective_contact.account_id and effective_contact.account_id != effective_account_id:
            raise HTTPException(status_code=400, detail="The selected contact does not belong to the selected account.")
    before_data = ticket_snapshot(ticket)
    requested_status = changes.pop("status", None)
    requested_resolution = changes.get("resolution", ticket.resolution)
    apply_status_transition(ticket, requested_status, requested_resolution)
    for field, value in changes.items():
        if field == "requester_email" and value is not None:
            value = str(value).lower()
        setattr(ticket, field, value)
    try:
        db.flush()
        log_audit(db, tenant_id, user_id, "UPDATE", "support_tickets", ticket.id,
                  f"Updated support ticket {ticket.ticket_number}", before_data=before_data,
                  after_data=ticket_snapshot(ticket))
        db.commit()
        db.refresh(ticket)
        return ticket
    except Exception:
        db.rollback()
        raise


@router.post("/{ticket_id}/comments", response_model=SupportTicketCommentResponse,
             status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_permission("support_ticket.update"))])
def add_ticket_comment(ticket_id: UUID, payload: SupportTicketCommentCreate,
                       current_user: dict = Depends(require_active_user),
                       db: Session = Depends(get_db)):
    tenant_id, user_id = get_tenant_user(current_user)
    ticket = get_ticket_or_404(db, tenant_id, ticket_id)
    if ticket.status == "Closed":
        raise HTTPException(status_code=400, detail="Cannot add a comment to a closed ticket.")
    comment = SupportTicketComment(
        tenant_id=tenant_id, ticket_id=ticket.id, author_user_id=user_id,
        body=payload.body, is_internal=payload.is_internal,
    )
    try:
        db.add(comment)
        db.flush()
        log_audit(db, tenant_id, user_id, "CREATE", "support_ticket_comments", comment.id,
                  f"Added comment to support ticket {ticket.ticket_number}",
                  after_data={"ticket_id": ticket.id, "is_internal": comment.is_internal})
        db.commit()
        db.refresh(comment)
        return comment
    except Exception:
        db.rollback()
        raise


@router.delete("/{ticket_id}", status_code=status.HTTP_204_NO_CONTENT,
               dependencies=[Depends(require_permission("support_ticket.delete"))])
def delete_support_ticket(ticket_id: UUID, current_user: dict = Depends(require_active_user),
                          db: Session = Depends(get_db)):
    tenant_id, user_id = get_tenant_user(current_user)
    ticket = get_ticket_or_404(db, tenant_id, ticket_id)
    if ticket.status != "Closed":
        raise HTTPException(status_code=409, detail="Only closed tickets can be deleted. Close the ticket first.")
    before_data = ticket_snapshot(ticket)
    try:
        log_audit(db, tenant_id, user_id, "DELETE", "support_tickets", ticket.id,
                  f"Deleted support ticket {ticket.ticket_number}", before_data=before_data)
        db.delete(ticket)
        db.commit()
        return None
    except Exception:
        db.rollback()
        raise
