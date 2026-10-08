"""merge CRM relationship migrations

Revision ID: d3bb0a9a1b8e
Revises: ab0b9c241b04, 37997a578872
Create Date: 2026-10-08 19:13:27.999397

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd3bb0a9a1b8e'
down_revision: Union[str, Sequence[str], None] = ('ab0b9c241b04', '37997a578872')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
