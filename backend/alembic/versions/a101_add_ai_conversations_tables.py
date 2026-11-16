"""add ai conversations and ai messages tables

Revision ID: a101_ai_conversations
Revises: f1a2b3c4d5e6
Create Date: 2026-11-12 14:15:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "a101_ai_conversations"
down_revision: Union[str, Sequence[str], None] = "f1a2b3c4d5e6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "ai_conversations",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("portal_user_id", sa.UUID(), nullable=False),
        sa.Column("account_id", sa.UUID(), nullable=False),
        sa.Column("contact_id", sa.UUID(), nullable=False),
        sa.Column("lead_id", sa.UUID(), nullable=True),
        sa.Column("industry_type", sa.String(length=30), nullable=False),
        sa.Column("model_tag", sa.String(length=80), server_default="llama3.2:1b", nullable=False),
        sa.Column("status", sa.String(length=30), server_default="Active", nullable=False),
        sa.Column(
            "extracted_data_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="{}",
            nullable=False,
        ),
        sa.Column(
            "missing_fields_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column(
            "unclear_fields_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("summary_text", sa.Text(), nullable=True),
        sa.Column("revision_number", sa.Integer(), server_default="1", nullable=False),
        sa.Column("confirmed_revision_number", sa.Integer(), nullable=True),
        sa.Column(
            "revision_history_json",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default="[]",
            nullable=False,
        ),
        sa.Column("buyer_requirement_id", sa.UUID(), nullable=True),
        sa.Column("software_requirement_id", sa.UUID(), nullable=True),
        sa.Column("confirmed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "industry_type IN ('real_estate', 'software')",
            name="ck_ai_conversations_industry_type",
        ),
        sa.CheckConstraint(
            "status IN ('Active', 'Ready_For_Confirmation', 'Confirmed', 'Revision_In_Progress', 'Closed')",
            name="ck_ai_conversations_status",
        ),
        sa.CheckConstraint(
            "revision_number >= 1",
            name="ck_ai_conversations_revision_positive",
        ),
        sa.ForeignKeyConstraint(["account_id"], ["accounts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["buyer_requirement_id"], ["buyer_requirements.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["contact_id"], ["contacts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["lead_id"], ["leads.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["portal_user_id"], ["customer_portal_users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["software_requirement_id"], ["software_requirements.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ai_conversations_tenant_portal_user",
        "ai_conversations",
        ["tenant_id", "portal_user_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_ai_conversations_tenant_status",
        "ai_conversations",
        ["tenant_id", "status"],
        unique=False,
    )
    op.create_index(
        "uq_ai_conversations_tenant_buyer_req",
        "ai_conversations",
        ["tenant_id", "buyer_requirement_id"],
        unique=True,
        postgresql_where=sa.text("buyer_requirement_id IS NOT NULL"),
    )
    op.create_index(
        "uq_ai_conversations_tenant_software_req",
        "ai_conversations",
        ["tenant_id", "software_requirement_id"],
        unique=True,
        postgresql_where=sa.text("software_requirement_id IS NOT NULL"),
    )

    op.create_table(
        "ai_messages",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("conversation_id", sa.UUID(), nullable=False),
        sa.Column("sender_role", sa.String(length=20), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column(
            "extracted_delta_json",
            postgresql.JSONB(astext_type=sa.Text()),
            nullable=True,
        ),
        sa.Column("model_tag", sa.String(length=80), nullable=True),
        sa.Column("latency_ms", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "sender_role IN ('user', 'assistant', 'system')",
            name="ck_ai_messages_sender_role",
        ),
        sa.ForeignKeyConstraint(["conversation_id"], ["ai_conversations.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_ai_messages_conversation_created",
        "ai_messages",
        ["conversation_id", "created_at"],
        unique=False,
    )
    op.create_index(
        "ix_ai_messages_tenant_conversation",
        "ai_messages",
        ["tenant_id", "conversation_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_ai_messages_tenant_conversation", table_name="ai_messages")
    op.drop_index("ix_ai_messages_conversation_created", table_name="ai_messages")
    op.drop_table("ai_messages")

    op.drop_index("uq_ai_conversations_tenant_software_req", table_name="ai_conversations")
    op.drop_index("uq_ai_conversations_tenant_buyer_req", table_name="ai_conversations")
    op.drop_index("ix_ai_conversations_tenant_status", table_name="ai_conversations")
    op.drop_index("ix_ai_conversations_tenant_portal_user", table_name="ai_conversations")
    op.drop_table("ai_conversations")
