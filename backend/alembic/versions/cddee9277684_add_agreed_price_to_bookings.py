
"""add agreed price to bookings

Revision ID: cddee9277684
Revises: 9356bf3d2ee3
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "cddee9277684"
down_revision: Union[str, Sequence[str], None] = "9356bf3d2ee3"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bookings",
        sa.Column("agreed_price", sa.Numeric(14, 2), nullable=True),
    )

    op.execute(
        """
        UPDATE bookings AS b
        SET agreed_price = p.price
        FROM properties AS p
        WHERE p.id = b.property_id
          AND p.tenant_id = b.tenant_id
        """
    )

    op.alter_column(
        "bookings",
        "agreed_price",
        existing_type=sa.Numeric(14, 2),
        nullable=False,
    )


def downgrade() -> None:
    op.drop_column("bookings", "agreed_price")
