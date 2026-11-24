"""Alembic migration for Bundle 3 (Phases 11–13):
- Phase 11: Additive 3-mode agency attribution & distinct Lease policy columns on rental_booking_requests & rental_agreements
- Phase 13: agency_commission_entries, property_owners, owner_agency_mandates, owner_portal_users, owner_portal_sessions, owner_payout_ledgers

Revision ID: h4c9f6e1a327
Revises: g3b8e5d9f216
Create Date: 2026-11-21
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "h4c9f6e1a327"
down_revision = "g3b8e5d9f216"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "property_owners",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("full_name", sa.String(length=150), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("pan_number", sa.String(length=20), nullable=True),
        sa.Column("payout_details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="Active"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tenant_id", "email", name="uq_property_owners_tenant_email"),
    )
    op.create_index("ix_property_owners_tenant_status", "property_owners", ["tenant_id", "status"])

    op.create_table(
        "owner_agency_mandates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("property_owners.id", ondelete="CASCADE"), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("properties.id", ondelete="CASCADE"), nullable=False),
        sa.Column("management_fee_type", sa.String(length=20), nullable=False, server_default="percentage"),
        sa.Column("management_fee_value", sa.Numeric(14, 2), nullable=False, server_default="8.00"),
        sa.Column("collection_authority", sa.String(length=30), nullable=False, server_default="authorized_collection"),
        sa.Column("starts_at", sa.Date(), nullable=True),
        sa.Column("expires_at", sa.Date(), nullable=True),
        sa.Column("termination_notice_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="Pending Owner Approval"),
        sa.Column("owner_approved_at", sa.DateTime(), nullable=True),
        sa.Column("agreement_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("management_fee_type IN ('percentage', 'fixed')", name="ck_owner_mandate_fee_type"),
        sa.CheckConstraint("collection_authority IN ('authorized_collection', 'direct_to_owner')", name="ck_owner_mandate_collection_auth"),
        sa.CheckConstraint("status IN ('Draft', 'Pending Owner Approval', 'Active', 'Suspended', 'Terminated')", name="ck_owner_mandate_status"),
    )
    op.create_index("ix_owner_mandate_tenant_prop", "owner_agency_mandates", ["tenant_id", "property_id", "status"])

    # Additive 3-mode attribution & Lease policy columns on rental_booking_requests & rental_agreements
    op.add_column("rental_booking_requests", sa.Column("source_agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="SET NULL"), nullable=True))
    op.add_column("rental_booking_requests", sa.Column("agency_connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company_agency_connections.id", ondelete="SET NULL"), nullable=True))
    op.add_column("rental_booking_requests", sa.Column("agency_lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agency_leads.id", ondelete="SET NULL"), nullable=True))

    op.add_column("rental_agreements", sa.Column("source_agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="SET NULL"), nullable=True))
    op.add_column("rental_agreements", sa.Column("agency_connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company_agency_connections.id", ondelete="SET NULL"), nullable=True))
    op.add_column("rental_agreements", sa.Column("agency_agreement_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agency_agreement_versions.id", ondelete="SET NULL"), nullable=True))
    op.add_column("rental_agreements", sa.Column("owner_mandate_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("owner_agency_mandates.id", ondelete="SET NULL"), nullable=True))
    op.add_column("rental_agreements", sa.Column("advance_amount", sa.Numeric(14, 2), nullable=False, server_default="0.00"))
    op.add_column("rental_agreements", sa.Column("escalation_frequency_months", sa.Integer(), nullable=True))
    op.add_column("rental_agreements", sa.Column("escalation_percent", sa.Numeric(6, 2), nullable=True))
    op.add_column("rental_agreements", sa.Column("maintenance_responsibility", sa.String(length=20), nullable=False, server_default="tenant"))
    op.add_column("rental_agreements", sa.Column("possession_date", sa.Date(), nullable=True))
    op.add_column("rental_agreements", sa.Column("commercial_use_clause", sa.Text(), nullable=True))
    op.add_column("rental_agreements", sa.Column("collection_mode", sa.String(length=30), nullable=False, server_default="authorized_collection"))

    op.create_table(
        "agency_commission_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("company_tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company_agency_connections.id", ondelete="SET NULL"), nullable=True),
        sa.Column("agreement_version_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agency_agreement_versions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("transaction_type", sa.String(length=20), nullable=False),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bookings.id", ondelete="SET NULL"), nullable=True),
        sa.Column("rental_agreement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rental_agreements.id", ondelete="SET NULL"), nullable=True),
        sa.Column("transaction_value", sa.Numeric(14, 2), nullable=False),
        sa.Column("commission_structure", sa.String(length=30), nullable=False),
        sa.Column("commission_rate_or_value", sa.Numeric(14, 2), nullable=False),
        sa.Column("gross_commission", sa.Numeric(14, 2), nullable=False),
        sa.Column("tax_deduction", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("other_deductions", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("net_payable", sa.Numeric(14, 2), nullable=False),
        sa.Column("payer", sa.String(length=20), nullable=False, server_default="company"),
        sa.Column("trigger_event", sa.String(length=80), nullable=False, server_default="booking_confirmed"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="Pending"),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("paid_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("payout_reference", sa.String(length=120), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("transaction_type IN ('Sale', 'Rent', 'Lease')", name="ck_comm_entry_tx_type"),
        sa.CheckConstraint("commission_structure IN ('percentage', 'fixed', 'one_month_rent', 'custom')", name="ck_comm_entry_structure"),
        sa.CheckConstraint("status IN ('Pending', 'Eligible', 'Approved', 'Paid', 'Reversed', 'Adjusted')", name="ck_comm_entry_status"),
    )
    op.create_index("ix_comm_entry_company_status", "agency_commission_entries", ["company_tenant_id", "status"])
    op.create_index("ix_comm_entry_agency_status", "agency_commission_entries", ["agency_id", "status"])

    op.create_table(
        "owner_portal_users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("property_owners.id", ondelete="CASCADE"), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("password_hash", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="Active"),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tenant_id", "owner_id", name="uq_owner_portal_tenant_owner"),
    )
    op.create_index("ix_owner_portal_email", "owner_portal_users", ["email"])

    op.create_table(
        "owner_portal_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_portal_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("owner_portal_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_owner_portal_sessions_user", "owner_portal_sessions", ["owner_portal_user_id", "revoked"])

    op.create_table(
        "owner_payout_ledgers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("owner_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("property_owners.id", ondelete="CASCADE"), nullable=False),
        sa.Column("mandate_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("owner_agency_mandates.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rental_agreement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rental_agreements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("rental_payment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rental_payments.id", ondelete="SET NULL"), nullable=True),
        sa.Column("collection_mode", sa.String(length=30), nullable=False),
        sa.Column("rent_collected", sa.Numeric(14, 2), nullable=False),
        sa.Column("management_fee", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("commission_deduction", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("approved_expenses", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("net_owner_payout", sa.Numeric(14, 2), nullable=False),
        sa.Column("management_fee_receivable", sa.Numeric(14, 2), nullable=False, server_default="0.00"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="Pending"),
        sa.Column("bank_transfer_reference", sa.String(length=120), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("collection_mode IN ('authorized_collection', 'direct_to_owner')", name="ck_owner_payout_collection_mode"),
        sa.CheckConstraint("status IN ('Pending', 'Approved', 'Paid', 'Reconciled', 'Cancelled')", name="ck_owner_payout_status"),
    )
    op.create_index("ix_owner_payout_tenant_owner", "owner_payout_ledgers", ["tenant_id", "owner_id", "status"])


def downgrade() -> None:
    op.drop_index("ix_owner_payout_tenant_owner", table_name="owner_payout_ledgers")
    op.drop_table("owner_payout_ledgers")
    op.drop_index("ix_owner_portal_sessions_user", table_name="owner_portal_sessions")
    op.drop_table("owner_portal_sessions")
    op.drop_index("ix_owner_portal_email", table_name="owner_portal_users")
    op.drop_table("owner_portal_users")
    op.drop_index("ix_comm_entry_agency_status", table_name="agency_commission_entries")
    op.drop_index("ix_comm_entry_company_status", table_name="agency_commission_entries")
    op.drop_table("agency_commission_entries")

    for col in [
        "collection_mode", "commercial_use_clause", "possession_date", "maintenance_responsibility",
        "escalation_percent", "escalation_frequency_months", "advance_amount", "owner_mandate_id",
        "agency_agreement_version_id", "agency_connection_id", "source_agency_id",
    ]:
        op.drop_column("rental_agreements", col)
    for col in ["agency_lead_id", "agency_connection_id", "source_agency_id"]:
        op.drop_column("rental_booking_requests", col)

    op.drop_index("ix_owner_mandate_tenant_prop", table_name="owner_agency_mandates")
    op.drop_table("owner_agency_mandates")
    op.drop_index("ix_property_owners_tenant_status", table_name="property_owners")
    op.drop_table("property_owners")
