"""add platform super admin and industry teams

Revision ID: a1b2c3d4e5f6
Revises: f6a3d9b25e81
Create Date: 2026-11-04 12:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


# revision identifiers, used by Alembic.
revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, Sequence[str], None] = "f6a3d9b25e81"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "tenants",
        sa.Column("status", sa.String(length=30), server_default="Active", nullable=False),
    )
    op.add_column(
        "tenants",
        sa.Column("is_platform", sa.Boolean(), server_default="false", nullable=False),
    )

    op.create_table(
        "platform_industry_teams",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("industry_key", sa.String(length=80), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("description", sa.Text(), server_default="", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("max_members", sa.Integer(), server_default="7", nullable=False),
        sa.Column("manager_user_id", sa.UUID(), nullable=True),
        sa.Column("team_admin_user_id", sa.UUID(), nullable=True),
        sa.Column("sla_response_minutes", sa.Integer(), server_default="60", nullable=False),
        sa.Column("sla_resolution_hours", sa.Integer(), server_default="24", nullable=False),
        sa.Column("allocated_budget", sa.Numeric(precision=14, scale=2), server_default="0.00", nullable=False),
        sa.Column("spent_budget", sa.Numeric(precision=14, scale=2), server_default="0.00", nullable=False),
        sa.Column("config_json", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["manager_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["team_admin_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("industry_key"),
    )
    op.create_index("ix_platform_industry_teams_industry_key", "platform_industry_teams", ["industry_key"], unique=True)

    op.create_table(
        "platform_employees",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("employee_code", sa.String(length=40), nullable=False),
        sa.Column("role_scope", sa.String(length=30), server_default="platform", nullable=False),
        sa.Column("role_name", sa.String(length=100), nullable=False),
        sa.Column("industry_key", sa.String(length=80), nullable=True),
        sa.Column("industry_team_id", sa.UUID(), nullable=True),
        sa.Column("manager_user_id", sa.UUID(), nullable=True),
        sa.Column("department", sa.String(length=100), nullable=True),
        sa.Column("availability_status", sa.String(length=30), server_default="Available", nullable=False),
        sa.Column("max_ticket_load", sa.Integer(), server_default="25", nullable=False),
        sa.Column("is_platform_owner", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["industry_team_id"], ["platform_industry_teams.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["manager_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_code"),
        sa.UniqueConstraint("user_id"),
    )
    op.create_index("ix_platform_employees_industry_key", "platform_employees", ["industry_key"], unique=False)
    op.create_index("ix_platform_employees_scope_role", "platform_employees", ["role_scope", "role_name"], unique=False)
    op.create_index("ix_platform_employees_team_id", "platform_employees", ["industry_team_id"], unique=False)

    op.create_table(
        "platform_subscription_plans",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("plan_key", sa.String(length=60), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.Text(), server_default="", nullable=False),
        sa.Column("billing_cycle", sa.String(length=30), server_default="Monthly", nullable=False),
        sa.Column("price", sa.Numeric(precision=12, scale=2), server_default="0.00", nullable=False),
        sa.Column("currency", sa.String(length=10), server_default="INR", nullable=False),
        sa.Column("trial_days", sa.Integer(), server_default="14", nullable=False),
        sa.Column("max_users", sa.Integer(), server_default="10", nullable=False),
        sa.Column("max_branches", sa.Integer(), server_default="1", nullable=False),
        sa.Column("storage_limit_gb", sa.Integer(), server_default="10", nullable=False),
        sa.Column("features_json", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("limits_json", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("is_active", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
        sa.UniqueConstraint("plan_key"),
    )

    op.create_table(
        "platform_tenant_subscriptions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("plan_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="Active", nullable=False),
        sa.Column("billing_cycle", sa.String(length=30), server_default="Monthly", nullable=False),
        sa.Column("auto_renew", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("starts_at", sa.DateTime(), nullable=False),
        sa.Column("ends_at", sa.DateTime(), nullable=True),
        sa.Column("renewal_date", sa.Date(), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(), nullable=True),
        sa.Column("usage_json", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["platform_subscription_plans.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_platform_tenant_subs_status", "platform_tenant_subscriptions", ["status"], unique=False)
    op.create_index("ix_platform_tenant_subs_tenant", "platform_tenant_subscriptions", ["tenant_id"], unique=False)

    op.create_table(
        "platform_billing_invoices",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("invoice_number", sa.String(length=50), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("subscription_id", sa.UUID(), nullable=True),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), server_default="0.00", nullable=False),
        sa.Column("tax_amount", sa.Numeric(precision=12, scale=2), server_default="0.00", nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=12, scale=2), server_default="0.00", nullable=False),
        sa.Column("paid_amount", sa.Numeric(precision=12, scale=2), server_default="0.00", nullable=False),
        sa.Column("currency", sa.String(length=10), server_default="INR", nullable=False),
        sa.Column("status", sa.String(length=30), server_default="Issued", nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("paid_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["subscription_id"], ["platform_tenant_subscriptions.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("invoice_number"),
    )
    op.create_index("ix_platform_billing_invoices_status", "platform_billing_invoices", ["status"], unique=False)
    op.create_index("ix_platform_billing_invoices_tenant", "platform_billing_invoices", ["tenant_id"], unique=False)

    op.create_table(
        "platform_billing_payments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("invoice_id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("provider", sa.String(length=60), server_default="Razorpay", nullable=False),
        sa.Column("transaction_reference", sa.String(length=120), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=10), server_default="INR", nullable=False),
        sa.Column("payment_method", sa.String(length=50), server_default="Card", nullable=False),
        sa.Column("status", sa.String(length=30), server_default="Succeeded", nullable=False),
        sa.Column("failure_reason", sa.Text(), nullable=True),
        sa.Column("retry_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("next_retry_at", sa.DateTime(), nullable=True),
        sa.Column("reconciled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("reconciled_by", sa.UUID(), nullable=True),
        sa.Column("reconciled_at", sa.DateTime(), nullable=True),
        sa.Column("paid_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["invoice_id"], ["platform_billing_invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["reconciled_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("transaction_reference"),
    )

    op.create_table(
        "platform_refund_requests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("invoice_id", sa.UUID(), nullable=False),
        sa.Column("payment_id", sa.UUID(), nullable=True),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=10), server_default="INR", nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="Pending", nullable=False),
        sa.Column("requested_by", sa.UUID(), nullable=True),
        sa.Column("approved_by", sa.UUID(), nullable=True),
        sa.Column("resolution_notes", sa.Text(), nullable=True),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["invoice_id"], ["platform_billing_invoices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["payment_id"], ["platform_billing_payments.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_table(
        "platform_expenses",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("expense_number", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=180), nullable=False),
        sa.Column("category", sa.String(length=80), server_default="Operations", nullable=False),
        sa.Column("industry_key", sa.String(length=80), nullable=True),
        sa.Column("industry_team_id", sa.UUID(), nullable=True),
        sa.Column("amount", sa.Numeric(precision=12, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=10), server_default="INR", nullable=False),
        sa.Column("expense_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=30), server_default="Pending", nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("requested_by", sa.UUID(), nullable=True),
        sa.Column("approved_by", sa.UUID(), nullable=True),
        sa.Column("approved_at", sa.DateTime(), nullable=True),
        sa.Column("reconciled", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["approved_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["industry_team_id"], ["platform_industry_teams.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["requested_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("expense_number"),
    )
    op.create_index(
        "ix_platform_expenses_industry_status",
        "platform_expenses",
        ["industry_key", "status"],
        unique=False,
    )

    op.create_table(
        "platform_sales_prospects",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("company_name", sa.String(length=180), nullable=False),
        sa.Column("contact_name", sa.String(length=150), nullable=False),
        sa.Column("contact_email", sa.String(length=255), nullable=False),
        sa.Column("contact_phone", sa.String(length=30), nullable=True),
        sa.Column("industry_key", sa.String(length=80), nullable=False),
        sa.Column("lead_status", sa.String(length=30), server_default="New", nullable=False),
        sa.Column("pipeline_stage", sa.String(length=30), server_default="New", nullable=False),
        sa.Column("interest_level", sa.String(length=20), server_default="Medium", nullable=False),
        sa.Column("estimated_mrr", sa.Numeric(precision=12, scale=2), server_default="0.00", nullable=False),
        sa.Column("recommended_plan", sa.String(length=60), nullable=True),
        sa.Column("assigned_to", sa.UUID(), nullable=True),
        sa.Column("demo_scheduled_at", sa.DateTime(), nullable=True),
        sa.Column("demo_outcome", sa.Text(), nullable=True),
        sa.Column("next_follow_up_at", sa.DateTime(), nullable=True),
        sa.Column("onboarding_status", sa.String(length=40), server_default="Not Started", nullable=False),
        sa.Column("converted_tenant_id", sa.UUID(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["assigned_to"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["converted_tenant_id"], ["tenants.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_platform_sales_prospects_industry_key", "platform_sales_prospects", ["industry_key"], unique=False)
    op.create_index(
        "ix_platform_sales_industry_stage",
        "platform_sales_prospects",
        ["industry_key", "pipeline_stage"],
        unique=False,
    )

    op.create_table(
        "platform_support_ticket_meta",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("ticket_id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("industry_key", sa.String(length=80), nullable=False),
        sa.Column("industry_team_id", sa.UUID(), nullable=True),
        sa.Column("issue_type", sa.String(length=40), server_default="Support", nullable=False),
        sa.Column("routing_queue", sa.String(length=50), server_default="Industry Support", nullable=False),
        sa.Column("assigned_employee_user_id", sa.UUID(), nullable=True),
        sa.Column("is_escalated", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("escalation_target", sa.String(length=50), nullable=True),
        sa.Column("escalation_reason", sa.Text(), nullable=True),
        sa.Column("escalated_by", sa.UUID(), nullable=True),
        sa.Column("escalated_at", sa.DateTime(), nullable=True),
        sa.Column("sla_response_due_at", sa.DateTime(), nullable=True),
        sa.Column("sla_resolution_due_at", sa.DateTime(), nullable=True),
        sa.Column("first_responded_at", sa.DateTime(), nullable=True),
        sa.Column("sla_breached", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("audit_reviewed", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("audit_review_notes", sa.Text(), nullable=True),
        sa.Column("audit_reviewed_by", sa.UUID(), nullable=True),
        sa.Column("history_json", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["assigned_employee_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["audit_reviewed_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["escalated_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["industry_team_id"], ["platform_industry_teams.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["ticket_id"], ["support_tickets.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ticket_id"),
    )
    op.create_index("ix_platform_support_ticket_meta_industry_key", "platform_support_ticket_meta", ["industry_key"], unique=False)
    op.create_index(
        "ix_platform_ticket_meta_escalated",
        "platform_support_ticket_meta",
        ["is_escalated", "escalation_target"],
        unique=False,
    )
    op.create_index(
        "ix_platform_ticket_meta_industry_queue",
        "platform_support_ticket_meta",
        ["industry_key", "routing_queue"],
        unique=False,
    )

    op.create_table(
        "platform_knowledge_articles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("slug", sa.String(length=160), nullable=False),
        sa.Column("title", sa.String(length=220), nullable=False),
        sa.Column("category", sa.String(length=80), server_default="Troubleshooting", nullable=False),
        sa.Column("industry_key", sa.String(length=80), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("tags_json", postgresql.JSONB(astext_type=sa.Text()), server_default="[]", nullable=False),
        sa.Column("is_published", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("author_id", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("slug"),
    )
    op.create_index("ix_platform_knowledge_articles_industry_key", "platform_knowledge_articles", ["industry_key"], unique=False)

    op.create_table(
        "platform_technical_incidents",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("incident_number", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("incident_type", sa.String(length=40), server_default="Incident", nullable=False),
        sa.Column("service_name", sa.String(length=80), server_default="API Gateway", nullable=False),
        sa.Column("severity", sa.String(length=20), server_default="Medium", nullable=False),
        sa.Column("status", sa.String(length=30), server_default="Investigating", nullable=False),
        sa.Column("version_tag", sa.String(length=40), nullable=True),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("recovery_actions", sa.Text(), nullable=True),
        sa.Column("owner_user_id", sa.UUID(), nullable=True),
        sa.Column("related_ticket_id", sa.UUID(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["owner_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["related_ticket_id"], ["support_tickets.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("incident_number"),
    )

    op.create_table(
        "platform_security_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("event_type", sa.String(length=50), nullable=False),
        sa.Column("severity", sa.String(length=20), server_default="Info", nullable=False),
        sa.Column("status", sa.String(length=30), server_default="Open", nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("ip_address", sa.String(length=64), nullable=True),
        sa.Column("industry_key", sa.String(length=80), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), server_default="", nullable=False),
        sa.Column("remediation_steps", sa.Text(), nullable=True),
        sa.Column("metadata_json", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_platform_sec_events_type_created",
        "platform_security_events",
        ["event_type", "created_at"],
        unique=False,
    )

    op.create_table(
        "platform_settings",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("setting_key", sa.String(length=100), nullable=False),
        sa.Column("category", sa.String(length=60), server_default="General", nullable=False),
        sa.Column("value_json", postgresql.JSONB(astext_type=sa.Text()), server_default="{}", nullable=False),
        sa.Column("description", sa.String(length=255), server_default="", nullable=False),
        sa.Column("updated_by", sa.UUID(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["updated_by"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("setting_key"),
    )


def downgrade() -> None:
    op.drop_table("platform_settings")
    op.drop_index("ix_platform_sec_events_type_created", table_name="platform_security_events")
    op.drop_table("platform_security_events")
    op.drop_table("platform_technical_incidents")
    op.drop_index("ix_platform_knowledge_articles_industry_key", table_name="platform_knowledge_articles")
    op.drop_table("platform_knowledge_articles")
    op.drop_index("ix_platform_ticket_meta_industry_queue", table_name="platform_support_ticket_meta")
    op.drop_index("ix_platform_ticket_meta_escalated", table_name="platform_support_ticket_meta")
    op.drop_index("ix_platform_support_ticket_meta_industry_key", table_name="platform_support_ticket_meta")
    op.drop_table("platform_support_ticket_meta")
    op.drop_index("ix_platform_sales_industry_stage", table_name="platform_sales_prospects")
    op.drop_index("ix_platform_sales_prospects_industry_key", table_name="platform_sales_prospects")
    op.drop_table("platform_sales_prospects")
    op.drop_index("ix_platform_expenses_industry_status", table_name="platform_expenses")
    op.drop_table("platform_expenses")
    op.drop_table("platform_refund_requests")
    op.drop_table("platform_billing_payments")
    op.drop_index("ix_platform_billing_invoices_tenant", table_name="platform_billing_invoices")
    op.drop_index("ix_platform_billing_invoices_status", table_name="platform_billing_invoices")
    op.drop_table("platform_billing_invoices")
    op.drop_index("ix_platform_tenant_subs_tenant", table_name="platform_tenant_subscriptions")
    op.drop_index("ix_platform_tenant_subs_status", table_name="platform_tenant_subscriptions")
    op.drop_table("platform_tenant_subscriptions")
    op.drop_table("platform_subscription_plans")
    op.drop_index("ix_platform_employees_team_id", table_name="platform_employees")
    op.drop_index("ix_platform_employees_scope_role", table_name="platform_employees")
    op.drop_index("ix_platform_employees_industry_key", table_name="platform_employees")
    op.drop_table("platform_employees")
    op.drop_index("ix_platform_industry_teams_industry_key", table_name="platform_industry_teams")
    op.drop_table("platform_industry_teams")
    op.drop_column("tenants", "is_platform")
    op.drop_column("tenants", "status")
