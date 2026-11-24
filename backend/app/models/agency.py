"""Models for Real Estate Business Profiles, Global Agency Identity, Invitations,
Company-Agency Connections, Versioned Agreements, Shared Property Access, and Agency Notifications.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


class RealEstateBusinessProfile(Base):
    """Distinct business profile for a registered Real Estate Company or Paid Real Estate Agency."""

    __tablename__ = "real_estate_business_profiles"
    __table_args__ = (
        CheckConstraint(
            "business_type IN ('real_estate_company', 'real_estate_agency')",
            name="ck_re_profile_business_type",
        ),
        CheckConstraint(
            "verification_status IN ('Unverified', 'Pending', 'Verified', 'Rejected')",
            name="ck_re_profile_verification_status",
        ),
        Index("ix_re_profile_business_type_city", "business_type", "city"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    business_type: Mapped[str] = mapped_column(String(40), nullable=False)
    legal_name: Mapped[str] = mapped_column(String(200), nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    rera_registration_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    gst_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    pan_number: Mapped[str | None] = mapped_column(String(20), nullable=True)
    website: Mapped[str | None] = mapped_column(String(255), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str] = mapped_column(String(100), nullable=False, default="India", server_default="India")
    office_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    operating_cities: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    specializations: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    verification_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Unverified", server_default="Unverified"
    )
    conversion_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    last_converted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_converted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now, onupdate=_utc_now)


class Agency(Base):
    """Global Real Estate Agency identity shared across all company connections.

    - Free External Agency: operating_mode='free_external', tenant_id=NULL.
    - Paid Registered Agency: operating_mode='paid_tenant', tenant_id=<agency's Tenant.id>.
    """

    __tablename__ = "agencies"
    __table_args__ = (
        CheckConstraint(
            "operating_mode IN ('free_external', 'paid_tenant')",
            name="ck_agencies_operating_mode",
        ),
        CheckConstraint(
            "status IN ('Active', 'Suspended', 'Inactive')",
            name="ck_agencies_status",
        ),
        CheckConstraint(
            "(operating_mode = 'free_external' AND tenant_id IS NULL) "
            "OR (operating_mode = 'paid_tenant' AND tenant_id IS NOT NULL)",
            name="ck_agencies_mode_tenant_consistency",
        ),
        Index("ix_agencies_verified_phone", "verified_phone"),
        Index("ix_agencies_mode_status", "operating_mode", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agency_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    legal_name: Mapped[str] = mapped_column(String(200), nullable=False)
    display_name: Mapped[str] = mapped_column(String(200), nullable=False)
    primary_contact_name: Mapped[str] = mapped_column(String(150), nullable=False)
    verified_email: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    verified_phone: Mapped[str] = mapped_column(String(30), nullable=False)
    rera_registration_number: Mapped[str | None] = mapped_column(String(100), nullable=True)
    gst_number: Mapped[str | None] = mapped_column(String(40), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    state: Mapped[str | None] = mapped_column(String(100), nullable=True)
    country: Mapped[str] = mapped_column(String(100), nullable=False, default="India", server_default="India")
    office_address: Mapped[str | None] = mapped_column(Text, nullable=True)
    operating_mode: Mapped[str] = mapped_column(
        String(30), nullable=False, default="free_external", server_default="free_external"
    )
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="SET NULL"), unique=True, nullable=True
    )
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Active", server_default="Active")
    max_free_team_members: Mapped[int] = mapped_column(Integer, nullable=False, default=3, server_default="3")
    upgraded_to_paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now, onupdate=_utc_now)


class AgencyMember(Base):
    """Member belonging to a global Agency.

    For Free External agencies, authenticates directly via password_hash + AgencySession.
    For Paid Agencies, links 1:1 to the agency tenant's staff User via user_id.
    """

    __tablename__ = "agency_members"
    __table_args__ = (
        UniqueConstraint("agency_id", "email", name="uq_agency_members_agency_email"),
        CheckConstraint("role IN ('agency_owner', 'agency_agent')", name="ck_agency_members_role"),
        CheckConstraint("status IN ('Active', 'Invited', 'Inactive')", name="ck_agency_members_status"),
        Index("ix_agency_members_email", "email"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), unique=True, nullable=True
    )
    full_name: Mapped[str] = mapped_column(String(150), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    role: Mapped[str] = mapped_column(String(30), nullable=False, default="agency_owner", server_default="agency_owner")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="Active", server_default="Active")
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now, onupdate=_utc_now)


class AgencySession(Base):
    """Refresh/session table for Free External agency members (portal_type='agency_external')."""

    __tablename__ = "agency_sessions"
    __table_args__ = (Index("ix_agency_sessions_member_revoked", "agency_member_id", "revoked"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False
    )
    agency_member_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agency_members.id", ondelete="CASCADE"), nullable=False
    )
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    revoked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)


class AgencyInvitation(Base):
    """Expiring, token-hashed invitation sent by a Real Estate Company to a new or existing Agency."""

    __tablename__ = "agency_invitations"
    __table_args__ = (
        CheckConstraint(
            "status IN ('Draft', 'Sent', 'Opened', 'Accepted', 'Rejected', 'Expired', 'Cancelled')",
            name="ck_agency_invitations_status",
        ),
        CheckConstraint(
            "proposed_sharing_scope IN ('all_eligible', 'selected_properties')",
            name="ck_agency_invitations_scope",
        ),
        CheckConstraint(
            "onboarding_choice IN ('pending', 'free_external', 'paid_tenant')",
            name="ck_agency_invitations_onboarding_choice",
        ),
        Index("ix_agency_invitations_company_status", "company_tenant_id", "status"),
        Index("ix_agency_invitations_email", "invited_email"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    invited_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    existing_agency_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agencies.id", ondelete="SET NULL"), nullable=True
    )
    invited_agency_name: Mapped[str] = mapped_column(String(200), nullable=False)
    invited_contact_name: Mapped[str] = mapped_column(String(150), nullable=False)
    invited_email: Mapped[str] = mapped_column(String(255), nullable=False)
    invited_phone: Mapped[str] = mapped_column(String(30), nullable=False)
    business_details: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    opened_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    onboarding_choice: Mapped[str] = mapped_column(
        String(30), nullable=False, default="pending", server_default="pending"
    )
    can_sale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    can_rent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    can_lease: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    proposed_sharing_scope: Mapped[str] = mapped_column(
        String(30), nullable=False, default="selected_properties", server_default="selected_properties"
    )
    proposed_property_ids: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    proposed_commission_terms: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    proposed_responsibilities: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    proposed_agreement_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    proposed_start_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    proposed_expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    termination_notice_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30, server_default="30")

    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Sent", server_default="Sent")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now, onupdate=_utc_now)


class CompanyAgencyConnection(Base):
    """Independent business relationship between one Real Estate Company tenant and one global Agency."""

    __tablename__ = "company_agency_connections"
    __table_args__ = (
        CheckConstraint(
            "initiated_by IN ('company', 'agency')",
            name="ck_company_agency_conn_initiated_by",
        ),
        CheckConstraint(
            "status IN ('Draft', 'Sent', 'Pending', 'Counterproposed', 'Agreement Pending', "
            "'Active', 'Rejected', 'Expired', 'Cancelled', 'Suspended', 'Terminated')",
            name="ck_company_agency_conn_status",
        ),
        CheckConstraint(
            "sharing_scope IN ('all_eligible', 'selected_properties')",
            name="ck_company_agency_conn_scope",
        ),
        CheckConstraint(
            "post_termination_policy IN ('preserve_active_transactions', 'company_direct_takeover')",
            name="ck_company_agency_conn_post_term_policy",
        ),
        Index("ix_company_agency_conn_company_status", "company_tenant_id", "status"),
        Index("ix_company_agency_conn_agency_status", "agency_id", "status"),
        Index(
            "uq_active_company_agency_connection",
            "company_tenant_id",
            "agency_id",
            unique=True,
            postgresql_where=text("status NOT IN ('Rejected', 'Expired', 'Cancelled', 'Terminated')"),
            sqlite_where=text("status NOT IN ('Rejected', 'Expired', 'Cancelled', 'Terminated')"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    agency_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False
    )
    initiated_by: Mapped[str] = mapped_column(String(20), nullable=False)
    invitation_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agency_invitations.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Pending", server_default="Pending")

    can_sale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    can_rent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    can_lease: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    sharing_scope: Mapped[str] = mapped_column(
        String(30), nullable=False, default="selected_properties", server_default="selected_properties"
    )

    active_agreement_version_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("agency_agreement_versions.id", ondelete="SET NULL", use_alter=True, name="fk_conn_active_agreement_ver"),
        nullable=True,
    )
    starts_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    expires_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    termination_notice_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30, server_default="30")
    post_termination_policy: Mapped[str] = mapped_column(
        String(40),
        nullable=False,
        default="preserve_active_transactions",
        server_default="preserve_active_transactions",
    )

    activated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    activated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    suspended_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    terminated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    termination_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now, onupdate=_utc_now)


class AgencyAgreementVersion(Base):
    """Immutable versioned commercial agreement for a CompanyAgencyConnection."""

    __tablename__ = "agency_agreement_versions"
    __table_args__ = (
        UniqueConstraint("connection_id", "version_number", name="uq_agency_agreement_conn_version"),
        CheckConstraint("proposed_by_side IN ('company', 'agency')", name="ck_agency_agreement_side"),
        CheckConstraint(
            "status IN ('Draft', 'Proposed', 'Counterproposed', 'Accepted', 'Superseded', 'Rejected')",
            name="ck_agency_agreement_status",
        ),
        CheckConstraint(
            "sharing_scope IN ('all_eligible', 'selected_properties')",
            name="ck_agency_agreement_scope",
        ),
        Index("ix_agency_agreement_conn_status", "connection_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    connection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company_agency_connections.id", ondelete="CASCADE"), nullable=False
    )
    version_number: Mapped[int] = mapped_column(Integer, nullable=False)
    proposed_by_side: Mapped[str] = mapped_column(String(20), nullable=False)
    proposed_by_actor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="Proposed", server_default="Proposed")

    can_sale: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    can_rent: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    can_lease: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    sharing_scope: Mapped[str] = mapped_column(
        String(30), nullable=False, default="selected_properties", server_default="selected_properties"
    )
    commission_terms: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    responsibilities: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    agreement_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    effective_from: Mapped[date | None] = mapped_column(Date, nullable=True)
    effective_to: Mapped[date | None] = mapped_column(Date, nullable=True)
    termination_notice_days: Mapped[int] = mapped_column(Integer, nullable=False, default=30, server_default="30")
    change_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    company_accepted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    company_accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    company_signature_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    agency_accepted_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), nullable=True)
    agency_accepted_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    agency_signature_name: Mapped[str | None] = mapped_column(String(150), nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)


class AgencyPropertyAccess(Base):
    """Explicit per-property sharing grant (or revocation) under a CompanyAgencyConnection."""

    __tablename__ = "agency_property_access"
    __table_args__ = (
        UniqueConstraint("connection_id", "property_id", name="uq_agency_property_access_conn_prop"),
        CheckConstraint("access_status IN ('Active', 'Revoked')", name="ck_agency_property_access_status"),
        Index("ix_agency_property_access_agency_status", "agency_id", "access_status"),
        Index("ix_agency_property_access_company_prop", "company_tenant_id", "property_id", "access_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    connection_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company_agency_connections.id", ondelete="CASCADE"), nullable=False
    )
    company_tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    agency_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False
    )
    property_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="CASCADE"), nullable=False
    )
    access_status: Mapped[str] = mapped_column(String(20), nullable=False, default="Active", server_default="Active")
    granted_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    granted_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)
    revoked_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)


class AgencyNotification(Base):
    """In-app notification feed for global Agencies (works for both Free External and Paid Agencies)."""

    __tablename__ = "agency_notifications"
    __table_args__ = (
        Index("ix_agency_notifications_agency_read", "agency_id", "is_read", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    agency_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False
    )
    connection_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("company_agency_connections.id", ondelete="SET NULL"), nullable=True
    )
    property_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("properties.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    payload: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    idempotency_key: Mapped[str | None] = mapped_column(String(160), unique=True, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    read_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=_utc_now)