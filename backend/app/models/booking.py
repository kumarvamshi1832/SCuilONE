
import uuid
from datetime import datetime, date
from decimal import Decimal
from sqlalchemy import text
from sqlalchemy import (
    CheckConstraint,
    DateTime,
    Date,
    ForeignKey,
    ForeignKeyConstraint,
    UniqueConstraint,
    Index,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base


class Booking(Base):
    __tablename__ = "bookings"


    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_bookings_tenant_id_id"),
        Index("ix_bookings_tenant_property", "tenant_id", "property_id"),
        Index("ix_bookings_tenant_status", "tenant_id", "status"),
        Index(
            "uq_bookings_one_active_per_property",
            "tenant_id",
            "property_id",
            unique=True,
            postgresql_where=text("status IN ('Pending', 'Confirmed')"),
        ),
        CheckConstraint(
            "booking_amount >= 0",
            name="ck_bookings_amount_nonnegative",
        ),
        CheckConstraint(
            "refund_amount >= 0",
            name="ck_bookings_refund_nonnegative",
        ),
        CheckConstraint(
            "payment_preference IN ('Full Payment', 'Installments')",
            name="ck_bookings_payment_preference_valid",
        ),
    )


    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False
    )
    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id"), nullable=False
    )

    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leads.id"),
        nullable=True,
        index=True,
    )

    buyer_requirement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("buyer_requirements.id"),
        nullable=True,
        index=True,
    )
    accepted_offer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("property_offers.id"), nullable=True, unique=True
    )
    buyer_name: Mapped[str] = mapped_column(String(200), nullable=False)
    buyer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    buyer_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    buyer_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    buyer_details_submitted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    payment_preference: Mapped[str] = mapped_column(String(30), nullable=False, default="Full Payment")
    installment_request_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    booking_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False
    )

    agreed_price: Mapped[Decimal] = mapped_column(
        Numeric(14, 2),
        nullable=False,
    )
    refund_amount: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00")
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Pending"
    )
    booking_date: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    cancellation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
    nominees = relationship("BookingNominee", backref="booking", cascade="all, delete-orphan", order_by="BookingNominee.created_at")


class BookingNominee(Base):
    __tablename__ = "booking_nominees"
    __table_args__ = (
        Index("ix_booking_nominees_tenant_booking", "tenant_id", "booking_id"),
        ForeignKeyConstraint(["tenant_id", "booking_id"], ["bookings.tenant_id", "bookings.id"], ondelete="CASCADE", name="fk_booking_nominee_tenant_booking"),
        CheckConstraint(
            "allocation_percentage IS NULL OR (allocation_percentage > 0 AND allocation_percentage <= 100)",
            name="ck_booking_nominee_allocation_percentage",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    booking_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), nullable=False)
    nominee_name: Mapped[str] = mapped_column(String(200), nullable=False)
    relationship: Mapped[str] = mapped_column(String(80), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    date_of_birth: Mapped[date | None] = mapped_column(Date, nullable=True)
    address: Mapped[str | None] = mapped_column(Text, nullable=True)
    allocation_percentage: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    remarks: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
