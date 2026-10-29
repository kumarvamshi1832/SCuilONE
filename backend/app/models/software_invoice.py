import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric, String, Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base


class SoftwareInvoice(Base):
    __tablename__ = "software_invoices"
    __table_args__ = (
        UniqueConstraint("tenant_id", "invoice_number", name="uq_software_invoices_tenant_number"),
        Index("ix_software_invoices_tenant_status", "tenant_id", "status"),
        Index("ix_software_invoices_tenant_project", "tenant_id", "project_id"),
        CheckConstraint("subtotal >= 0 AND tax_total >= 0 AND total_amount >= 0", name="ck_software_invoices_amounts_nonnegative"),
        CheckConstraint("status IN ('Draft', 'Sent', 'Partially Paid', 'Paid', 'Void')", name="ck_software_invoices_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)
    project_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("software_projects.id"), nullable=False)
    software_contract_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("software_contracts.id"), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    invoice_number: Mapped[str] = mapped_column(String(50), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False, default="INR")
    issue_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    due_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Draft")
    subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    tax_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=0)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)

    items: Mapped[list["SoftwareInvoiceItem"]] = relationship("SoftwareInvoiceItem", back_populates="invoice", cascade="all, delete-orphan", order_by="SoftwareInvoiceItem.created_at")
    payments: Mapped[list["SoftwareInvoicePayment"]] = relationship("SoftwareInvoicePayment", back_populates="invoice", cascade="all, delete-orphan", order_by="SoftwareInvoicePayment.payment_date")


class SoftwareInvoiceItem(Base):
    __tablename__ = "software_invoice_items"
    __table_args__ = (
        UniqueConstraint("time_entry_id", name="uq_software_invoice_items_time_entry"),
        CheckConstraint("quantity > 0 AND unit_price >= 0 AND tax_percent >= 0 AND tax_percent <= 100", name="ck_software_invoice_items_values"),
        Index("ix_software_invoice_items_tenant_invoice", "tenant_id", "invoice_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)
    invoice_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("software_invoices.id", ondelete="CASCADE"), nullable=False)
    time_entry_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("software_time_entries.id", ondelete="RESTRICT"), nullable=True)
    description: Mapped[str] = mapped_column(String(300), nullable=False)
    quantity: Mapped[Decimal] = mapped_column(Numeric(12, 4), nullable=False)
    unit_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    tax_percent: Mapped[Decimal] = mapped_column(Numeric(5, 2), nullable=False, default=0)
    line_subtotal: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    line_tax: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    line_total: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    invoice: Mapped["SoftwareInvoice"] = relationship("SoftwareInvoice", back_populates="items")


class SoftwareInvoicePayment(Base):
    __tablename__ = "software_invoice_payments"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_software_invoice_payments_amount_positive"),
        Index("ix_software_invoice_payments_tenant_invoice", "tenant_id", "invoice_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True)
    invoice_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("software_invoices.id", ondelete="CASCADE"), nullable=False)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payment_method: Mapped[str] = mapped_column(String(30), nullable=False)
    transaction_reference: Mapped[str | None] = mapped_column(String(150), nullable=True)
    payment_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)

    invoice: Mapped["SoftwareInvoice"] = relationship("SoftwareInvoice", back_populates="payments")
