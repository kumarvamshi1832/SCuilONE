import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class EmailLog(Base):
    """One email (sent from the CRM, logged manually, or received via webhook)."""

    __tablename__ = "email_logs"
    __table_args__ = (
        UniqueConstraint("tenant_id", "message_id", name="uq_email_logs_tenant_message"),
        Index("ix_email_logs_tenant_contact", "tenant_id", "contact_id"),
        Index("ix_email_logs_tenant_lead", "tenant_id", "lead_id"),
        Index("ix_email_logs_tenant_deal", "tenant_id", "deal_id"),
        Index("ix_email_logs_tenant_thread", "tenant_id", "thread_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # Inbound | Outbound
    status: Mapped[str] = mapped_column(String(15), nullable=False)  # Received | Sent | Failed | Logged
    source: Mapped[str] = mapped_column(String(15), nullable=False)  # smtp | manual | webhook
    subject: Mapped[str] = mapped_column(String(500), nullable=False, default="")
    body_text: Mapped[str] = mapped_column(Text, nullable=False, default="")
    from_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    to_emails: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    cc_emails: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    message_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    in_reply_to: Mapped[str | None] = mapped_column(String(255), nullable=True)
    thread_id: Mapped[str] = mapped_column(String(64), nullable=False)
    error_message: Mapped[str | None] = mapped_column(String(500), nullable=True)

    lead_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("leads.id"), nullable=True)
    contact_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("contacts.id"), nullable=True)
    account_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=True)
    deal_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("deals.id"), nullable=True)
    sent_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)

    occurred_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
