"""add industry to tenants

Revision ID: 2c77b551f1bd
Revises: de27fe3353a0
Create Date: 2026-09-28 12:39:10.405604

"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '2c77b551f1bd'
down_revision: Union[str, Sequence[str], None] = 'de27fe3353a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:

    op.add_column(
        'tenants',
        sa.Column(
            'industry',
            sa.String(length=100),
            nullable=True
        )
    )

    op.execute(
        "UPDATE tenants SET industry = 'Software' WHERE industry IS NULL"
    )

    op.alter_column(
        'tenants',
        'industry',
        nullable=False
    )


def downgrade() -> None:

    op.drop_column(
        'tenants',
        'industry'
    )