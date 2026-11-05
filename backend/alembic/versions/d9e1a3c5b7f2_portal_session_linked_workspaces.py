"""add customer_portal_sessions.linked_workspaces (workspace switching)

Revision ID: d9e1a3c5b7f2
Revises: c8d2f4a6b9e1
Create Date: 2026-11-05 13:00:00.000000
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d9e1a3c5b7f2"
down_revision: Union[str, Sequence[str], None] = "c8d2f4a6b9e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column("customer_portal_sessions", sa.Column("linked_workspaces", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("customer_portal_sessions", "linked_workspaces")
