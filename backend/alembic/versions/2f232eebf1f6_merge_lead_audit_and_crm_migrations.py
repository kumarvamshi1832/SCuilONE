"""merge lead audit and CRM migrations

Revision ID: 2f232eebf1f6
Revises: 8573fc4f91bb, c5b2897ec946
Create Date: 2026-10-16 10:52:37.927566

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2f232eebf1f6'
down_revision: Union[str, Sequence[str], None] = ('8573fc4f91bb', 'c5b2897ec946')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
