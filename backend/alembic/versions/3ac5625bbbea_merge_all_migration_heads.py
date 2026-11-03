"""merge all migration heads

Revision ID: 3ac5625bbbea
Revises: 8ab8a7672486, e8b2d5f61a47
Create Date: 2026-11-02 13:45:58.853812

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3ac5625bbbea'
down_revision: Union[str, Sequence[str], None] = ('8ab8a7672486', 'e8b2d5f61a47')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
