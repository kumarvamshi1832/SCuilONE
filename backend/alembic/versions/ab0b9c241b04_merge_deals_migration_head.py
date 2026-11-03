"""merge deals migration head

Revision ID: ab0b9c241b04
Revises: 2b80e0f89557, 1dd7dc0cad94
Create Date: 2026-10-08 12:39:21.816034

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'ab0b9c241b04'
down_revision: Union[str, Sequence[str], None] = ('2b80e0f89557', '1dd7dc0cad94')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
