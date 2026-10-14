"""add pipeline references to deals

Revision ID: f5d6d75ef07c
Revises: 461484dfdb2e
Create Date: 2026-10-12 12:07:44.797907
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "f5d6d75ef07c"
down_revision: Union[str, Sequence[str], None] = "461484dfdb2e"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "deals",
        sa.Column("pipeline_id", sa.UUID(), nullable=True)
    )
    op.add_column(
        "deals",
        sa.Column("pipeline_stage_id", sa.UUID(), nullable=True)
    )

    op.create_index(
        "ix_deals_pipeline_id",
        "deals",
        ["pipeline_id"],
        unique=False
    )
    op.create_index(
        "ix_deals_pipeline_stage_id",
        "deals",
        ["pipeline_stage_id"],
        unique=False
    )

    op.create_foreign_key(
        "fk_deals_pipeline_id_pipelines",
        "deals",
        "pipelines",
        ["pipeline_id"],
        ["id"]
    )
    op.create_foreign_key(
        "fk_deals_pipeline_stage_id_pipeline_stages",
        "deals",
        "pipeline_stages",
        ["pipeline_stage_id"],
        ["id"]
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_deals_pipeline_stage_id_pipeline_stages",
        "deals",
        type_="foreignkey"
    )
    op.drop_constraint(
        "fk_deals_pipeline_id_pipelines",
        "deals",
        type_="foreignkey"
    )

    op.drop_index("ix_deals_pipeline_stage_id", table_name="deals")
    op.drop_index("ix_deals_pipeline_id", table_name="deals")

    op.drop_column("deals", "pipeline_stage_id")
    op.drop_column("deals", "pipeline_id")