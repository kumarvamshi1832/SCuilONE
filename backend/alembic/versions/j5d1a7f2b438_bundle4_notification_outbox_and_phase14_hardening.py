"""
- Transactional notification_outbox table with idempotency_key and retry scheduling indexes

Revision ID: j5d1a7f2b438
Revises: h4c9f6e1a327
Create Date: 2026-11-21
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "j5d1a7f2b438"
down_revision = "h4c9f6e1a327"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "notification_outbox",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=True),
        sa.Column("agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="CASCADE"), nullable=True),
        sa.Column("connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company_agency_connections.id", ondelete="SET NULL"), nullable=True),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("properties.id", ondelete="SET NULL"), nullable=True),
        sa.Column("channel", sa.String(length=30), nullable=False),
        sa.Column("event_type", sa.String(length=80), nullable=False),
        sa.Column("recipient_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("recipient_email", sa.String(length=255), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("idempotency_key", sa.String(length=180), nullable=True, unique=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="Pending"),
        sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_attempts", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("next_attempt_at", sa.DateTime(), nullable=False),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("channel IN ('in_app', 'email', 'agency_in_app')", name="ck_notif_outbox_channel"),
        sa.CheckConstraint("status IN ('Pending', 'Processing', 'Sent', 'Failed', 'DeadLetter')", name="ck_notif_outbox_status"),
    )
    op.create_index("ix_notif_outbox_status_next_attempt", "notification_outbox", ["status", "next_attempt_at"])
    op.create_index("ix_notif_outbox_tenant_created", "notification_outbox", ["tenant_id", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_notif_outbox_tenant_created", table_name="notification_outbox")
    op.drop_index("ix_notif_outbox_status_next_attempt", table_name="notification_outbox")
    op.drop_table("notification_outbox")
