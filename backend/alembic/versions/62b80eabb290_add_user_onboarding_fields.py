"""add user onboarding fields

Revision ID: 62b80eabb290
Revises: f5d6d75ef07c
Create Date: 2026-10-13 11:30:47.424931

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '62b80eabb290'
down_revision: Union[str, Sequence[str], None] = 'f5d6d75ef07c'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None



def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column(
            "must_change_password",
            sa.Boolean(),
            nullable=False,
            server_default=sa.false()
        )
    )

    op.add_column(
        "users",
        sa.Column(
            "profile_completed",
            sa.Boolean(),
            nullable=False,
            server_default=sa.true()
        )
    )

    op.alter_column(
        "users",
        "must_change_password",
        server_default=None
    )

    op.alter_column(
        "users",
        "profile_completed",
        server_default=None
    )


def downgrade() -> None:
    op.drop_column("users", "profile_completed")
    op.drop_column("users", "must_change_password")