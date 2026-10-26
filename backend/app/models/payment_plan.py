import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, DateTime, ForeignKey, Index, Numeric, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class PaymentPlan(Base):
    __tablename__ = "payment_plans"
    __table_args__ = (
        UniqueConstraint("tenant_id", "booking_id", name="uq_payment_plans_tenant_booking"),
        Index("ix_payment_plans_tenant_status", "tenant_id", "status"),
        CheckConstraint("total_amount > 0", name="ck_payment_plans_total_positive"),
        CheckConstraint("status IN ('Active', 'Cancelled')", name="ck_payment_plans_status_valid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    booking_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("bookings.id"), nullable=False)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Active")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class PaymentPlanInstallment(Base):
    __tablename__ = "payment_plan_installments"
    __table_args__ = (
        UniqueConstraint("tenant_id", "payment_plan_id", "sequence", name="uq_payment_plan_installment_sequence"),
        Index("ix_payment_plan_installments_tenant_due_date", "tenant_id", "due_date"),
        CheckConstraint("amount > 0", name="ck_payment_plan_installment_amount_positive"),
        CheckConstraint("sequence > 0", name="ck_payment_plan_installment_sequence_positive"),
        CheckConstraint("status IN ('Pending', 'Partially Paid', 'Paid', 'Overdue')", name="ck_payment_plan_installment_status_valid"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False)
    payment_plan_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("payment_plans.id", ondelete="CASCADE"), nullable=False)
    sequence: Mapped[int] = mapped_column(nullable=False)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Pending")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
