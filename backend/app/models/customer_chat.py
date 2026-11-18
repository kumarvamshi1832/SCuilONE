import uuid
from datetime import datetime, timezone
from sqlalchemy import Boolean, CheckConstraint, DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database.connection import Base


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class CustomerChatConversation(Base):
    __tablename__ = "customer_chat_conversations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "portal_user_id", name="uq_customer_chat_tenant_portal_user"),
        CheckConstraint("status IN ('Open', 'Needs Reassignment', 'Closed')", name="ck_customer_chat_conversation_status"),
        Index("ix_customer_chat_tenant_assignee_last", "tenant_id", "primary_assignee_user_id", "last_message_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    portal_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customer_portal_users.id", ondelete="CASCADE"), nullable=False)
    account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False)
    contact_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False)
    original_inviter_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    primary_assignee_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Open", server_default="Open")
    customer_last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_message_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utc_now)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utc_now, onupdate=_utc_now)


class CustomerChatParticipant(Base):
    __tablename__ = "customer_chat_participants"
    __table_args__ = (
        UniqueConstraint("conversation_id", "user_id", name="uq_customer_chat_participant_user"),
        CheckConstraint("status IN ('Active', 'Removed', 'Inactive')", name="ck_customer_chat_participant_status"),
        Index("ix_customer_chat_participants_user_status", "tenant_id", "user_id", "status"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customer_chat_conversations.id", ondelete="CASCADE"), nullable=False)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    is_inviter: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    is_primary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Active", server_default="Active")
    added_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    removed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    last_read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    added_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utc_now)
    removed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CustomerChatMessage(Base):
    __tablename__ = "customer_chat_messages"
    __table_args__ = (
        CheckConstraint("sender_type IN ('Customer', 'Staff', 'System')", name="ck_customer_chat_message_sender_type"),
        CheckConstraint("length(trim(content)) > 0", name="ck_customer_chat_message_content_nonempty"),
        Index("ix_customer_chat_messages_conversation_created", "conversation_id", "created_at"),
        Index("ix_customer_chat_messages_tenant_created", "tenant_id", "created_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customer_chat_conversations.id", ondelete="CASCADE"), nullable=False)
    sender_type: Mapped[str] = mapped_column(String(20), nullable=False)
    sender_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    sender_portal_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("customer_portal_users.id", ondelete="SET NULL"), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utc_now)
    edited_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class CustomerChatAssignmentHistory(Base):
    __tablename__ = "customer_chat_assignment_history"
    __table_args__ = (Index("ix_customer_chat_assignment_history_conversation", "conversation_id", "created_at"),)
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    conversation_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customer_chat_conversations.id", ondelete="CASCADE"), nullable=False)
    previous_assignee_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    new_assignee_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    changed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=_utc_now)
