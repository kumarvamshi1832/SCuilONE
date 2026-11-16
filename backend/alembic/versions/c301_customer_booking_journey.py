"""customer portal real estate booking journey

Revision ID: c301_customer_booking_journey
Revises: b201_cust_prop_shortlists
Create Date: 2026-11-16
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c301_customer_booking_journey"
down_revision: Union[str, Sequence[str], None] = "b201_cust_prop_shortlists"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "customer_site_visit_feedback",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("portal_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("site_visit_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=True),
        sa.Column("feedback", sa.Text(), nullable=True),
        sa.Column("decision", sa.String(length=30), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["portal_user_id"], ["customer_portal_users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["site_visit_id"], ["site_visits.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "site_visit_id", name="uq_customer_visit_feedback_visit"),
        sa.CheckConstraint("rating IS NULL OR rating BETWEEN 1 AND 5", name="ck_customer_visit_feedback_rating"),
        sa.CheckConstraint("decision IN ('Interested', 'Maybe', 'Not Interested')", name="ck_customer_visit_feedback_decision"),
    )
    op.create_table(
        "customer_booking_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("portal_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("buyer_requirement_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("property_match_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("site_visit_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="Requested"),
        sa.Column("hold_expires_at", sa.DateTime(), nullable=True),
        sa.Column("extension_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("agreed_price", sa.Numeric(14, 2), nullable=True),
        sa.Column("booking_amount", sa.Numeric(14, 2), nullable=True),
        sa.Column("payment_preference", sa.String(length=30), nullable=False, server_default="Full Payment"),
        sa.Column("customer_notes", sa.Text(), nullable=True),
        sa.Column("customer_message", sa.Text(), nullable=True),
        sa.Column("payment_instructions", sa.Text(), nullable=True),
        sa.Column("staff_notes", sa.Text(), nullable=True),
        sa.Column("agreement_text", sa.Text(), nullable=True),
        sa.Column("agreement_version", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("agreement_status", sa.String(length=30), nullable=False, server_default="Not Prepared"),
        sa.Column("agreement_customer_name", sa.String(length=200), nullable=True),
        sa.Column("agreement_acknowledged_at", sa.DateTime(), nullable=True),
        sa.Column("agreement_verified_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("agreement_verified_at", sa.DateTime(), nullable=True),
        sa.Column("final_confirmed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["portal_user_id"], ["customer_portal_users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["buyer_requirement_id"], ["buyer_requirements.id"]),
        sa.ForeignKeyConstraint(["property_match_id"], ["property_matches.id"]),
        sa.ForeignKeyConstraint(["property_id"], ["properties.id"]),
        sa.ForeignKeyConstraint(["site_visit_id"], ["site_visits.id"]),
        sa.ForeignKeyConstraint(["booking_id"], ["bookings.id"]),
        sa.ForeignKeyConstraint(["agreement_verified_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "portal_user_id", "site_visit_id", name="uq_customer_booking_request_visit"),
        sa.CheckConstraint("status IN ('Requested', 'Approved', 'Confirmed', 'Completed', 'Rejected', 'Expired', 'Expired - Payment Review', 'Cancelled')", name="ck_customer_booking_request_status"),
        sa.CheckConstraint("agreement_status IN ('Not Prepared', 'Prepared', 'Customer Acknowledged', 'Verified', 'Rejected')", name="ck_customer_booking_request_agreement_status"),
        sa.CheckConstraint("payment_preference IN ('Full Payment', 'Installments')", name="ck_customer_booking_request_payment_preference"),
        sa.CheckConstraint("extension_count BETWEEN 0 AND 2", name="ck_customer_booking_request_extensions"),
        sa.CheckConstraint("booking_amount IS NULL OR booking_amount >= 0", name="ck_customer_booking_request_booking_amount"),
        sa.CheckConstraint("agreed_price IS NULL OR agreed_price > 0", name="ck_customer_booking_request_agreed_price"),
        sa.CheckConstraint("booking_amount IS NULL OR agreed_price IS NULL OR booking_amount <= agreed_price", name="ck_customer_booking_request_amount_not_over_price"),
    )
    op.create_index("ix_customer_booking_requests_tenant_status", "customer_booking_requests", ["tenant_id", "status"])
    op.create_table(
        "customer_portal_journey_files",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("portal_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("booking_request_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("payment_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("purpose", sa.String(length=30), nullable=False),
        sa.Column("agreement_version", sa.Integer(), nullable=True),
        sa.Column("filename", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=150), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=False),
        sa.Column("storage_public_id", sa.String(length=500), nullable=False),
        sa.Column("file_url", sa.Text(), nullable=False),
        sa.Column("uploaded_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["portal_user_id"], ["customer_portal_users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["booking_request_id"], ["customer_booking_requests.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["payment_id"], ["payments.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("storage_public_id"),
        sa.CheckConstraint("purpose IN ('Signed Agreement', 'Payment Proof')", name="ck_customer_journey_file_purpose"),
        sa.CheckConstraint("file_size > 0 AND file_size <= 5242880", name="ck_customer_journey_file_size"),
    )
    op.create_index("ix_customer_journey_files_request", "customer_portal_journey_files", ["tenant_id", "booking_request_id", "purpose"])
    op.create_index("ix_customer_booking_requests_property_hold", "customer_booking_requests", ["tenant_id", "property_id", "status", "hold_expires_at"])


def downgrade() -> None:
    op.drop_index("ix_customer_journey_files_request", table_name="customer_portal_journey_files")
    op.drop_table("customer_portal_journey_files")
    op.drop_index("ix_customer_booking_requests_property_hold", table_name="customer_booking_requests")
    op.drop_index("ix_customer_booking_requests_tenant_status", table_name="customer_booking_requests")
    op.drop_table("customer_booking_requests")
    op.drop_table("customer_site_visit_feedback")
