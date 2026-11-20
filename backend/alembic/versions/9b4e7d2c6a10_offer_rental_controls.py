"""Add offer governance, walk-in signing, rental late fees and booking controls.

Revision ID: 9b4e7d2c6a10
Revises: f1a2b3c4d5e6
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "9b4e7d2c6a10"
down_revision = "f1a2b3c4d5e6"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("properties", sa.Column("minimum_acceptable_price", sa.Numeric(14, 2), nullable=True))
    op.add_column("properties", sa.Column("require_owner_approval", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("properties", sa.Column("hold_on_offer_acceptance", sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column("properties", sa.Column("offer_hold_hours", sa.Integer(), nullable=False, server_default="48"))
    op.add_column("properties", sa.Column("offer_hold_expires_at", sa.DateTime(), nullable=True))

    op.add_column("property_offers", sa.Column("expires_at", sa.DateTime(), nullable=True))
    op.add_column("property_offers", sa.Column("owner_approved_by", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_property_offers_owner_approved_by_users", "property_offers", "users", ["owner_approved_by"], ["id"], ondelete="SET NULL")
    op.add_column("property_offers", sa.Column("owner_approved_at", sa.DateTime(), nullable=True))
    op.add_column("property_offers", sa.Column("hold_expires_at", sa.DateTime(), nullable=True))
    # Existing offer rows receive a one-week migration grace period rather than
    # becoming immediately expired on deployment.
    op.execute("""
        UPDATE property_offers
        SET expires_at = NOW() + INTERVAL '7 days'
        WHERE expires_at IS NULL AND status IN ('Submitted', 'Countered', 'Accepted')
    """)

    op.add_column("rental_agreements", sa.Column("late_fee_type", sa.String(12), nullable=False, server_default="Fixed"))
    op.add_column("rental_agreements", sa.Column("late_fee_amount", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("rental_agreements", sa.Column("late_fee_grace_days", sa.Integer(), nullable=False, server_default="0"))
    op.add_column("rental_agreements", sa.Column("customer_signature_method", sa.String(60), nullable=True))
    op.add_column("rental_agreements", sa.Column("customer_signature_document_url", sa.Text(), nullable=True))
    op.add_column("rental_agreements", sa.Column("customer_signature_ip", sa.String(64), nullable=True))
    op.add_column("rental_agreements", sa.Column("customer_signature_user_agent", sa.String(500), nullable=True))

    op.add_column("rental_payment_schedules", sa.Column("late_fee_amount", sa.Numeric(14, 2), nullable=False, server_default="0"))
    op.add_column("rental_payment_schedules", sa.Column("late_fee_applied_at", sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column("rental_payment_schedules", "late_fee_applied_at")
    op.drop_column("rental_payment_schedules", "late_fee_amount")
    op.drop_column("rental_agreements", "customer_signature_user_agent")
    op.drop_column("rental_agreements", "customer_signature_ip")
    op.drop_column("rental_agreements", "customer_signature_document_url")
    op.drop_column("rental_agreements", "customer_signature_method")
    op.drop_column("rental_agreements", "late_fee_grace_days")
    op.drop_column("rental_agreements", "late_fee_amount")
    op.drop_column("rental_agreements", "late_fee_type")
    op.drop_column("property_offers", "hold_expires_at")
    op.drop_column("property_offers", "owner_approved_at")
    op.drop_constraint("fk_property_offers_owner_approved_by_users", "property_offers", type_="foreignkey")
    op.drop_column("property_offers", "owner_approved_by")
    op.drop_column("property_offers", "expires_at")
    op.drop_column("properties", "offer_hold_expires_at")
    op.drop_column("properties", "offer_hold_hours")
    op.drop_column("properties", "hold_on_offer_acceptance")
    op.drop_column("properties", "require_owner_approval")
    op.drop_column("properties", "minimum_acceptable_price")
