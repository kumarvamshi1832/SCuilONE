"""merge accounts migration head

Revision ID: 2b80e0f89557
Revises: aa6d41a73379, 155dce0d93c0
Create Date: 2026-10-05 22:03:23.804472

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '2b80e0f89557'
down_revision: Union[str, Sequence[str], None] = ('aa6d41a73379', '155dce0d93c0')
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    pass


def downgrade() -> None:
    """Downgrade schema."""
    pass
