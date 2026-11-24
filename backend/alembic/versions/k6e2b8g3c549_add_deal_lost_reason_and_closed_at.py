"""Add lost_reason and closed_at columns to deals table.

Revision ID: k6e2b8g3c549
Revises: j5d1a7f2b438
Create Date: 2026-11-24
"""
from alembic import op
import sqlalchemy as sa


revision = "k6e2b8g3c549"
down_revision = "j5d1a7f2b438"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("deals", sa.Column("lost_reason", sa.String(length=255), nullable=True))
    op.add_column("deals", sa.Column("closed_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("deals", "closed_at")
    op.drop_column("deals", "lost_reason")
