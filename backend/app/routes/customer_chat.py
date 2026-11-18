from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.account import Account
from app.models.contact import Contact
from app.models.customer_chat import (
    CustomerChatAssignmentHistory, CustomerChatConversation,
    CustomerChatMessage, CustomerChatParticipant,
)
from app.models.customer_portal import CustomerPortalUser
from app.models.customer_portal_lifecycle import CustomerPortalNotification
from app.models.notification import Notification
from app.models.permission import Permission
from app.models.role_permission import RolePermission
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.user import User
from app.services.audit_service import log_audit
from app.routes.customer_portal import require_portal_user

staff_router = APIRouter(prefix="/api/v1/customer-chat", tags=["Customer Chat - Staff"])
portal_router = APIRouter(prefix="/api/v1/customer-portal/chat", tags=["Customer Chat - Customer"])


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


class MessageCreate(BaseModel):
    content: str = Field(min_length=1, max_length=10000)


class AssignmentUpdate(BaseModel):
    user_id: UUID
    reason: str | None = Field(default=None, max_length=500)


class ParticipantCreate(BaseModel):
    user_id: UUID


class ConversationStatusUpdate(BaseModel):
    status: str = Field(pattern="^(Open|Closed)$")


def _now():
    return datetime.now(timezone.utc)


def _staff_ids(current_user: dict):
    return UUID(str(current_user["tenant_id"])), UUID(str(current_user["user_id"]))


