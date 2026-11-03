"""merge_crm_and_activity_heads

Revision ID: fbb2662ed293
Revises: 2f232eebf1f6, b38e84ee9d06
Create Date: 2026-10-22 16:20:58.909067

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'fbb2662ed293'
down_revision: Union[str, Sequence[str], None] = ('2f232eebf1f6', 'b38e84ee9d06')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
