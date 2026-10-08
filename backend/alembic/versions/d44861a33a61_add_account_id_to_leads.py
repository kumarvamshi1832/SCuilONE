"""add account_id to leads

Revision ID: d44861a33a61
Revises: 1dd7dc0cad94
Create Date: 2026-10-08 15:24:10.222200

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'd44861a33a61'
down_revision: Union[str, Sequence[str], None] = '1dd7dc0cad94'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        'leads',
        sa.Column('account_id', sa.UUID(), nullable=True)
    )

    op.create_foreign_key(
        'fk_leads_account_id',
        'leads',
        'accounts',
        ['account_id'],
        ['id']
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_constraint(
        'fk_leads_account_id',
        'leads',
        type_='foreignkey'
    )

    op.drop_column(
        'leads',
        'account_id'
    )