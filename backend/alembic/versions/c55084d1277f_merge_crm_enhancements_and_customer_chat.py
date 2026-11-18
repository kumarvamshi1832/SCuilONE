"""merge crm enhancements and customer chat

Revision ID: c55084d1277f
Revises: e101_crm_enhancements, d902_customer_independent_chat
Create Date: 2026-11-17 12:33:38.188599

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c55084d1277f'
down_revision: Union[str, Sequence[str], None] = ('e101_crm_enhancements', 'd902_customer_independent_chat')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
