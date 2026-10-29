"""add deal links to software workflow

Revision ID: a7d4c912e6b1
Revises: 5ed173cc7b3c
Create Date: 2026-10-28
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "a7d4c912e6b1"
down_revision: Union[str, Sequence[str], None] = "5ed173cc7b3c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    for table_name in (
        "software_requirements",
        "software_estimates",
        "software_contracts",
        "software_projects",
    ):
        op.add_column(
            table_name,
            sa.Column("deal_id", postgresql.UUID(as_uuid=True), nullable=True),
        )
        op.create_foreign_key(
            f"fk_{table_name}_deal_id_deals",
            table_name,
            "deals",
            ["deal_id"],
            ["id"],
        )
        op.create_index(
            f"ix_{table_name}_deal_id",
            table_name,
            ["deal_id"],
            unique=False,
        )


def downgrade() -> None:
    for table_name in (
        "software_projects",
        "software_contracts",
        "software_estimates",
        "software_requirements",
    ):
        op.drop_index(f"ix_{table_name}_deal_id", table_name=table_name)
        op.drop_constraint(
            f"fk_{table_name}_deal_id_deals",
            table_name,
            type_="foreignkey",
        )
        op.drop_column(table_name, "deal_id")
