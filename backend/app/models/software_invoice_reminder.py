import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class SoftwareInvoiceReminder(Base):
    """One row per reminder email actually sent to a customer (prevents repeats)."""

    __tablename__ = "software_invoice_reminders"
    __table_args__ = (
        UniqueConstraint("invoice_id", "kind", name="uq_software_invoice_reminders_invoice_kind"),
        Index("ix_software_invoice_reminders_tenant_invoice", "tenant_id", "invoice_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    invoice_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("software_invoices.id"), nullable=False)
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    recipient_email: Mapped[str] = mapped_column(String(254), nullable=False)
    sent_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
