"""merge contacts migration head

Revision ID: aa6d41a73379
Revises: 80549fee857a, cd2bfa5f2f01
Create Date: 2026-10-05 11:25:55.234741

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'aa6d41a73379'
down_revision: Union[str, Sequence[str], None] = ('80549fee857a', 'cd2bfa5f2f01')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
