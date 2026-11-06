"""add documents.shared_with_customer (opt-in portal sharing)

Revision ID: c8d2f4a6b9e1
Revises: b7e9d4c31f20
Create Date: 2026-11-05 12:00:00.000000

Existing documents default to NOT shared, so nothing becomes visible in the
customer portal until staff explicitly opts a document in.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "c8d2f4a6b9e1"
down_revision: Union[str, Sequence[str], None] = "b7e9d4c31f20"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "documents",
        sa.Column("shared_with_customer", sa.Boolean(), server_default=sa.false(), nullable=False),
    )


def downgrade() -> None:
    op.drop_column("documents", "shared_with_customer")
