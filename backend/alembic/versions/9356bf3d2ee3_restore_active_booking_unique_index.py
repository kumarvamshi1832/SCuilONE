from typing import Sequence, Union

from alembic import op


revision: str = '9356bf3d2ee3'
down_revision: Union[str, Sequence[str], None] = "a0e7a624b93b"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_index(
        "uq_bookings_one_active_per_property",
        "bookings",
        ["tenant_id", "property_id"],
        unique=True,
        postgresql_where=(
            "status IN ('Pending', 'Confirmed')"
        ),
    )


def downgrade() -> None:
    op.drop_index(
        "uq_bookings_one_active_per_property",
        table_name="bookings",
    )