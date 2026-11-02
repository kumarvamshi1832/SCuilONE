"""record customer payment reminders that were sent

Revision ID: e8b2d5f61a47
Revises: d4e7b3a91c58
Create Date: 2026-11-05
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "e8b2d5f61a47"
down_revision: Union[str, Sequence[str], None] = "d4e7b3a91c58"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "software_invoice_reminders",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("kind", sa.String(length=30), nullable=False),
        sa.Column("recipient_email", sa.String(length=254), nullable=False),
        sa.Column("sent_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["invoice_id"], ["software_invoices.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("invoice_id", "kind", name="uq_software_invoice_reminders_invoice_kind"),
    )
    op.create_index(
        "ix_software_invoice_reminders_tenant_invoice",
        "software_invoice_reminders",
        ["tenant_id", "invoice_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_software_invoice_reminders_tenant_invoice", table_name="software_invoice_reminders")
    op.drop_table("software_invoice_reminders")
