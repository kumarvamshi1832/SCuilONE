
"""Fix booking payment preference values and constraint."""

from typing import Sequence, Union

from alembic import op


revision: str = "f8c41a2d7b90"
down_revision: Union[str, Sequence[str], None] = "447fe8cda088"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        UPDATE bookings
        SET payment_preference = 'Full Payment'
        WHERE payment_preference IS NULL
           OR payment_preference NOT IN (
               'Full Payment',
               'Installments'
           )
        """
    )

    op.create_check_constraint(
        "ck_bookings_payment_preference_valid",
        "bookings",
        "payment_preference IN ('Full Payment', 'Installments')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_bookings_payment_preference_valid",
        "bookings",
        type_="check",
    )
