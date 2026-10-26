
"""add building and unit fields to properties

Revision ID: 9e258bc18b4b
Revises: 0ef3b57c115c
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "9e258bc18b4b"
down_revision: Union[str, Sequence[str], None] = "0ef3b57c115c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "properties",
        sa.Column("building_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column(
        "properties",
        sa.Column("unit_number", sa.String(length=50), nullable=True),
    )

    op.create_index(
        "ix_properties_tenant_building",
        "properties",
        ["tenant_id", "building_id"],
        unique=False,
    )

    op.create_foreign_key(
        "fk_properties_building_id_buildings",
        "properties",
        "buildings",
        ["building_id"],
        ["id"],
    )

    op.create_unique_constraint(
        "uq_properties_tenant_building_unit",
        "properties",
        ["tenant_id", "building_id", "unit_number"],
    )

    op.create_check_constraint(
        "ck_properties_building_requires_unit_number",
        "properties",
        "building_id IS NULL OR unit_number IS NOT NULL",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_properties_building_requires_unit_number",
        "properties",
        type_="check",
    )
    op.drop_constraint(
        "uq_properties_tenant_building_unit",
        "properties",
        type_="unique",
    )
    op.drop_constraint(
        "fk_properties_building_id_buildings",
        "properties",
        type_="foreignkey",
    )
    op.drop_index(
        "ix_properties_tenant_building",
        table_name="properties",
    )
    op.drop_column("properties", "unit_number")
    op.drop_column("properties", "building_id")
