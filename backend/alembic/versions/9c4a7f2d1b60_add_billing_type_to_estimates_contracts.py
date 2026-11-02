"""add billing type and hourly rate to software estimates and contracts

Revision ID: 9c4a7f2d1b60
Revises: e8b2d5f61a47
Create Date: 2026-11-02
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "9c4a7f2d1b60"
down_revision: Union[str, Sequence[str], None] = "e8b2d5f61a47"
branch_labels = None
depends_on = None

def upgrade() -> None:
    op.add_column("software_estimates", sa.Column("billing_type", sa.String(length=30), nullable=False, server_default="Fixed Price"))
    op.add_column("software_estimates", sa.Column("hourly_rate", sa.Numeric(14, 2), nullable=True))
    op.add_column("software_contracts", sa.Column("billing_type", sa.String(length=30), nullable=False, server_default="Fixed Price"))
    op.add_column("software_contracts", sa.Column("hourly_rate", sa.Numeric(14, 2), nullable=True))

def downgrade() -> None:
    op.drop_column("software_contracts", "hourly_rate")
    op.drop_column("software_contracts", "billing_type")
    op.drop_column("software_estimates", "hourly_rate")
    op.drop_column("software_estimates", "billing_type")
