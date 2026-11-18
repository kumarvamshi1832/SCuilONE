from datetime import datetime, timezone
from uuid import UUID
from sqlalchemy.orm import Session

from app.models.customer_chat import CustomerChatAssignmentHistory, CustomerChatConversation, CustomerChatParticipant
from app.models.notification import Notification
from app.models.role import Role
from app.models.user import User
from app.models.user_role import UserRole


def _now():
    return datetime.now(timezone.utc)


def ensure_invitation_conversation(db: Session, *, tenant_id: UUID, portal_user, inviter_user_id: UUID) -> CustomerChatConversation:
    """Create the customer's independent chat on the first portal invitation; never overwrite its original inviter."""
    conversation = db.query(CustomerChatConversation).filter(
        CustomerChatConversation.tenant_id == tenant_id,
        CustomerChatConversation.portal_user_id == portal_user.id,
    ).first()
    if conversation:
        return conversation
    inviter = db.query(User).filter(User.id == inviter_user_id, User.tenant_id == tenant_id, User.status == "Active").first()
    conversation = CustomerChatConversation(
        tenant_id=tenant_id,
        portal_user_id=portal_user.id,
        account_id=portal_user.account_id,
        contact_id=portal_user.contact_id,
        original_inviter_user_id=inviter_user_id,
        primary_assignee_user_id=inviter_user_id if inviter else None,
        status="Open" if inviter else "Needs Reassignment",
    )
    db.add(conversation)
    db.flush()
    if inviter:
        db.add(CustomerChatParticipant(
            tenant_id=tenant_id, conversation_id=conversation.id, user_id=inviter_user_id,
            is_inviter=True, is_primary=True, status="Active", added_by_user_id=inviter_user_id,
        ))
        db.add(CustomerChatAssignmentHistory(
            tenant_id=tenant_id, conversation_id=conversation.id,
            previous_assignee_user_id=None, new_assignee_user_id=inviter_user_id,
            changed_by_user_id=inviter_user_id, reason="Initial assignment to the employee who invited the customer.",
        ))
    return conversation


def deactivate_user_from_customer_chats(db: Session, *, tenant_id: UUID, user_id: UUID, actor_id: UUID | None) -> int:
    """Revoke chat access immediately and flag conversations needing a manager reassignment."""
    now = _now()
    participants = db.query(CustomerChatParticipant).filter(
        CustomerChatParticipant.tenant_id == tenant_id,
        CustomerChatParticipant.user_id == user_id,
        CustomerChatParticipant.status == "Active",
    ).all()
    for participant in participants:
        participant.status = "Inactive"
        participant.is_primary = False
        participant.removed_at = now
        participant.removed_by_user_id = actor_id

    conversations = db.query(CustomerChatConversation).filter(
        CustomerChatConversation.tenant_id == tenant_id,
        CustomerChatConversation.primary_assignee_user_id == user_id,
    ).all()
    manager_role_ids = [r.id for r in db.query(Role).filter(Role.name.in_(["Tenant Owner", "Tenant Admin", "Manager"])).all()]
    managers = []
    if manager_role_ids:
        managers = db.query(User).join(UserRole, UserRole.user_id == User.id).filter(
            User.tenant_id == tenant_id, User.status == "Active", UserRole.role_id.in_(manager_role_ids), User.id != user_id,
        ).all()
    for conversation in conversations:
        conversation.primary_assignee_user_id = None
        conversation.status = "Needs Reassignment"
        db.add(CustomerChatAssignmentHistory(
            tenant_id=tenant_id, conversation_id=conversation.id,
            previous_assignee_user_id=user_id, new_assignee_user_id=None,
            changed_by_user_id=actor_id, reason="Primary employee deactivated; reassignment required.",
        ))
        for manager in managers:
            db.add(Notification(
                tenant_id=tenant_id, recipient_user_id=manager.id,
                title="Customer conversation needs reassignment",
                message="An employee was deactivated. A customer conversation needs a new primary responsible employee.",
                notification_type="customer_chat", related_module="customer_chat",
                related_record_id=conversation.id, is_read=False,
            ))
    return len(conversations)
