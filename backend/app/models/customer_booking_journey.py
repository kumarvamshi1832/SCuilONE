import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import CheckConstraint, DateTime, ForeignKey, Index, Integer, Numeric, String, Text, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database.connection import Base


class CustomerSiteVisitFeedback(Base):
    __tablename__ = "customer_site_visit_feedback"
    __table_args__ = (
        UniqueConstraint("tenant_id", "site_visit_id", name="uq_customer_visit_feedback_visit"),
        CheckConstraint("rating IS NULL OR rating BETWEEN 1 AND 5", name="ck_customer_visit_feedback_rating"),
        CheckConstraint("decision IN ('Interested', 'Maybe', 'Not Interested')", name="ck_customer_visit_feedback_decision"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    portal_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customer_portal_users.id", ondelete="CASCADE"), nullable=False)
    site_visit_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("site_visits.id", ondelete="CASCADE"), nullable=False)
    rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    decision: Mapped[str] = mapped_column(String(30), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class CustomerBookingRequest(Base):
    __tablename__ = "customer_booking_requests"
    __table_args__ = (
        CheckConstraint("status IN ('Requested', 'Approved', 'Confirmed', 'Completed', 'Rejected', 'Expired', 'Expired - Payment Review', 'Cancelled')", name="ck_customer_booking_request_status"),
        CheckConstraint("agreement_status IN ('Not Prepared', 'Prepared', 'Customer Acknowledged', 'Verified', 'Rejected')", name="ck_customer_booking_request_agreement_status"),
        CheckConstraint("payment_preference IN ('Full Payment', 'Installments')", name="ck_customer_booking_request_payment_preference"),
        CheckConstraint("extension_count BETWEEN 0 AND 2", name="ck_customer_booking_request_extensions"),
        CheckConstraint("final_confirmed_by IS NULL OR final_confirmed_by IN ('Customer', 'Staff')", name="ck_customer_booking_request_confirmed_by"),
        CheckConstraint("booking_amount IS NULL OR booking_amount >= 0", name="ck_customer_booking_request_booking_amount"),
        CheckConstraint("agreed_price IS NULL OR agreed_price > 0", name="ck_customer_booking_request_agreed_price"),
        CheckConstraint("booking_amount IS NULL OR agreed_price IS NULL OR booking_amount <= agreed_price", name="ck_customer_booking_request_amount_not_over_price"),
        Index("ix_customer_booking_requests_tenant_status", "tenant_id", "status"),
        Index("ix_customer_booking_requests_property_hold", "tenant_id", "property_id", "status", "hold_expires_at"),
        Index(
            "uq_customer_booking_requests_active_property",
            "tenant_id",
            "property_id",
            unique=True,
            postgresql_where=text("status IN ('Requested', 'Approved')"),
        ),
        UniqueConstraint("tenant_id", "portal_user_id", "site_visit_id", name="uq_customer_booking_request_visit"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    portal_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customer_portal_users.id", ondelete="CASCADE"), nullable=False)
    buyer_requirement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("buyer_requirements.id"), nullable=False)
    property_match_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("property_matches.id"), nullable=False)
    property_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("properties.id"), nullable=False)
    site_visit_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("site_visits.id"), nullable=False)
    booking_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("bookings.id"), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Requested")
    hold_created_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    extension_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    agreed_price: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    booking_amount: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    payment_preference: Mapped[str] = mapped_column(String(30), nullable=False, default="Full Payment")
    customer_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    customer_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)
    staff_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    agreement_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    agreement_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    agreement_status: Mapped[str] = mapped_column(String(30), nullable=False, default="Not Prepared")
    agreement_customer_name: Mapped[str | None] = mapped_column(String(200), nullable=True)
    agreement_acknowledged_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    agreement_verified_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    agreement_verified_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    final_confirmed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    # "Customer" (confirmed in the portal) or "Staff"; NULL for requests confirmed before this was recorded.
    final_confirmed_by: Mapped[str | None] = mapped_column(String(20), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)


class CustomerPortalJourneyFile(Base):
    __tablename__ = "customer_portal_journey_files"
    __table_args__ = (
        Index("ix_customer_journey_files_request", "tenant_id", "booking_request_id", "purpose"),
        CheckConstraint("purpose IN ('Signed Agreement', 'Payment Proof')", name="ck_customer_journey_file_purpose"),
        CheckConstraint("file_size > 0 AND file_size <= 5242880", name="ck_customer_journey_file_size"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    portal_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customer_portal_users.id", ondelete="CASCADE"), nullable=False)
    booking_request_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customer_booking_requests.id", ondelete="CASCADE"), nullable=False)
    payment_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("payments.id", ondelete="SET NULL"), nullable=True)
    purpose: Mapped[str] = mapped_column(String(30), nullable=False)
    agreement_version: Mapped[int | None] = mapped_column(Integer, nullable=True)
    filename: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(150), nullable=False)
    file_size: Mapped[int] = mapped_column(nullable=False)
    storage_public_id: Mapped[str] = mapped_column(String(500), nullable=False, unique=True)
    file_url: Mapped[str] = mapped_column(Text, nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
