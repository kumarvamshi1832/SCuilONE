"""merge billing type constraint migration

Revision ID: 5e4413ac893c
Revises: 9c4a7f2d1b60, ab91c3d2e4f7
Create Date: 2026-11-03 12:33:54.791790

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '5e4413ac893c'
down_revision: Union[str, Sequence[str], None] = ('9c4a7f2d1b60', 'ab91c3d2e4f7')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