def _conversation(db: Session, tenant_id: UUID, conversation_id: UUID):
    row = db.query(CustomerChatConversation).filter(
        CustomerChatConversation.id == conversation_id,
        CustomerChatConversation.tenant_id == tenant_id,
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    return row


def _is_manager(current_user: dict) -> bool:
    return current_user.get("role") in {"Tenant Owner", "Tenant Admin", "Manager"}


def _participant(db: Session, conversation_id: UUID, user_id: UUID):
    return db.query(CustomerChatParticipant).filter(
        CustomerChatParticipant.conversation_id == conversation_id,
        CustomerChatParticipant.user_id == user_id,
        CustomerChatParticipant.status == "Active",
    ).first()


def _can_access(db: Session, conversation: CustomerChatConversation, user_id: UUID, current_user: dict):
    if _is_manager(current_user):
        return True
    return _participant(db, conversation.id, user_id) is not None


def _message_json(row: CustomerChatMessage):
    return {
        "id": str(row.id), "sender_type": row.sender_type,
        "sender_user_id": str(row.sender_user_id) if row.sender_user_id else None,
        "sender_portal_user_id": str(row.sender_portal_user_id) if row.sender_portal_user_id else None,
        "content": row.content, "created_at": row.created_at,
        "edited_at": row.edited_at,
    }


def _conversation_json(db: Session, row: CustomerChatConversation):
    portal_user = db.query(CustomerPortalUser).filter(CustomerPortalUser.id == row.portal_user_id).first()
    contact = db.query(Contact).filter(Contact.id == row.contact_id, Contact.tenant_id == row.tenant_id).first()
    account = db.query(Account).filter(Account.id == row.account_id, Account.tenant_id == row.tenant_id).first()
    assignee = db.query(User).filter(User.id == row.primary_assignee_user_id, User.tenant_id == row.tenant_id).first() if row.primary_assignee_user_id else None
    return {
        "id": str(row.id), "tenant_id": str(row.tenant_id),
        "portal_user_id": str(row.portal_user_id), "customer_name": contact.full_name if contact else None,
        "customer_email": portal_user.email if portal_user else None,
        "account_id": str(row.account_id), "account_name": account.name if account else None,
        "original_inviter_user_id": str(row.original_inviter_user_id) if row.original_inviter_user_id else None,
        "primary_assignee": {"id": str(assignee.id), "name": assignee.full_name} if assignee else None,
        "status": row.status, "last_message_at": row.last_message_at,
        "created_at": row.created_at,
    }


def _notify_staff(db: Session, tenant_id: UUID, user_id: UUID | None, title: str, message: str, conversation_id: UUID):
    if not user_id:
        return
    active = db.query(User.id).filter(User.id == user_id, User.tenant_id == tenant_id, User.status == "Active").first()
    if active:
        db.add(Notification(tenant_id=tenant_id, recipient_user_id=user_id, title=title, message=message,
                            notification_type="customer_chat", related_module="customer_chat",
                            related_record_id=conversation_id, is_read=False))


def _notify_customer(db: Session, conversation: CustomerChatConversation, title: str, message: str):
    db.add(CustomerPortalNotification(tenant_id=conversation.tenant_id, portal_user_id=conversation.portal_user_id,
        title=title, message=message, notification_type="customer_chat", related_module="customer_chat",
        related_record_id=conversation.id, is_read=False))


@staff_router.get("/staff", dependencies=[Depends(require_permission("customer_chat.manage"))])
def eligible_staff(current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, _ = _staff_ids(current_user)
    permission = db.query(Permission).filter(Permission.name == "customer_chat.access").first()
    if not permission:
        raise HTTPException(status_code=500, detail="Customer chat permissions have not been seeded.")
    rows = db.query(User).join(UserRole, UserRole.user_id == User.id).join(
        RolePermission, RolePermission.role_id == UserRole.role_id
    ).filter(
        User.tenant_id == tenant_id, User.status == "Active",
        RolePermission.permission_id == permission.id,
    ).distinct().order_by(User.full_name.asc()).all()
    return [{"id": str(u.id), "full_name": u.full_name, "email": u.email} for u in rows]


@staff_router.get("/conversations", dependencies=[Depends(require_permission("customer_chat.access"))])
def list_staff_conversations(current_user: dict = Depends(require_active_user), db: Session = Depends(get_db),
                            status_filter: str | None = Query(default=None, alias="status"), limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0)):
    tenant_id, user_id = _staff_ids(current_user)
    q = db.query(CustomerChatConversation).filter(CustomerChatConversation.tenant_id == tenant_id)
    if not _is_manager(current_user):
        q = q.join(CustomerChatParticipant, CustomerChatParticipant.conversation_id == CustomerChatConversation.id).filter(
            CustomerChatParticipant.user_id == user_id, CustomerChatParticipant.status == "Active")
    if status_filter:
        q = q.filter(CustomerChatConversation.status == status_filter)
    rows = q.order_by(CustomerChatConversation.last_message_at.desc()).offset(offset).limit(limit).all()
    results = []
    for row in rows:
        item = _conversation_json(db, row)
        participant = _participant(db, row.id, user_id)
        if participant:
            unread_q = db.query(func.count(CustomerChatMessage.id)).filter(
                CustomerChatMessage.conversation_id == row.id,
                CustomerChatMessage.sender_type == "Customer",
                CustomerChatMessage.deleted_at.is_(None),
            )
            if participant.last_read_at:
                unread_q = unread_q.filter(CustomerChatMessage.created_at > participant.last_read_at)
            item["unread_count"] = unread_q.scalar() or 0
        else:
            item["unread_count"] = 0
        results.append(item)
    return results


@staff_router.get("/conversations/{conversation_id}", dependencies=[Depends(require_permission("customer_chat.access"))])
def get_staff_conversation(conversation_id: UUID, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = _staff_ids(current_user)
    row = _conversation(db, tenant_id, conversation_id)
    if not _can_access(db, row, user_id, current_user):
        raise HTTPException(status_code=403, detail="You are not a participant in this customer conversation.")
    participant = _participant(db, row.id, user_id)
    if participant:
        participant.last_read_at = _now()
        db.commit()
    return {**_conversation_json(db, row), "messages": [_message_json(m) for m in db.query(CustomerChatMessage).filter(
        CustomerChatMessage.conversation_id == row.id, CustomerChatMessage.deleted_at.is_(None)).order_by(CustomerChatMessage.created_at.asc()).limit(500).all()]}


@staff_router.post("/conversations/{conversation_id}/messages", status_code=201, dependencies=[Depends(require_permission("customer_chat.access"))])
def send_staff_message(conversation_id: UUID, payload: MessageCreate, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = _staff_ids(current_user)
    row = _conversation(db, tenant_id, conversation_id)
    if row.status == "Closed":
        raise HTTPException(status_code=409, detail="This conversation is closed.")
    if not _can_access(db, row, user_id, current_user):
        raise HTTPException(status_code=403, detail="You are not a participant in this customer conversation.")
    participant = _participant(db, row.id, user_id)
    if not participant and not _is_manager(current_user):
        raise HTTPException(status_code=403, detail="Only active conversation participants can reply.")
    message = CustomerChatMessage(tenant_id=tenant_id, conversation_id=row.id, sender_type="Staff", sender_user_id=user_id, content=payload.content.strip())
    db.add(message)
    row.last_message_at = _now()
    if participant:
        participant.last_read_at = row.last_message_at
    _notify_customer(db, row, "New message from your SCuilONE team", f"You have a new message about your customer conversation.")
    db.commit(); db.refresh(message)
    return _message_json(message)


@staff_router.patch("/conversations/{conversation_id}/assignment", dependencies=[Depends(require_permission("customer_chat.manage"))])
def assign_primary(conversation_id: UUID, payload: AssignmentUpdate, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, actor_id = _staff_ids(current_user)
    row = _conversation(db, tenant_id, conversation_id)
    target = db.query(User).filter(User.id == payload.user_id, User.tenant_id == tenant_id, User.status == "Active").first()
    if not target:
        raise HTTPException(status_code=404, detail="The selected employee is not active in this tenant.")
    previous = row.primary_assignee_user_id
    if previous == target.id:
        return {"message": "This employee is already the primary responsible employee.", "primary_assignee_user_id": str(target.id)}
    if previous:
        old = _participant(db, row.id, previous)
        if old:
            old.is_primary = False
    participant = db.query(CustomerChatParticipant).filter(CustomerChatParticipant.conversation_id == row.id, CustomerChatParticipant.user_id == target.id).first()
    if participant:
        participant.status = "Active"; participant.is_primary = True; participant.removed_at = None; participant.removed_by_user_id = None
    else:
        db.add(CustomerChatParticipant(tenant_id=tenant_id, conversation_id=row.id, user_id=target.id, is_primary=True, added_by_user_id=actor_id))
    row.primary_assignee_user_id = target.id
    row.status = "Open"
    db.add(CustomerChatAssignmentHistory(tenant_id=tenant_id, conversation_id=row.id, previous_assignee_user_id=previous,
        new_assignee_user_id=target.id, changed_by_user_id=actor_id, reason=payload.reason))
    _notify_staff(db, tenant_id, target.id, "Customer conversation assigned to you", "You are now the primary contact for a customer conversation.", row.id)
    log_audit(db, tenant_id=tenant_id, user_id=actor_id, action="ASSIGN", module="customer_chat", record_id=row.id,
              description=f"Assigned customer conversation to {target.full_name}", before_data={"primary_assignee_user_id": str(previous) if previous else None}, after_data={"primary_assignee_user_id": str(target.id), "reason": payload.reason})
    db.commit()
    return {"message": "Primary responsible employee updated.", "primary_assignee_user_id": str(target.id)}


@staff_router.post("/conversations/{conversation_id}/participants", status_code=201, dependencies=[Depends(require_permission("customer_chat.manage"))])
def add_participant(conversation_id: UUID, payload: ParticipantCreate, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, actor_id = _staff_ids(current_user)
    row = _conversation(db, tenant_id, conversation_id)
    target = db.query(User).filter(User.id == payload.user_id, User.tenant_id == tenant_id, User.status == "Active").first()
    if not target:
        raise HTTPException(status_code=404, detail="The selected employee is not active in this tenant.")
    p = db.query(CustomerChatParticipant).filter(CustomerChatParticipant.conversation_id == row.id, CustomerChatParticipant.user_id == target.id).first()
    if p and p.status == "Active":
        raise HTTPException(status_code=409, detail="This employee is already a participant.")
    if p:
        p.status = "Active"; p.added_by_user_id = actor_id; p.added_at = _now(); p.removed_at = None; p.removed_by_user_id = None
    else:
        db.add(CustomerChatParticipant(tenant_id=tenant_id, conversation_id=row.id, user_id=target.id, added_by_user_id=actor_id))
    _notify_staff(db, tenant_id, target.id, "Added to a customer conversation", "You have been added to a customer conversation.", row.id)
    log_audit(db, tenant_id=tenant_id, user_id=actor_id, action="ADD_PARTICIPANT", module="customer_chat", record_id=row.id,
              description=f"Added {target.full_name} to a customer conversation", after_data={"participant_user_id": str(target.id)})
    db.commit()
    return {"message": "Participant added.", "user_id": str(target.id)}


@staff_router.delete("/conversations/{conversation_id}/participants/{user_id}")
def remove_participant(conversation_id: UUID, user_id: UUID, current_user: dict = Depends(require_active_user), _=Depends(require_permission("customer_chat.manage")), db: Session = Depends(get_db)):
    tenant_id, actor_id = _staff_ids(current_user)
    row = _conversation(db, tenant_id, conversation_id)
    if row.primary_assignee_user_id == user_id:
        raise HTTPException(status_code=409, detail="Reassign the primary responsible employee before removing them.")
    p = db.query(CustomerChatParticipant).filter(CustomerChatParticipant.conversation_id == row.id, CustomerChatParticipant.user_id == user_id, CustomerChatParticipant.status == "Active").first()
    if not p:
        raise HTTPException(status_code=404, detail="Active participant not found.")
    if p.is_inviter:
        raise HTTPException(status_code=409, detail="The original inviter is retained while active. Deactivate the employee or contact an administrator to change this policy.")
    p.status = "Removed"; p.removed_at = _now(); p.removed_by_user_id = actor_id
    log_audit(db, tenant_id=tenant_id, user_id=actor_id, action="REMOVE_PARTICIPANT", module="customer_chat", record_id=row.id,
              description="Removed a staff participant from a customer conversation", after_data={"participant_user_id": str(user_id)})
    db.commit()
    return {"message": "Participant removed."}


@staff_router.get("/conversations/{conversation_id}/assignment-history", dependencies=[Depends(require_permission("customer_chat.manage"))])
def assignment_history(conversation_id: UUID, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, _ = _staff_ids(current_user)
    row = _conversation(db, tenant_id, conversation_id)
    history = db.query(CustomerChatAssignmentHistory).filter(
        CustomerChatAssignmentHistory.conversation_id == row.id,
        CustomerChatAssignmentHistory.tenant_id == tenant_id,
    ).order_by(CustomerChatAssignmentHistory.created_at.desc()).all()
    return [{"id": str(h.id), "previous_assignee_user_id": str(h.previous_assignee_user_id) if h.previous_assignee_user_id else None,
             "new_assignee_user_id": str(h.new_assignee_user_id) if h.new_assignee_user_id else None,
             "changed_by_user_id": str(h.changed_by_user_id) if h.changed_by_user_id else None,
             "reason": h.reason, "created_at": h.created_at} for h in history]


@staff_router.get("/conversations/{conversation_id}/participants", dependencies=[Depends(require_permission("customer_chat.access"))])
def list_participants(conversation_id: UUID, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = _staff_ids(current_user)
    row = _conversation(db, tenant_id, conversation_id)
    if not _can_access(db, row, user_id, current_user):
        raise HTTPException(status_code=403, detail="You are not a participant in this customer conversation.")
    participants = db.query(CustomerChatParticipant, User).join(User, User.id == CustomerChatParticipant.user_id).filter(
        CustomerChatParticipant.conversation_id == row.id,
        CustomerChatParticipant.status == "Active",
        User.tenant_id == tenant_id,
    ).order_by(CustomerChatParticipant.is_primary.desc(), CustomerChatParticipant.is_inviter.desc(), User.full_name.asc()).all()
    return [{"user_id": str(u.id), "full_name": u.full_name, "email": u.email,
             "is_inviter": p.is_inviter, "is_primary": p.is_primary, "status": p.status}
            for p, u in participants]


@staff_router.post("/conversations/{conversation_id}/read", dependencies=[Depends(require_permission("customer_chat.access"))])
def mark_staff_chat_read(conversation_id: UUID, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = _staff_ids(current_user)
    row = _conversation(db, tenant_id, conversation_id)
    if not _can_access(db, row, user_id, current_user):
        raise HTTPException(status_code=403, detail="You are not a participant in this customer conversation.")
    participant = _participant(db, row.id, user_id)
    if participant:
        participant.last_read_at = _now()
        db.commit()
    return {"message": "Conversation marked as read."}


@staff_router.patch("/conversations/{conversation_id}/status", dependencies=[Depends(require_permission("customer_chat.manage"))])
def update_conversation_status(conversation_id: UUID, payload: ConversationStatusUpdate, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, actor_id = _staff_ids(current_user)
    row = _conversation(db, tenant_id, conversation_id)
    if payload.status == "Open" and not row.primary_assignee_user_id:
        raise HTTPException(status_code=409, detail="Assign a primary responsible employee before reopening this conversation.")
    before = row.status
    row.status = payload.status
    log_audit(db, tenant_id=tenant_id, user_id=actor_id, action="UPDATE_STATUS", module="customer_chat", record_id=row.id,
              description=f"Changed customer conversation status from {before} to {row.status}",
              before_data={"status": before}, after_data={"status": row.status})
    db.commit()
    return {"id": str(row.id), "status": row.status}


@portal_router.get("/conversation")
def get_customer_conversation(portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    row = db.query(CustomerChatConversation).filter(CustomerChatConversation.tenant_id == portal["tenant_id"], CustomerChatConversation.portal_user_id == portal["portal_user_id"]).first()
    if not row:
        raise HTTPException(status_code=404, detail="Your customer conversation has not been set up yet. Please contact the company.")
    row.customer_last_read_at = _now(); db.commit()
    return {**_conversation_json(db, row), "messages": [_message_json(m) for m in db.query(CustomerChatMessage).filter(CustomerChatMessage.conversation_id == row.id, CustomerChatMessage.deleted_at.is_(None)).order_by(CustomerChatMessage.created_at.asc()).limit(500).all()]}


@portal_router.post("/messages", status_code=201)
def send_customer_message(payload: MessageCreate, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    row = db.query(CustomerChatConversation).filter(CustomerChatConversation.tenant_id == portal["tenant_id"], CustomerChatConversation.portal_user_id == portal["portal_user_id"]).first()
    if not row:
        raise HTTPException(status_code=404, detail="Your customer conversation has not been set up yet. Please contact the company.")
    if row.status == "Closed":
        raise HTTPException(status_code=409, detail="This conversation is closed. Please contact the company to reopen it.")
    assignee = db.query(User).filter(User.id == row.primary_assignee_user_id, User.tenant_id == row.tenant_id, User.status == "Active").first() if row.primary_assignee_user_id else None
    if not assignee:
        row.status = "Needs Reassignment"
        manager_roles = db.query(Role).filter(Role.name.in_(["Tenant Owner", "Tenant Admin", "Manager"])).all()
        manager_role_ids = [role.id for role in manager_roles]
        if manager_role_ids:
            managers = db.query(User).join(UserRole, UserRole.user_id == User.id).filter(
                User.tenant_id == row.tenant_id, User.status == "Active", UserRole.role_id.in_(manager_role_ids)
            ).all()
            for manager in managers:
                _notify_staff(db, row.tenant_id, manager.id, "Customer conversation needs reassignment",
                              "A customer tried to message, but this conversation has no active primary responsible employee.", row.id)
        db.commit()
        raise HTTPException(status_code=409, detail="Your contact person is being reassigned. The company has been notified; please try again shortly.")
    message = CustomerChatMessage(tenant_id=row.tenant_id, conversation_id=row.id, sender_type="Customer", sender_portal_user_id=portal["portal_user_id"], content=payload.content.strip())
    db.add(message); row.last_message_at = _now(); row.status = "Open"
    _notify_staff(db, row.tenant_id, row.primary_assignee_user_id, "New customer message", "A customer has sent you a new message.", row.id)
    db.commit(); db.refresh(message)
    return _message_json(message)


@portal_router.post("/read")
def mark_customer_chat_read(portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    row = db.query(CustomerChatConversation).filter(CustomerChatConversation.tenant_id == portal["tenant_id"], CustomerChatConversation.portal_user_id == portal["portal_user_id"]).first()
    if not row:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    row.customer_last_read_at = _now(); db.commit()
    return {"message": "Conversation marked as read."}
