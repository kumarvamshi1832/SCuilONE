"""Add real estate booking holds, walk-in handover support, and rental/lease booking requests.

Revision ID: e4b9c2f7a108
Revises: a8c5d7e9f1b3
Create Date: 2026-11-21 00:15:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "e4b9c2f7a108"
down_revision: Union[str, Sequence[str], None] = "a8c5d7e9f1b3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Walk-in Sale booking temporary hold columns & expiry index
    op.add_column("bookings", sa.Column("hold_created_at", sa.DateTime(), nullable=True))
    op.add_column("bookings", sa.Column("hold_expires_at", sa.DateTime(), nullable=True))
    op.add_column("bookings", sa.Column("expired_at", sa.DateTime(), nullable=True))
    op.create_index(
        "ix_bookings_hold_expiry",
        "bookings",
        ["tenant_id", "status", "hold_expires_at"],
    )

    # 2. Portal Sale booking request immediate hold tracking & unique active hold per property
    op.add_column("customer_booking_requests", sa.Column("hold_created_at", sa.DateTime(), nullable=True))
    op.create_index(
        "uq_customer_booking_requests_active_property",
        "customer_booking_requests",
        ["tenant_id", "property_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('Requested', 'Approved')"),
    )

    # 3. Walk-in & portal handover lifecycle support on property_handovers
    op.alter_column(
        "property_handovers",
        "portal_user_id",
        existing_type=postgresql.UUID(as_uuid=True),
        nullable=True,
    )
    op.add_column(
        "property_handovers",
        sa.Column("handover_mode", sa.String(length=20), nullable=False, server_default="Portal"),
    )
    op.add_column(
        "property_handovers",
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "property_handovers",
        sa.Column("lead_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "property_handovers",
        sa.Column("customer_name", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "property_handovers",
        sa.Column("property_condition", sa.String(length=50), nullable=True),
    )
    op.add_column(
        "property_handovers",
        sa.Column("keys_handed_over", sa.Text(), nullable=True),
    )
    op.add_column(
        "property_handovers",
        sa.Column("documents_transferred", sa.JSON(), nullable=True),
    )
    op.add_column(
        "property_handovers",
        sa.Column("evidence_urls", sa.JSON(), nullable=True),
    )
    op.add_column(
        "property_handovers",
        sa.Column("handover_remarks", sa.Text(), nullable=True),
    )
    op.add_column(
        "property_handovers",
        sa.Column("staff_acknowledged_by", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "property_handovers",
        sa.Column("staff_acknowledged_at", sa.DateTime(), nullable=True),
    )
    op.add_column(
        "property_handovers",
        sa.Column("staff_acknowledgement_notes", sa.Text(), nullable=True),
    )
    op.add_column(
        "property_handovers",
        sa.Column("completed_by", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_check_constraint(
        "ck_property_handovers_mode",
        "property_handovers",
        "handover_mode IN ('Portal', 'Walk-in')",
    )
    op.create_foreign_key(
        "fk_property_handovers_contact_id",
        "property_handovers",
        "contacts",
        ["contact_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_property_handovers_lead_id",
        "property_handovers",
        "leads",
        ["lead_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_property_handovers_staff_ack_by",
        "property_handovers",
        "users",
        ["staff_acknowledged_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_property_handovers_completed_by",
        "property_handovers",
        "users",
        ["completed_by"],
        ["id"],
        ondelete="SET NULL",
    )

    # 4. Unified Rent & Lease booking requests table (Portal + Walk-in) with temporary holds
    op.create_table(
        "rental_booking_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("properties.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("booking_type", sa.String(length=20), nullable=False),
        sa.Column("channel", sa.String(length=20), nullable=False, server_default="Portal"),
        sa.Column("portal_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("customer_portal_users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contacts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("accounts.id", ondelete="SET NULL"), nullable=True),
        sa.Column("lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("leads.id", ondelete="SET NULL"), nullable=True),
        sa.Column("buyer_requirement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("buyer_requirements.id", ondelete="SET NULL"), nullable=True),
        sa.Column("property_match_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("property_matches.id", ondelete="SET NULL"), nullable=True),
        sa.Column("accepted_offer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("property_offers.id", ondelete="SET NULL"), nullable=True),
        sa.Column("rental_agreement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rental_agreements.id", ondelete="SET NULL"), nullable=True),
        sa.Column("customer_name", sa.String(length=200), nullable=False),
        sa.Column("customer_email", sa.String(length=255), nullable=True),
        sa.Column("customer_phone", sa.String(length=30), nullable=True),
        sa.Column("proposed_rent_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("approved_rent_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("rent_frequency", sa.String(length=20), nullable=False, server_default="Monthly"),
        sa.Column("proposed_deposit_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("approved_deposit_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("maintenance_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("maintenance_frequency", sa.String(length=20), nullable=False, server_default="Monthly"),
        sa.Column("desired_start_date", sa.Date(), nullable=False),
        sa.Column("desired_end_date", sa.Date(), nullable=True),
        sa.Column("duration_months", sa.Integer(), nullable=True),
        sa.Column("lock_in_months", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notice_period_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("due_day", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("late_fee_type", sa.String(length=12), nullable=False, server_default="Fixed"),
        sa.Column("late_fee_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("late_fee_grace_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="Requested"),
        sa.Column("hold_created_at", sa.DateTime(), nullable=True),
        sa.Column("hold_expires_at", sa.DateTime(), nullable=True),
        sa.Column("expired_at", sa.DateTime(), nullable=True),
        sa.Column("terms_notes", sa.Text(), nullable=True),
        sa.Column("customer_notes", sa.Text(), nullable=True),
        sa.Column("staff_notes", sa.Text(), nullable=True),
        sa.Column("rejection_reason", sa.Text(), nullable=True),
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("booking_type IN ('Rent', 'Lease')", name="ck_rental_booking_req_type"),
        sa.CheckConstraint("channel IN ('Portal', 'Walk-in')", name="ck_rental_booking_req_channel"),
        sa.CheckConstraint(
            "status IN ('Requested', 'Approved', 'Agreement Created', 'Activated', 'Rejected', 'Cancelled', 'Expired', 'Expired - Payment Review')",
            name="ck_rental_booking_req_status",
        ),
        sa.CheckConstraint("proposed_rent_amount > 0", name="ck_rental_booking_req_rent_positive"),
        sa.CheckConstraint("approved_rent_amount IS NULL OR approved_rent_amount > 0", name="ck_rental_booking_req_approved_rent_positive"),
        sa.CheckConstraint("proposed_deposit_amount >= 0", name="ck_rental_booking_req_deposit_nonnegative"),
        sa.CheckConstraint("approved_deposit_amount IS NULL OR approved_deposit_amount >= 0", name="ck_rental_booking_req_approved_deposit_nonnegative"),
        sa.CheckConstraint("maintenance_amount >= 0", name="ck_rental_booking_req_maint_nonnegative"),
        sa.CheckConstraint("lock_in_months >= 0 AND notice_period_days >= 0", name="ck_rental_booking_req_terms_nonnegative"),
        sa.CheckConstraint("due_day >= 1 AND due_day <= 28", name="ck_rental_booking_req_due_day"),
    )
    op.create_index("ix_rental_booking_requests_tenant_status", "rental_booking_requests", ["tenant_id", "status"])
    op.create_index("ix_rental_booking_requests_tenant_property", "rental_booking_requests", ["tenant_id", "property_id"])
    op.create_index("ix_rental_booking_requests_hold_expiry", "rental_booking_requests", ["tenant_id", "status", "hold_expires_at"])
    op.create_index(
        "uq_rental_booking_requests_active_property",
        "rental_booking_requests",
        ["tenant_id", "property_id"],
        unique=True,
        postgresql_where=sa.text("status IN ('Requested', 'Approved', 'Agreement Created')"),
    )


def downgrade() -> None:
    op.drop_index("uq_rental_booking_requests_active_property", table_name="rental_booking_requests")
    op.drop_index("ix_rental_booking_requests_hold_expiry", table_name="rental_booking_requests")
    op.drop_index("ix_rental_booking_requests_tenant_property", table_name="rental_booking_requests")
    op.drop_index("ix_rental_booking_requests_tenant_status", table_name="rental_booking_requests")
    op.drop_table("rental_booking_requests")

    op.drop_constraint("fk_property_handovers_completed_by", "property_handovers", type_="foreignkey")
    op.drop_constraint("fk_property_handovers_staff_ack_by", "property_handovers", type_="foreignkey")
    op.drop_constraint("fk_property_handovers_lead_id", "property_handovers", type_="foreignkey")
    op.drop_constraint("fk_property_handovers_contact_id", "property_handovers", type_="foreignkey")
    op.drop_constraint("ck_property_handovers_mode", "property_handovers", type_="check")
    op.drop_column("property_handovers", "completed_by")
    op.drop_column("property_handovers", "staff_acknowledgement_notes")
    op.drop_column("property_handovers", "staff_acknowledged_at")
    op.drop_column("property_handovers", "staff_acknowledged_by")
    op.drop_column("property_handovers", "handover_remarks")
    op.drop_column("property_handovers", "evidence_urls")
    op.drop_column("property_handovers", "documents_transferred")
    op.drop_column("property_handovers", "keys_handed_over")
    op.drop_column("property_handovers", "property_condition")
    op.drop_column("property_handovers", "customer_name")
    op.drop_column("property_handovers", "lead_id")
    op.drop_column("property_handovers", "contact_id")
    op.drop_column("property_handovers", "handover_mode")
    # Note: portal_user_id remains nullable if walk-in handovers already exist; enforce NOT NULL only when safe.

    op.drop_index("uq_customer_booking_requests_active_property", table_name="customer_booking_requests")
    op.drop_column("customer_booking_requests", "hold_created_at")

    op.drop_index("ix_bookings_hold_expiry", table_name="bookings")
    op.drop_column("bookings", "expired_at")
    op.drop_column("bookings", "hold_expires_at")
    op.drop_column("bookings", "hold_created_at")
