"""add subscription lifecycle, manual payment verification, and email reminder campaigns

Revision ID: b4c8d2e6f1a9
Revises: e7a1c3b5d9f4
Create Date: 2026-11-09 10:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "b4c8d2e6f1a9"
down_revision: Union[str, Sequence[str], None] = "e7a1c3b5d9f4"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Extend tenants table with billing and trial/reminder metadata
    op.add_column("tenants", sa.Column("billing_email", sa.String(length=255), nullable=True))
    op.add_column("tenants", sa.Column("billing_phone", sa.String(length=30), nullable=True))
    op.add_column("tenants", sa.Column("billing_address", sa.Text(), nullable=True))
    op.add_column("tenants", sa.Column("gst_number", sa.String(length=40), nullable=True))
    op.add_column(
        "tenants",
        sa.Column("trial_used", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "tenants",
        sa.Column("email_reminders_opt_out", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column("tenants", sa.Column("unsubscribe_token", sa.String(length=120), nullable=True))
    op.create_unique_constraint("uq_tenants_unsubscribe_token", "tenants", ["unsubscribe_token"])

    # 2. Extend platform_subscription_plans table
    op.add_column(
        "platform_subscription_plans",
        sa.Column("annual_price", sa.Numeric(precision=12, scale=2), nullable=True),
    )
    op.add_column(
        "platform_subscription_plans",
        sa.Column(
            "enabled_modules_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
    )

    # 3. Extend platform_tenant_subscriptions table
    op.add_column(
        "platform_tenant_subscriptions",
        sa.Column("selected_plan_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "platform_tenant_subscriptions",
        sa.Column("selected_billing_cycle", sa.String(length=30), nullable=True),
    )
    op.add_column(
        "platform_tenant_subscriptions",
        sa.Column("trial_start_date", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "platform_tenant_subscriptions",
        sa.Column("trial_end_date", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "platform_tenant_subscriptions",
        sa.Column("grace_period_ends_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "platform_tenant_subscriptions",
        sa.Column("suspended_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "platform_tenant_subscriptions",
        sa.Column("suspension_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "platform_tenant_subscriptions",
        sa.Column("expired_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "platform_tenant_subscriptions",
        sa.Column("activated_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "platform_tenant_subscriptions",
        sa.Column("activated_by", sa.UUID(), nullable=True),
    )
    op.add_column(
        "platform_tenant_subscriptions",
        sa.Column("is_complimentary", sa.Boolean(), server_default="false", nullable=False),
    )
    op.add_column(
        "platform_tenant_subscriptions",
        sa.Column(
            "applied_limits_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
    )
    op.create_foreign_key(
        "fk_platform_tenant_subs_selected_plan",
        "platform_tenant_subscriptions",
        "platform_subscription_plans",
        ["selected_plan_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_platform_tenant_subs_activated_by",
        "platform_tenant_subscriptions",
        "users",
        ["activated_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_platform_tenant_subs_renewal_date",
        "platform_tenant_subscriptions",
        ["renewal_date"],
        unique=False,
    )
    op.create_index(
        "ix_platform_tenant_subs_trial_end",
        "platform_tenant_subscriptions",
        ["trial_end_date"],
        unique=False,
    )

    # 4. Extend platform_billing_invoices table
    op.add_column(
        "platform_billing_invoices",
        sa.Column("plan_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "platform_billing_invoices",
        sa.Column("billing_cycle", sa.String(length=30), server_default="Monthly", nullable=False),
    )
    op.add_column(
        "platform_billing_invoices",
        sa.Column("invoice_type", sa.String(length=30), server_default="Subscription", nullable=False),
    )
    op.add_column(
        "platform_billing_invoices",
        sa.Column("billing_period_start", sa.Date(), nullable=True),
    )
    op.add_column(
        "platform_billing_invoices",
        sa.Column("billing_period_end", sa.Date(), nullable=True),
    )
    op.add_column(
        "platform_billing_invoices",
        sa.Column(
            "plan_snapshot_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
    )
    op.add_column(
        "platform_billing_invoices",
        sa.Column(
            "payment_instructions_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
    )
    op.create_foreign_key(
        "fk_platform_billing_invoices_plan",
        "platform_billing_invoices",
        "platform_subscription_plans",
        ["plan_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_platform_billing_invoices_sub",
        "platform_billing_invoices",
        ["subscription_id"],
        unique=False,
    )

    # 5. Extend platform_billing_payments table for manual payment verification
    op.add_column(
        "platform_billing_payments",
        sa.Column("payment_date", sa.Date(), nullable=True),
    )
    op.add_column(
        "platform_billing_payments",
        sa.Column("payment_proof_url", sa.Text(), nullable=True),
    )
    op.add_column(
        "platform_billing_payments",
        sa.Column("payment_proof_filename", sa.String(length=255), nullable=True),
    )
    op.add_column(
        "platform_billing_payments",
        sa.Column("submitted_by", sa.UUID(), nullable=True),
    )
    op.add_column(
        "platform_billing_payments",
        sa.Column("payment_submitted_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "platform_billing_payments",
        sa.Column("approved_by", sa.UUID(), nullable=True),
    )
    op.add_column(
        "platform_billing_payments",
        sa.Column("payment_approved_at", sa.DateTime(timezone=True), nullable=True),
    )
    op.add_column(
        "platform_billing_payments",
        sa.Column("rejection_reason", sa.Text(), nullable=True),
    )
    op.add_column(
        "platform_billing_payments",
        sa.Column("admin_notes", sa.Text(), nullable=True),
    )
    op.add_column(
        "platform_billing_payments",
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
    )
    op.create_foreign_key(
        "fk_platform_billing_payments_submitted_by",
        "platform_billing_payments",
        "users",
        ["submitted_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_platform_billing_payments_approved_by",
        "platform_billing_payments",
        "users",
        ["approved_by"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_platform_billing_payments_tenant",
        "platform_billing_payments",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_platform_billing_payments_invoice",
        "platform_billing_payments",
        ["invoice_id"],
        unique=False,
    )
    op.create_index(
        "ix_platform_billing_payments_status",
        "platform_billing_payments",
        ["status"],
        unique=False,
    )

    # 6. Create platform_subscription_reminder_campaigns table
    op.create_table(
        "platform_subscription_reminder_campaigns",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("subscription_id", sa.UUID(), nullable=True),
        sa.Column("campaign_status", sa.String(length=30), server_default="Trial_Active", nullable=False),
        sa.Column("trial_end_date", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trial_day_12_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trial_day_13_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("trial_day_14_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("post_trial_day_1_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("post_trial_day_3_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("post_trial_day_7_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("post_trial_day_14_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("post_trial_day_21_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("post_trial_day_30_sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_error", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("next_retry_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stopped_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("stopped_reason", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["subscription_id"], ["platform_tenant_subscriptions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id"),
    )
    op.create_index(
        "ix_platform_subscription_reminder_campaigns_tenant_id",
        "platform_subscription_reminder_campaigns",
        ["tenant_id"],
        unique=True,
    )
    op.create_index(
        "ix_platform_sub_reminder_camp_status",
        "platform_subscription_reminder_campaigns",
        ["campaign_status"],
        unique=False,
    )

    # 7. Create platform_subscription_reminder_logs table
    op.create_table(
        "platform_subscription_reminder_logs",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("subscription_id", sa.UUID(), nullable=False),
        sa.Column("campaign_id", sa.UUID(), nullable=True),
        sa.Column("reminder_key", sa.String(length=50), nullable=False),
        sa.Column("subject", sa.String(length=255), nullable=False),
        sa.Column("recipient_email", sa.String(length=255), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="Sent", nullable=False),
        sa.Column("attempt_count", sa.Integer(), server_default="1", nullable=False),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(
            ["campaign_id"],
            ["platform_subscription_reminder_campaigns.id"],
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(["subscription_id"], ["platform_tenant_subscriptions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("subscription_id", "reminder_key", name="uq_platform_sub_reminder_sub_key"),
    )
    op.create_index(
        "ix_platform_sub_reminder_logs_tenant",
        "platform_subscription_reminder_logs",
        ["tenant_id"],
        unique=False,
    )

    # 8. Create platform_subscription_events table
    op.create_table(
        "platform_subscription_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("subscription_id", sa.UUID(), nullable=True),
        sa.Column("invoice_id", sa.UUID(), nullable=True),
        sa.Column("payment_id", sa.UUID(), nullable=True),
        sa.Column("actor_user_id", sa.UUID(), nullable=True),
        sa.Column("event_type", sa.String(length=60), nullable=False),
        sa.Column("previous_status", sa.String(length=30), nullable=True),
        sa.Column("new_status", sa.String(length=30), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["actor_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["invoice_id"], ["platform_billing_invoices.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["payment_id"], ["platform_billing_payments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["subscription_id"], ["platform_tenant_subscriptions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_platform_sub_events_tenant",
        "platform_subscription_events",
        ["tenant_id"],
        unique=False,
    )
    op.create_index(
        "ix_platform_sub_events_sub",
        "platform_subscription_events",
        ["subscription_id"],
        unique=False,
    )
    op.create_index(
        "ix_platform_sub_events_type",
        "platform_subscription_events",
        ["event_type"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_platform_sub_events_type", table_name="platform_subscription_events")
    op.drop_index("ix_platform_sub_events_sub", table_name="platform_subscription_events")
    op.drop_index("ix_platform_sub_events_tenant", table_name="platform_subscription_events")
    op.drop_table("platform_subscription_events")

    op.drop_index("ix_platform_sub_reminder_logs_tenant", table_name="platform_subscription_reminder_logs")
    op.drop_table("platform_subscription_reminder_logs")

    op.drop_index("ix_platform_sub_reminder_camp_status", table_name="platform_subscription_reminder_campaigns")
    op.drop_index(
        "ix_platform_subscription_reminder_campaigns_tenant_id",
        table_name="platform_subscription_reminder_campaigns",
    )
    op.drop_table("platform_subscription_reminder_campaigns")

    op.drop_index("ix_platform_billing_payments_status", table_name="platform_billing_payments")
    op.drop_index("ix_platform_billing_payments_invoice", table_name="platform_billing_payments")
    op.drop_index("ix_platform_billing_payments_tenant", table_name="platform_billing_payments")
    op.drop_constraint("fk_platform_billing_payments_approved_by", "platform_billing_payments", type_="foreignkey")
    op.drop_constraint("fk_platform_billing_payments_submitted_by", "platform_billing_payments", type_="foreignkey")
    op.drop_column("platform_billing_payments", "updated_at")
    op.drop_column("platform_billing_payments", "admin_notes")
    op.drop_column("platform_billing_payments", "rejection_reason")
    op.drop_column("platform_billing_payments", "payment_approved_at")
    op.drop_column("platform_billing_payments", "approved_by")
    op.drop_column("platform_billing_payments", "payment_submitted_at")
    op.drop_column("platform_billing_payments", "submitted_by")
    op.drop_column("platform_billing_payments", "payment_proof_filename")
    op.drop_column("platform_billing_payments", "payment_proof_url")
    op.drop_column("platform_billing_payments", "payment_date")

    op.drop_index("ix_platform_billing_invoices_sub", table_name="platform_billing_invoices")
    op.drop_constraint("fk_platform_billing_invoices_plan", "platform_billing_invoices", type_="foreignkey")
    op.drop_column("platform_billing_invoices", "payment_instructions_json")
    op.drop_column("platform_billing_invoices", "plan_snapshot_json")
    op.drop_column("platform_billing_invoices", "billing_period_end")
    op.drop_column("platform_billing_invoices", "billing_period_start")
    op.drop_column("platform_billing_invoices", "invoice_type")
    op.drop_column("platform_billing_invoices", "billing_cycle")
    op.drop_column("platform_billing_invoices", "plan_id")

    op.drop_index("ix_platform_tenant_subs_trial_end", table_name="platform_tenant_subscriptions")
    op.drop_index("ix_platform_tenant_subs_renewal_date", table_name="platform_tenant_subscriptions")
    op.drop_constraint("fk_platform_tenant_subs_activated_by", "platform_tenant_subscriptions", type_="foreignkey")
    op.drop_constraint("fk_platform_tenant_subs_selected_plan", "platform_tenant_subscriptions", type_="foreignkey")
    op.drop_column("platform_tenant_subscriptions", "applied_limits_json")
    op.drop_column("platform_tenant_subscriptions", "is_complimentary")
    op.drop_column("platform_tenant_subscriptions", "activated_by")
    op.drop_column("platform_tenant_subscriptions", "activated_at")
    op.drop_column("platform_tenant_subscriptions", "expired_at")
    op.drop_column("platform_tenant_subscriptions", "suspension_reason")
    op.drop_column("platform_tenant_subscriptions", "suspended_at")
    op.drop_column("platform_tenant_subscriptions", "grace_period_ends_at")
    op.drop_column("platform_tenant_subscriptions", "trial_end_date")
    op.drop_column("platform_tenant_subscriptions", "trial_start_date")
    op.drop_column("platform_tenant_subscriptions", "selected_billing_cycle")
    op.drop_column("platform_tenant_subscriptions", "selected_plan_id")

    op.drop_column("platform_subscription_plans", "enabled_modules_json")
    op.drop_column("platform_subscription_plans", "annual_price")

    op.drop_constraint("uq_tenants_unsubscribe_token", "tenants", type_="unique")
    op.drop_column("tenants", "unsubscribe_token")
    op.drop_column("tenants", "email_reminders_opt_out")
    op.drop_column("tenants", "trial_used")
    op.drop_column("tenants", "gst_number")
    op.drop_column("tenants", "billing_address")
    op.drop_column("tenants", "billing_phone")
    op.drop_column("tenants", "billing_email")
