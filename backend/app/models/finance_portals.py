""":
- AgencyCommissionEntry: immutable contractual commission ledger (survives connection termination)
- PropertyOwner & OwnerAgencyMandate: individual property owner authorization separate from B2B company-agency connections
- OwnerPortalUser & OwnerPortalSession: separate external Owner Portal (portal_type='owner')
- OwnerPayoutLedger: verified rental collection reconciliation & owner payouts (Option A authorized collection & Option B direct-to-owner)
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
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


class AgencyCommissionEntry(Base):
    """Immutable commission obligation & payout ledger tied to an exact AgencyAgreementVersion."""

    __tablename__ = "agency_commission_entries"
    __table_args__ = (
        CheckConstraint("transaction_type IN ('Sale', 'Rent', 'Lease')", name="ck_comm_entry_tx_type"),
        CheckConstraint(
            "commission_structure IN ('percentage', 'fixed', 'one_month_rent', 'custom')",
            name="ck_comm_entry_structure",
        ),
        CheckConstraint(
            "status IN ('Pending', 'Eligible', 'Approved', 'Paid', 'Reversed', 'Adjusted')",
            name="ck_comm_entry_status",
        ),
        Index("ix_comm_entry_company_status", "company_tenant_id", "status"),
        Index("ix_comm_entry_agency_status", "agency_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    agency_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agencies.id", ondelete="RESTRICT"), nullable=False
    )
    connection_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company_agency_connections.id", ondelete="SET NULL"), nullable=True
    )
    agreement_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agency_agreement_versions.id", ondelete="SET NULL"), nullable=True
    )
    transaction_type: Mapped[str] = mapped_column(String(20), nullable=False)
    booking_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True
    )
    rental_agreement_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rental_agreements.id", ondelete="SET NULL"), nullable=True
    )
    transaction_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    commission_structure: Mapped[str] = mapped_column(String(30), nullable=False)
    commission_rate_or_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    gross_commission: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    tax_deduction: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    other_deductions: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    net_payable: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    payer: Mapped[str] = mapped_column(String(20), nullable=False, default="company", server_default="company")
    trigger_event: Mapped[str] = mapped_column(String(80), nullable=False, default="booking_confirmed", server_default="booking_confirmed")
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Pending", server_default="Pending")
    approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    paid_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    payout_reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now, onupdate=_utc_now)


class PropertyOwner(Base):
    """Individual property owner managed by a Real Estate Company or Paid Real Estate Agency."""

    __tablename__ = "property_owners"
    __table_args__ = (
        UniqueConstraint("tenant_id", "email", name="uq_property_owners_tenant_email"),
        Index("ix_property_owners_tenant_status", "tenant_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    pan_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    payout_details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Active", server_default="Active")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now, onupdate=_utc_now)


class OwnerAgencyMandate(Base):
    """Explicit authorization for a Company or Paid Agency to manage an individual owner's property."""

    __tablename__ = "owner_agency_mandates"
    __table_args__ = (
        CheckConstraint("management_fee_type IN ('percentage', 'fixed')", name="ck_owner_mandate_fee_type"),
        CheckConstraint(
            "collection_authority IN ('authorized_collection', 'direct_to_owner')",
            name="ck_owner_mandate_collection_auth",
        ),
        CheckConstraint(
            "status IN ('Draft', 'Pending Owner Approval', 'Active', 'Suspended', 'Terminated')",
            name="ck_owner_mandate_status",
        ),
        Index("ix_owner_mandate_tenant_prop", "tenant_id", "property_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("property_owners.id", ondelete="CASCADE"), nullable=False
    )
    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False
    )
    management_fee_type: Mapped[str] = mapped_column(String(20), nullable=False, default="percentage", server_default="percentage")
    management_fee_value: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("8.00"), server_default="8.00")
    collection_authority: Mapped[str] = mapped_column(
        String(30), nullable=False, default="authorized_collection", server_default="authorized_collection"
    )
    starts_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    expires_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    termination_notice_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30, server_default="30")
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Pending Owner Approval", server_default="Pending Owner Approval"
    )
    owner_approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    agreement_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now, onupdate=_utc_now)


class OwnerPortalUser(Base):
    """External Owner Portal identity (strictly isolated from staff Users and CustomerPortalUser)."""

    __tablename__ = "owner_portal_users"
    __table_args__ = (
        UniqueConstraint("tenant_id", "owner_id", name="uq_owner_portal_tenant_owner"),
        Index("ix_owner_portal_email", "email"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("property_owners.id", ondelete="CASCADE"), nullable=False
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Active", server_default="Active")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)


class OwnerPortalSession(Base):
    __tablename__ = "owner_portal_sessions"
    __table_args__ = (Index("ix_owner_portal_sessions_user", "owner_portal_user_id", "revoked"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    owner_portal_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("owner_portal_users.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)


class OwnerPayoutLedger(Base):
    """Verified rental collection & owner payout reconciliation (Option A authorized collection & Option B direct-to-owner).

    Security deposits are liabilities and are never recorded as owner payout revenue.
    """

    __tablename__ = "owner_payout_ledgers"
    __table_args__ = (
        CheckConstraint(
            "collection_mode IN ('authorized_collection', 'direct_to_owner')",
            name="ck_owner_payout_collection_mode",
        ),
        CheckConstraint(
            "status IN ('Pending', 'Approved', 'Paid', 'Reconciled', 'Cancelled')",
            name="ck_owner_payout_status",
        ),
        Index("ix_owner_payout_tenant_owner", "tenant_id", "owner_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    owner_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("property_owners.id", ondelete="CASCADE"), nullable=False
    )
    mandate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("owner_agency_mandates.id", ondelete="CASCADE"), nullable=False
    )
    rental_agreement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rental_agreements.id", ondelete="CASCADE"), nullable=False
    )
    rental_payment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("rental_payments.id", ondelete="SET NULL"), nullable=True
    )
    collection_mode: Mapped[str] = mapped_column(String(30), nullable=False)
    rent_collected: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    management_fee: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    commission_deduction: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    approved_expenses: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    net_owner_payout: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False)
    management_fee_receivable: Mapped[Decimal] = mapped_column(Numeric(14, 2), nullable=False, default=Decimal("0.00"), server_default="0.00")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Pending", server_default="Pending")
    bank_transfer_reference: Mapped[str | None] = mapped_column(String(120), nullable=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now, onupdate=_utc_now)
