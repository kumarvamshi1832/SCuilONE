"""Alembic migration for Bundle 2 (Phases 5–10):
- AgencyLead, AgencyRequirement, AgencyShortlist, AgencySaleBookingRequest
- Additive agency attribution columns on bookings, site_visits, property_offers, customer_property_service_requests
- Entity-aware after-sales support routing columns on customer_property_service_requests

Revision ID: g3b8e5d9f216
Revises: f2a9d4c8e105
Create Date: 2026-11-21
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "g3b8e5d9f216"
down_revision = "f2a9d4c8e105"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "agency_leads",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("assigned_actor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("full_name", sa.String(length=150), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("source", sa.String(length=50), nullable=False, server_default="Direct"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="New"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("customer_consent_given_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "status IN ('New', 'Qualified', 'Shortlisting', 'Visiting', 'Negotiating', 'Booked', 'Closed', 'Lost')",
            name="ck_agency_leads_status",
        ),
    )
    op.create_index("ix_agency_leads_agency_status", "agency_leads", ["agency_id", "status"])
    op.create_index("ix_agency_leads_agency_email", "agency_leads", ["agency_id", "email"])

    op.create_table(
        "agency_requirements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agency_lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agency_leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("transaction_type", sa.String(length=20), nullable=False, server_default="Sale"),
        sa.Column("property_type", sa.String(length=50), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("preferred_locality", sa.String(length=150), nullable=True),
        sa.Column("bedrooms", sa.Integer(), nullable=True),
        sa.Column("min_budget", sa.Numeric(14, 2), nullable=True),
        sa.Column("max_budget", sa.Numeric(14, 2), nullable=True),
        sa.Column("min_area", sa.Numeric(12, 2), nullable=True),
        sa.Column("max_area", sa.Numeric(12, 2), nullable=True),
        sa.Column("preferred_amenities", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("lease_duration_months", sa.Integer(), nullable=True),
        sa.Column("lock_in_months", sa.Integer(), nullable=True),
        sa.Column("revision_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("revision_history", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="Active"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("transaction_type IN ('Sale', 'Rent', 'Lease')", name="ck_agency_req_tx_type"),
        sa.CheckConstraint("status IN ('Active', 'Fulfilled', 'Closed', 'Cancelled')", name="ck_agency_req_status"),
    )
    op.create_index("ix_agency_req_agency_tx_status", "agency_requirements", ["agency_id", "transaction_type", "status"])
    op.create_index("ix_agency_requirements_agency_lead_id", "agency_requirements", ["agency_lead_id"])

    op.create_table(
        "agency_shortlists",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agency_lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agency_leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agency_requirement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agency_requirements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company_agency_connections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("company_tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("properties.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="Shortlisted"),
        sa.Column("customer_selected_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("agency_requirement_id", "property_id", name="uq_agency_shortlist_req_prop"),
        sa.CheckConstraint(
            "status IN ('Shortlisted', 'Customer Selected', 'Visit Requested', 'Removed')",
            name="ck_agency_shortlist_status",
        ),
    )
    op.create_index("ix_agency_shortlist_agency_lead", "agency_shortlists", ["agency_id", "agency_lead_id"])

    op.create_table(
        "agency_sale_booking_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("company_tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("properties.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agency_connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company_agency_connections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agreement_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agency_agreement_versions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("agency_lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agency_leads.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agency_requirement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agency_requirements.id", ondelete="SET NULL"), nullable=True),
        sa.Column("accepted_offer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("property_offers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("agency_assigned_actor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("customer_name", sa.String(length=150), nullable=False),
        sa.Column("customer_email", sa.String(length=255), nullable=True),
        sa.Column("customer_phone", sa.String(length=30), nullable=True),
        sa.Column("customer_consent_at", sa.DateTime(), nullable=False),
        sa.Column("proposed_price", sa.Numeric(14, 2), nullable=False),
        sa.Column("booking_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("payment_preference", sa.String(length=30), nullable=False, server_default="Full Payment"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="Requested"),
        sa.Column("hold_expires_at", sa.DateTime(), nullable=True),
        sa.Column("agreement_text", sa.Text(), nullable=True),
        sa.Column("agreement_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("agreement_status", sa.String(length=30), nullable=False, server_default="Not Prepared"),
        sa.Column("customer_signed_name", sa.String(length=150), nullable=True),
        sa.Column("customer_signed_at", sa.DateTime(), nullable=True),
        sa.Column("payment_instructions", sa.Text(), nullable=True),
        sa.Column("agency_notes", sa.Text(), nullable=True),
        sa.Column("company_notes", sa.Text(), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("company_reviewed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("company_reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("status IN ('Requested', 'Approved', 'Confirmed', 'Rejected', 'Expired', 'Cancelled')", name="ck_agency_sale_req_status"),
        sa.CheckConstraint("payment_preference IN ('Full Payment', 'Installments')", name="ck_agency_sale_req_pay_pref"),
    )
    op.create_index("ix_agency_sale_req_company_status", "agency_sale_booking_requests", ["company_tenant_id", "status"])
    op.create_index("ix_agency_sale_req_agency_status", "agency_sale_booking_requests", ["source_agency_id", "status"])
    op.create_index("ix_agency_sale_req_property", "agency_sale_booking_requests", ["property_id", "status"])

    # Additive agency attribution columns on bookings
    op.add_column("bookings", sa.Column("source_agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="SET NULL"), nullable=True))
    op.add_column("bookings", sa.Column("agency_connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company_agency_connections.id", ondelete="SET NULL"), nullable=True))
    op.add_column("bookings", sa.Column("agency_agreement_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agency_agreement_versions.id", ondelete="SET NULL"), nullable=True))
    op.add_column("bookings", sa.Column("agency_lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agency_leads.id", ondelete="SET NULL"), nullable=True))
    op.add_column("bookings", sa.Column("agency_assigned_actor_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_index("ix_bookings_source_agency", "bookings", ["source_agency_id", "status"])

    # Additive agency collaboration columns on site_visits
    op.alter_column("site_visits", "property_match_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.add_column("site_visits", sa.Column("property_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("properties.id", ondelete="SET NULL"), nullable=True))
    op.add_column("site_visits", sa.Column("source_agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="SET NULL"), nullable=True))
    op.add_column("site_visits", sa.Column("agency_connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company_agency_connections.id", ondelete="SET NULL"), nullable=True))
    op.add_column("site_visits", sa.Column("agency_lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agency_leads.id", ondelete="SET NULL"), nullable=True))
    op.add_column("site_visits", sa.Column("company_approval_status", sa.String(length=30), nullable=False, server_default="Approved"))
    op.add_column("site_visits", sa.Column("visit_instructions", sa.Text(), nullable=True))
    op.add_column("site_visits", sa.Column("agency_feedback", sa.Text(), nullable=True))
    op.add_column("site_visits", sa.Column("company_feedback", sa.Text(), nullable=True))
    op.add_column("site_visits", sa.Column("customer_name", sa.String(length=150), nullable=True))
    op.add_column("site_visits", sa.Column("customer_phone", sa.String(length=30), nullable=True))
    op.create_index("ix_site_visits_source_agency", "site_visits", ["source_agency_id", "company_approval_status"])

    # Additive agency collaboration columns on property_offers
    op.alter_column("property_offers", "property_match_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.add_column("property_offers", sa.Column("property_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("properties.id", ondelete="SET NULL"), nullable=True))
    op.add_column("property_offers", sa.Column("source_agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="SET NULL"), nullable=True))
    op.add_column("property_offers", sa.Column("agency_connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company_agency_connections.id", ondelete="SET NULL"), nullable=True))
    op.add_column("property_offers", sa.Column("agency_lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agency_leads.id", ondelete="SET NULL"), nullable=True))
    op.add_column("property_offers", sa.Column("submitted_by_side", sa.String(length=20), nullable=False, server_default="company"))
    op.add_column("property_offers", sa.Column("version_number", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("property_offers", sa.Column("customer_name", sa.String(length=150), nullable=True))
    op.create_index("ix_property_offers_source_agency", "property_offers", ["source_agency_id", "status"])

    # Entity-aware after-sales support routing on customer_property_service_requests
    op.alter_column("customer_property_service_requests", "portal_user_id", existing_type=postgresql.UUID(as_uuid=True), nullable=True)
    op.add_column("customer_property_service_requests", sa.Column("responsible_entity_type", sa.String(length=20), nullable=False, server_default="company"))
    op.add_column("customer_property_service_requests", sa.Column("responsible_agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="SET NULL"), nullable=True))
    op.add_column("customer_property_service_requests", sa.Column("source_agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="SET NULL"), nullable=True))
    op.add_column("customer_property_service_requests", sa.Column("agency_assist_allowed", sa.Boolean(), nullable=False, server_default="true"))
    op.create_check_constraint(
        "ck_service_req_responsible_entity",
        "customer_property_service_requests",
        "responsible_entity_type IN ('company', 'agency', 'owner', 'platform')",
    )


def downgrade() -> None:
    op.drop_constraint("ck_service_req_responsible_entity", "customer_property_service_requests", type_="check")
    op.drop_column("customer_property_service_requests", "agency_assist_allowed")
    op.drop_column("customer_property_service_requests", "source_agency_id")
    op.drop_column("customer_property_service_requests", "responsible_agency_id")
    op.drop_column("customer_property_service_requests", "responsible_entity_type")

    op.drop_index("ix_property_offers_source_agency", table_name="property_offers")
    op.drop_column("property_offers", "customer_name")
    op.drop_column("property_offers", "version_number")
    op.drop_column("property_offers", "submitted_by_side")
    op.drop_column("property_offers", "agency_lead_id")
    op.drop_column("property_offers", "agency_connection_id")
    op.drop_column("property_offers", "source_agency_id")
    op.drop_column("property_offers", "property_id")
    op.alter_column("property_offers", "property_match_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)

    op.drop_index("ix_site_visits_source_agency", table_name="site_visits")
    op.drop_column("site_visits", "customer_phone")
    op.drop_column("site_visits", "customer_name")
    op.drop_column("site_visits", "company_feedback")
    op.drop_column("site_visits", "agency_feedback")
    op.drop_column("site_visits", "visit_instructions")
    op.drop_column("site_visits", "company_approval_status")
    op.drop_column("site_visits", "agency_lead_id")
    op.drop_column("site_visits", "agency_connection_id")
    op.drop_column("site_visits", "source_agency_id")
    op.drop_column("site_visits", "property_id")
    op.alter_column("site_visits", "property_match_id", existing_type=postgresql.UUID(as_uuid=True), nullable=False)

    op.drop_index("ix_bookings_source_agency", table_name="bookings")
    op.drop_column("bookings", "agency_assigned_actor_id")
    op.drop_column("bookings", "agency_lead_id")
    op.drop_column("bookings", "agency_agreement_version_id")
    op.drop_column("bookings", "agency_connection_id")
    op.drop_column("bookings", "source_agency_id")

    op.drop_index("ix_agency_sale_req_property", table_name="agency_sale_booking_requests")
    op.drop_index("ix_agency_sale_req_agency_status", table_name="agency_sale_booking_requests")
    op.drop_index("ix_agency_sale_req_company_status", table_name="agency_sale_booking_requests")
    op.drop_table("agency_sale_booking_requests")

    op.drop_index("ix_agency_shortlist_agency_lead", table_name="agency_shortlists")
    op.drop_table("agency_shortlists")

    op.drop_index("ix_agency_requirements_agency_lead_id", table_name="agency_requirements")
    op.drop_index("ix_agency_req_agency_tx_status", table_name="agency_requirements")
    op.drop_table("agency_requirements")

    op.drop_index("ix_agency_leads_agency_email", table_name="agency_leads")
    op.drop_index("ix_agency_leads_agency_status", table_name="agency_leads")
    op.drop_table("agency_leads")
