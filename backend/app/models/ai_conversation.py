import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


class AIConversation(Base):
    __tablename__ = "ai_conversations"

    __table_args__ = (
        CheckConstraint(
            "industry_type IN ('real_estate', 'software')",
            name="ck_ai_conversations_industry_type",
        ),
        CheckConstraint(
            "status IN ('Active', 'Ready_For_Confirmation', 'Confirmed', 'Revision_In_Progress', 'Closed')",
            name="ck_ai_conversations_status",
        ),
        CheckConstraint(
            "revision_number >= 1",
            name="ck_ai_conversations_revision_positive",
        ),
        Index(
            "ix_ai_conversations_tenant_portal_user",
            "tenant_id",
            "portal_user_id",
            "created_at",
        ),
        Index(
            "ix_ai_conversations_tenant_status",
            "tenant_id",
            "status",
        ),
        Index(
            "uq_ai_conversations_tenant_buyer_req",
            "tenant_id",
            "buyer_requirement_id",
            unique=True,
            postgresql_where=text("buyer_requirement_id IS NOT NULL"),
        ),
        Index(
            "uq_ai_conversations_tenant_software_req",
            "tenant_id",
            "software_requirement_id",
            unique=True,
            postgresql_where=text("software_requirement_id IS NOT NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    portal_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("customer_portal_users.id", ondelete="CASCADE"),
        nullable=False,
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("accounts.id", ondelete="CASCADE"),
        nullable=False,
    )
    contact_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("contacts.id", ondelete="CASCADE"),
        nullable=False,
    )
    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leads.id", ondelete="SET NULL"),
        nullable=True,
    )
    industry_type: Mapped[str] = mapped_column(
        String(30), nullable=False
    )
    model_tag: Mapped[str] = mapped_column(
        String(80), nullable=False, default="llama3.2:1b", server_default="llama3.2:1b"
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Active", server_default="Active"
    )
    extracted_data_json: Mapped[dict] = mapped_column(
        JSONB, nullable=False, default=dict, server_default="{}"
    )
    missing_fields_json: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    unclear_fields_json: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    summary_text: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )
    revision_number: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )
    confirmed_revision_number: Mapped[int | None] = mapped_column(
        Integer, nullable=True
    )
    revision_history_json: Mapped[list] = mapped_column(
        JSONB, nullable=False, default=list, server_default="[]"
    )
    buyer_requirement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("buyer_requirements.id", ondelete="SET NULL"),
        nullable=True,
    )
    software_requirement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("software_requirements.id", ondelete="SET NULL"),
        nullable=True,
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now, onupdate=_utc_now
    )

    messages: Mapped[list["AIMessage"]] = relationship(
        "AIMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
        passive_deletes=True,
        order_by="AIMessage.created_at.asc()",
    )


class AIMessage(Base):
    __tablename__ = "ai_messages"

    __table_args__ = (
        CheckConstraint(
            "sender_role IN ('user', 'assistant', 'system')",
            name="ck_ai_messages_sender_role",
        ),
        Index(
            "ix_ai_messages_conversation_created",
            "conversation_id",
            "created_at",
        ),
        Index(
            "ix_ai_messages_tenant_conversation",
            "tenant_id",
            "conversation_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id", ondelete="CASCADE"),
        nullable=False,
    )
    conversation_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("ai_conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    sender_role: Mapped[str] = mapped_column(
        String(20), nullable=False
    )
    content: Mapped[str] = mapped_column(
        Text, nullable=False
    )
    extracted_delta_json: Mapped[dict | None] = mapped_column(
        JSONB, nullable=True
    )
    model_tag: Mapped[str | None] = mapped_column(
        String(80), nullable=True
    )
    latency_ms: Mapped[float | None] = mapped_column(
        Numeric(10, 2), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=_utc_now
    )

    conversation: Mapped["AIConversation"] = relationship(
        "AIConversation", back_populates="messages"
    )
