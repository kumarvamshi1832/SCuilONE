"""add buyer address and multiple booking nominees

Revision ID: a17b9c2d4e61
Revises: c55084d1277f
Create Date: 2026-11-18 12:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a17b9c2d4e61"
down_revision: Union[str, Sequence[str], None] = "c55084d1277f"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_unique_constraint("uq_bookings_tenant_id_id", "bookings", ["tenant_id", "id"])
    op.add_column("bookings", sa.Column("buyer_address", sa.Text(), nullable=True))
    op.add_column("bookings", sa.Column("buyer_details_submitted_at", sa.DateTime(), nullable=True))
    op.create_table(
        "booking_nominees",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("nominee_name", sa.String(length=200), nullable=False),
        sa.Column("relationship", sa.String(length=80), nullable=False),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("date_of_birth", sa.Date(), nullable=True),
        sa.Column("address", sa.Text(), nullable=True),
        sa.Column("allocation_percentage", sa.Numeric(5, 2), nullable=True),
        sa.Column("remarks", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("allocation_percentage IS NULL OR (allocation_percentage > 0 AND allocation_percentage <= 100)", name="ck_booking_nominee_allocation_percentage"),
        sa.ForeignKeyConstraint(["tenant_id", "booking_id"], ["bookings.tenant_id", "bookings.id"], ondelete="CASCADE", name="fk_booking_nominee_tenant_booking"),
    )
    op.create_index("ix_booking_nominees_tenant_booking", "booking_nominees", ["tenant_id", "booking_id"])


def downgrade() -> None:
    op.drop_index("ix_booking_nominees_tenant_booking", table_name="booking_nominees")
    op.drop_table("booking_nominees")
    op.drop_column("bookings", "buyer_details_submitted_at")
    op.drop_column("bookings", "buyer_address")
    op.drop_constraint("uq_bookings_tenant_id_id", "bookings", type_="unique")
