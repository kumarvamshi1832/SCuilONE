"""add software contract payment milestones

Revision ID: f2a8c6d91e40
Revises: d1f4a9c82b71
Create Date: 2026-10-30
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f2a8c6d91e40"
down_revision: Union[str, Sequence[str], None] = "d1f4a9c82b71"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "software_contract_milestones",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("contract_id", sa.UUID(), nullable=False),
        sa.Column("invoice_id", sa.UUID(), nullable=True),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("percentage", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("trigger_description", sa.Text(), nullable=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="Pending"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("percentage > 0 AND percentage <= 100", name="ck_software_contract_milestones_percentage"),
        sa.CheckConstraint("amount > 0", name="ck_software_contract_milestones_amount"),
        sa.CheckConstraint("status IN ('Pending', 'Ready', 'Invoiced', 'Paid')", name="ck_software_contract_milestones_status"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["contract_id"], ["software_contracts.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["invoice_id"], ["software_invoices.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "contract_id", "sequence", name="uq_software_contract_milestones_sequence"),
        sa.UniqueConstraint("invoice_id", name="uq_software_contract_milestones_invoice"),
    )
    op.create_index(
        "ix_software_contract_milestones_tenant_contract",
        "software_contract_milestones", ["tenant_id", "contract_id"], unique=False,
    )


def downgrade() -> None:
    op.drop_index("ix_software_contract_milestones_tenant_contract", table_name="software_contract_milestones")
    op.drop_table("software_contract_milestones")
