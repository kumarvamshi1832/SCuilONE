
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "fe8bf8c0d4b8"
down_revision: Union[str, Sequence[str], None] = "0dc3579a7891"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("created_by", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_accounts_created_by_users",
        "accounts",
        "users",
        ["created_by"],
        ["id"],
    )

    op.add_column(
        "contacts",
        sa.Column("created_by", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_contacts_created_by_users",
        "contacts",
        "users",
        ["created_by"],
        ["id"],
    )

    op.add_column(
        "deals",
        sa.Column("created_by", sa.UUID(), nullable=True),
    )
    op.create_foreign_key(
        "fk_deals_created_by_users",
        "deals",
        "users",
        ["created_by"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_deals_created_by_users",
        "deals",
        type_="foreignkey",
    )
    op.drop_column("deals", "created_by")

    op.drop_constraint(
        "fk_contacts_created_by_users",
        "contacts",
        type_="foreignkey",
    )
    op.drop_column("contacts", "created_by")

    op.drop_constraint(
        "fk_accounts_created_by_users",
        "accounts",
        type_="foreignkey",
    )
    op.drop_column("accounts", "created_by")
