"""add unique active booking constraint

Revision ID: ee521a5e850e
Revises: 290402f76494
Create Date: 2026-10-25 16:34:50.304452

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ee521a5e850e'
down_revision: Union[str, Sequence[str], None] = '290402f76494'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "uq_bookings_one_active_per_property",
        "bookings",
        ["tenant_id", "property_id"],
        unique=True,
        postgresql_where=sa.text(
            "status IN ('Pending', 'Confirmed')"
        ),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_bookings_one_active_per_property",
        table_name="bookings",
    )
