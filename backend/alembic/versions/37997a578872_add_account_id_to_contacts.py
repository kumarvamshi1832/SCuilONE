"""add account_id to contacts

Revision ID: 37997a578872
Revises: d44861a33a61
Create Date: 2026-10-08 15:50:38.707544

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '37997a578872'
down_revision: Union[str, Sequence[str], None] = 'd44861a33a61'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'contacts',
        sa.Column('account_id', sa.UUID(), nullable=True)
    )

    op.create_foreign_key(
        'fk_contacts_account_id',
        'contacts',
        'accounts',
        ['account_id'],
        ['id']
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        'fk_contacts_account_id',
        'contacts',
        type_='foreignkey'
    )

    op.drop_column(
        'contacts',
        'account_id'
    )