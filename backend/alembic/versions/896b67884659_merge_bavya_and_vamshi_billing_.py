"""merge Bavya and Vamshi billing migrations

Revision ID: 896b67884659
Revises: 95e3bdce078e, f6a3d9b25e81
Create Date: 2026-11-03 18:22:59.773017

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '896b67884659'
down_revision: Union[str, Sequence[str], None] = ('95e3bdce078e', 'f6a3d9b25e81')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
