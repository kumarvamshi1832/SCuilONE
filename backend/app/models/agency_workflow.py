
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class AgencyLead(Base):
    """Customer lead owned strictly by a global Agency (works for both Free and Paid agencies)."""

    __tablename__ = "agency_leads"
    __table_args__ = (
        CheckConstraint(
            "status IN ('New', 'Qualified', 'Shortlisting', 'Visiting', 'Negotiating', 'Booked', 'Closed', 'Lost')",
            name="ck_agency_leads_status",
        ),
        Index("ix_agency_leads_agency_status", "agency_id", "status"),
        Index("ix_agency_leads_agency_email", "agency_id", "email"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False
    )
    assigned_actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    source: Mapped[str] = mapped_column(String(50), nullable=False, default="Direct", server_default="Direct")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="New", server_default="New")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    customer_consent_given_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now, onupdate=_utc_now)


class AgencyRequirement(Base):
    """Structured Sale, Rent, or Lease customer requirement owned by a global Agency."""

    __tablename__ = "agency_requirements"
    __table_args__ = (
        CheckConstraint("transaction_type IN ('Sale', 'Rent', 'Lease')", name="ck_agency_req_tx_type"),
        CheckConstraint("status IN ('Active', 'Fulfilled', 'Closed', 'Cancelled')", name="ck_agency_req_status"),
        Index("ix_agency_req_agency_tx_status", "agency_id", "transaction_type", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False
    )
    agency_lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agency_leads.id", ondelete="CASCADE"), nullable=False, index=True
    )
    transaction_type: Mapped[str] = mapped_column(String(20), nullable=False, default="Sale", server_default="Sale")
    property_type: Mapped[str | None] = mapped_column(String(50), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    preferred_locality: Mapped[str | None] = mapped_column(String(150), nullable=True)
    bedrooms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    min_budget: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    max_budget: Mapped[Decimal | None] = mapped_column(Numeric(14, 2), nullable=True)
    min_area: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    max_area: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), nullable=True)
    preferred_amenities: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    lease_duration_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    lock_in_months: Mapped[int | None] = mapped_column(Integer, nullable=True)
    revision_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    revision_history: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Active", server_default="Active")
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now, onupdate=_utc_now)


class AgencyShortlist(Base):
    """Multi-property shortlist across authorized company properties with customer selection tracking."""

    __tablename__ = "agency_shortlists"
    __table_args__ = (
        UniqueConstraint("agency_requirement_id", "property_id", name="uq_agency_shortlist_req_prop"),
        CheckConstraint(
            "status IN ('Shortlisted', 'Customer Selected', 'Visit Requested', 'Removed')",
            name="ck_agency_shortlist_status",
        ),
        Index("ix_agency_shortlist_agency_lead", "agency_id", "agency_lead_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False
    )
    agency_lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agency_leads.id", ondelete="CASCADE"), nullable=False
    )
    agency_requirement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agency_requirements.id", ondelete="CASCADE"), nullable=False
    )
    connection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company_agency_connections.id", ondelete="CASCADE"), nullable=False
    )
    company_tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Shortlisted", server_default="Shortlisted")
    customer_selected_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now, onupdate=_utc_now)


class AgencySaleBookingRequest(Base):
    """Agency-submitted Sale booking request targeting a company's central property.

    Owned by company_tenant_id while preserving full source_agency_id & agency_connection_id attribution.
    """

    __tablename__ = "agency_sale_booking_requests"
    __table_args__ = (
        CheckConstraint(
            "status IN ('Requested', 'Approved', 'Confirmed', 'Rejected', 'Expired', 'Cancelled')",
            name="ck_agency_sale_req_status",
        ),
        CheckConstraint(
            "payment_preference IN ('Full Payment', 'Installments')",
            name="ck_agency_sale_req_pay_pref",
        ),
        Index("ix_agency_sale_req_company_status", "company_tenant_id", "status"),
        Index("ix_agency_sale_req_agency_status", "source_agency_id", "status"),
        Index("ix_agency_sale_req_property", "property_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False
    )
    source_agency_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False
    )
    agency_connection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company_agency_connections.id", ondelete="CASCADE"), nullable=False
    )
    agreement_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agency_agreement_versions.id", ondelete="SET NULL"), nullable=True
    )
    agency_lead_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agency_leads.id", ondelete="CASCADE"), nullable=False
    )
    agency_requirement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agency_requirements.id", ondelete="SET NULL"), nullable=True
    )
    accepted_offer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("property_offers.id", ondelete="SET NULL"), nullable=True
    )
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True
    )
    agency_assigned_actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)

    # Consented customer snapshot (company never accesses private agency CRM leads)
    customer_name: Mapped[str] = mapped_column(String(150), nullable=False)
    customer_email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    customer_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    customer_consent_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)

    proposed_price: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    booking_amount: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payment_preference: Mapped[str] = mapped_column(String(30), nullable=False, default="Full Payment", server_default="Full Payment")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Requested", server_default="Requested")
    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    agreement_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    agreement_version: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    agreement_status: Mapped[str] = mapped_column(String(30), nullable=False, default="Not Prepared", server_default="Not Prepared")
    customer_signed_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    customer_signed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    payment_instructions: Mapped[str | None] = mapped_column(Text, nullable=True)

    agency_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    company_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    company_reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    company_reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now, onupdate=_utc_now)
