"""add customer property shortlists

Revision ID: b201_customer_property_shortlists
Revises: a101_ai_conversations
Create Date: 2026-11-13
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "b201_cust_prop_shortlists"
down_revision: Union[str, Sequence[str], None] = "a101_ai_conversations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "customer_property_shortlists",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("portal_user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("buyer_requirement_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("property_match_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["portal_user_id"], ["customer_portal_users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["buyer_requirement_id"], ["buyer_requirements.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["property_match_id"], ["property_matches.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "portal_user_id", "buyer_requirement_id", "property_match_id", name="uq_customer_shortlist_portal_requirement_match"),
    )
    op.create_index(
        "ix_customer_shortlists_tenant_portal_requirement",
        "customer_property_shortlists",
        ["tenant_id", "portal_user_id", "buyer_requirement_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_customer_shortlists_tenant_portal_requirement", table_name="customer_property_shortlists")
    op.drop_table("customer_property_shortlists")
