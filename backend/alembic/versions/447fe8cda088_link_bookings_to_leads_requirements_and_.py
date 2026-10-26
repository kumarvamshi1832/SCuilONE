
"""link bookings to leads requirements and deals

Revision ID: 447fe8cda088
Revises: e9b3023c74c6
Create Date: 2026-10-26 14:11:32.589114
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "447fe8cda088"
down_revision: Union[str, Sequence[str], None] = "e9b3023c74c6"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "bookings",
        sa.Column("lead_id", sa.UUID(), nullable=True),
    )
    op.add_column(
        "bookings",
        sa.Column("buyer_requirement_id", sa.UUID(), nullable=True),
    )

    op.create_index(
        "ix_bookings_lead_id",
        "bookings",
        ["lead_id"],
        unique=False,
    )
    op.create_index(
        "ix_bookings_buyer_requirement_id",
        "bookings",
        ["buyer_requirement_id"],
        unique=False,
    )

    op.create_foreign_key(
        "fk_bookings_lead_id_leads",
        "bookings",
        "leads",
        ["lead_id"],
        ["id"],
    )
    op.create_foreign_key(
        "fk_bookings_buyer_requirement_id_buyer_requirements",
        "bookings",
        "buyer_requirements",
        ["buyer_requirement_id"],
        ["id"],
    )

    op.add_column(
        "deals",
        sa.Column("booking_id", sa.UUID(), nullable=True),
    )

    op.create_index(
        "ix_deals_booking_id",
        "deals",
        ["booking_id"],
        unique=False,
    )

    op.create_foreign_key(
        "fk_deals_booking_id_bookings",
        "deals",
        "bookings",
        ["booking_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_deals_booking_id_bookings",
        "deals",
        type_="foreignkey",
    )
    op.drop_index("ix_deals_booking_id", table_name="deals")
    op.drop_column("deals", "booking_id")

    op.drop_constraint(
        "fk_bookings_buyer_requirement_id_buyer_requirements",
        "bookings",
        type_="foreignkey",
    )
    op.drop_constraint(
        "fk_bookings_lead_id_leads",
        "bookings",
        type_="foreignkey",
    )

    op.drop_index(
        "ix_bookings_buyer_requirement_id",
        table_name="bookings",
    )
    op.drop_index(
        "ix_bookings_lead_id",
        table_name="bookings",
    )

    op.drop_column("bookings", "buyer_requirement_id")
    op.drop_column("bookings", "lead_id")
