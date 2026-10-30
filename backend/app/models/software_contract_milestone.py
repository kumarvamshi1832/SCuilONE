import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint, DateTime, ForeignKey, Index, Numeric, String, Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class SoftwareContractMilestone(Base):
    __tablename__ = "software_contract_milestones"
    __table_args__ = (
        UniqueConstraint("tenant_id", "contract_id", "sequence", name="uq_software_contract_milestones_sequence"),
        UniqueConstraint("invoice_id", name="uq_software_contract_milestones_invoice"),
        CheckConstraint("percentage > 0 AND percentage <= 100", name="ck_software_contract_milestones_percentage"),
        CheckConstraint("amount > 0", name="ck_software_contract_milestones_amount"),
        CheckConstraint("status IN ('Pending', 'Ready', 'Invoiced', 'Paid')", name="ck_software_contract_milestones_status"),
        Index("ix_software_contract_milestones_tenant_contract", "tenant_id", "contract_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    contract_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("software_contracts.id", ondelete="CASCADE"), nullable=False)
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("software_invoices.id", ondelete="SET NULL"), nullable=True)
    sequence: Mapped[int] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    percentage: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    trigger_description: Mapped[str | None] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
