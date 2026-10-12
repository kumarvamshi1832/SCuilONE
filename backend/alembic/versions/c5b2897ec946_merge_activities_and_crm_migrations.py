"""merge activities and CRM migrations

Revision ID: c5b2897ec946
Revises: 785b9706b9ef, d3bb0a9a1b8e
Create Date: 2026-10-12 12:27:33.571114

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c5b2897ec946'
down_revision: Union[str, Sequence[str], None] = ('785b9706b9ef', 'd3bb0a9a1b8e')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
