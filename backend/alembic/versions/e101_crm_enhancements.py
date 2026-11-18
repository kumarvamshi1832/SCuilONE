"""Add CRM enhancement persistence for scoring, forecasts, email and custom fields.

Revision ID: e101_crm_enhancements
Revises: d901_portal_lifecycle
Create Date: 2026-11-17
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "e101_crm_enhancements"
down_revision: Union[str, Sequence[str], None] = "d901_portal_lifecycle"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _add_record_columns(table: str, *, scoring: bool = False) -> None:
    op.add_column(table, sa.Column("deleted_at", sa.DateTime(), nullable=True))
    op.add_column(table, sa.Column("deleted_by", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key(
        f"fk_{table}_deleted_by_users", table, "users", ["deleted_by"], ["id"]
    )
    op.create_index(f"ix_{table}_deleted_at", table, ["deleted_at"], unique=False)
    op.add_column(table, sa.Column("custom_fields", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
    if scoring:
        op.add_column(table, sa.Column("score", sa.Integer(), server_default="0", nullable=False))
        op.add_column(table, sa.Column("engagement_score", sa.Integer(), server_default="0", nullable=False))
        op.add_column(table, sa.Column("score_label", sa.String(length=20), server_default="Cold", nullable=False))
        op.add_column(table, sa.Column("score_breakdown", postgresql.JSONB(astext_type=sa.Text()), nullable=True))
        op.add_column(table, sa.Column("scored_at", sa.DateTime(), nullable=True))
        op.create_index("ix_leads_score", "leads", ["score"], unique=False)
        op.create_index("ix_leads_score_label", "leads", ["score_label"], unique=False)


def upgrade() -> None:
    # Lead scoring and common custom-field / soft-delete columns.
    _add_record_columns("leads", scoring=True)
    for table in ("contacts", "accounts", "deals"):
        _add_record_columns(table)

    # Per-stage probability drives amount * probability weighted forecasting.
    op.add_column("pipeline_stages", sa.Column("probability", sa.Integer(), server_default="20", nullable=False))
    op.create_check_constraint(
        "ck_pipeline_stages_probability_range", "pipeline_stages", "probability >= 0 AND probability <= 100"
    )

    # Tenant-defined field definitions. Values live on each entity's custom_fields JSONB column.
    op.create_table(
        "custom_field_definitions",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("entity", sa.String(length=20), nullable=False),
        sa.Column("field_key", sa.String(length=50), nullable=False),
        sa.Column("label", sa.String(length=100), nullable=False),
        sa.Column("field_type", sa.String(length=20), nullable=False),
        sa.Column("options", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("help_text", sa.String(length=255), nullable=True),
        sa.Column("is_required", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default=sa.true(), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "entity", "field_key", name="uq_custom_field_key"),
    )
    op.create_index("ix_custom_field_definitions_tenant_id", "custom_field_definitions", ["tenant_id"], unique=False)

    # Email timeline, scoped to a tenant and optionally linked to CRM records.
    op.create_table(
        "email_logs",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("direction", sa.String(length=10), nullable=False),
        sa.Column("status", sa.String(length=15), nullable=False),
        sa.Column("source", sa.String(length=15), nullable=False),
        sa.Column("subject", sa.String(length=500), server_default="", nullable=False),
        sa.Column("body_text", sa.Text(), server_default="", nullable=False),
        sa.Column("from_email", sa.String(length=255), nullable=True),
        sa.Column("to_emails", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("cc_emails", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("message_id", sa.String(length=255), nullable=True),
        sa.Column("in_reply_to", sa.String(length=255), nullable=True),
        sa.Column("thread_id", sa.String(length=64), nullable=False),
        sa.Column("error_message", sa.String(length=500), nullable=True),
        sa.Column("lead_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("deal_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("sent_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("occurred_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"]),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"]),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"]),
        sa.ForeignKeyConstraint(["deal_id"], ["deals.id"]),
        sa.ForeignKeyConstraint(["sent_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "message_id", name="uq_email_logs_tenant_message"),
    )
    op.create_index("ix_email_logs_tenant_id", "email_logs", ["tenant_id"], unique=False)
    op.create_index("ix_email_logs_tenant_contact", "email_logs", ["tenant_id", "contact_id"], unique=False)
    op.create_index("ix_email_logs_tenant_lead", "email_logs", ["tenant_id", "lead_id"], unique=False)
    op.create_index("ix_email_logs_tenant_deal", "email_logs", ["tenant_id", "deal_id"], unique=False)
    op.create_index("ix_email_logs_tenant_thread", "email_logs", ["tenant_id", "thread_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_email_logs_tenant_thread", table_name="email_logs")
    op.drop_index("ix_email_logs_tenant_deal", table_name="email_logs")
    op.drop_index("ix_email_logs_tenant_lead", table_name="email_logs")
    op.drop_index("ix_email_logs_tenant_contact", table_name="email_logs")
    op.drop_index("ix_email_logs_tenant_id", table_name="email_logs")
    op.drop_table("email_logs")

    op.drop_index("ix_custom_field_definitions_tenant_id", table_name="custom_field_definitions")
    op.drop_table("custom_field_definitions")

    op.drop_constraint("ck_pipeline_stages_probability_range", "pipeline_stages", type_="check")
    op.drop_column("pipeline_stages", "probability")

    for table in ("deals", "accounts", "contacts"):
        op.drop_column(table, "custom_fields")
        op.drop_index(f"ix_{table}_deleted_at", table_name=table)
        op.drop_constraint(f"fk_{table}_deleted_by_users", table, type_="foreignkey")
        op.drop_column(table, "deleted_by")
        op.drop_column(table, "deleted_at")

    op.drop_index("ix_leads_score_label", table_name="leads")
    op.drop_index("ix_leads_score", table_name="leads")
    op.drop_column("leads", "scored_at")
    op.drop_column("leads", "score_breakdown")
    op.drop_column("leads", "score_label")
    op.drop_column("leads", "engagement_score")
    op.drop_column("leads", "score")
    op.drop_column("leads", "custom_fields")
    op.drop_index("ix_leads_deleted_at", table_name="leads")
    op.drop_constraint("fk_leads_deleted_by_users", "leads", type_="foreignkey")
    op.drop_column("leads", "deleted_by")
    op.drop_column("leads", "deleted_at")
