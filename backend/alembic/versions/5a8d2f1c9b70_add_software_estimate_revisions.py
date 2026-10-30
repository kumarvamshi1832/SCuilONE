"""add software estimate revisions

Revision ID: 5a8d2f1c9b70
Revises: 4c29f675cb65
Create Date: 2026-10-29
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "5a8d2f1c9b70"
down_revision: Union[str, Sequence[str], None] = "4c29f675cb65"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "software_estimates",
        sa.Column(
            "revision_number",
            sa.Integer(),
            server_default="1",
            nullable=False,
        ),
    )
    op.add_column(
        "software_estimates",
        sa.Column("parent_estimate_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_software_estimates_parent_estimate",
        "software_estimates",
        "software_estimates",
        ["parent_estimate_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_software_estimates_parent_estimate_id",
        "software_estimates",
        ["parent_estimate_id"],
        unique=False,
    )


def downgrade() -> None:
    op.drop_index(
        "ix_software_estimates_parent_estimate_id",
        table_name="software_estimates",
    )
    op.drop_constraint(
        "fk_software_estimates_parent_estimate",
        "software_estimates",
        type_="foreignkey",
    )
    op.drop_column("software_estimates", "parent_estimate_id")
    op.drop_column("software_estimates", "revision_number")
