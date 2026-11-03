"""merge local and friend billing migration heads

Revision ID: 95e3bdce078e
Revises: 3af37457a014, 5e4413ac893c
Create Date: 2026-11-03 13:28:30.369617

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '95e3bdce078e'
down_revision: Union[str, Sequence[str], None] = ('3af37457a014', '5e4413ac893c')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
