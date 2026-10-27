"""merge booking payment and deals heads

Revision ID: 8ab8a7672486
Revises: 447fe8cda088, 4971f21e3fe4
Create Date: 2026-10-26 18:51:22.228424

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8ab8a7672486'
down_revision: Union[str, Sequence[str], None] = ('447fe8cda088', '4971f21e3fe4')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
