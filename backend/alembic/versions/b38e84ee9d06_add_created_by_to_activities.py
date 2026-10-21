
"""add created by to activities

Revision ID: b38e84ee9d06
Revises: 95fa19a4dfa1
Create Date: 2026-10-21 14:47:49.239762
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "b38e84ee9d06"
down_revision: Union[str, Sequence[str], None] = "95fa19a4dfa1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "activities",
        sa.Column("created_by", sa.UUID(), nullable=True),
    )

    op.create_index(
        "ix_activities_created_by",
        "activities",
        ["created_by"],
        unique=False,
    )

    op.create_foreign_key(
        "fk_activities_created_by_users",
        "activities",
        "users",
        ["created_by"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_activities_created_by_users",
        "activities",
        type_="foreignkey",
    )

    op.drop_index(
        "ix_activities_created_by",
        table_name="activities",
    )

    op.drop_column("activities", "created_by")
