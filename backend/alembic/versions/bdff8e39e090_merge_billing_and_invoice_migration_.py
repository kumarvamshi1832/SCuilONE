"""merge billing and invoice migration heads

Revision ID: bdff8e39e090
Revises: 3ac5625bbbea, 9c4a7f2d1b60
Create Date: 2026-11-03 12:05:43.530848

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bdff8e39e090'
down_revision: Union[str, Sequence[str], None] = ('3ac5625bbbea', '9c4a7f2d1b60')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
