"""merge permission and lead migration heads

Revision ID: 80549fee857a
Revises: 7be5bfdac34f, 33a6b59c2bd2
Create Date: 2026-09-30 23:17:06.851810

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '80549fee857a'
down_revision: Union[str, Sequence[str], None] = ('7be5bfdac34f', '33a6b59c2bd2')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
