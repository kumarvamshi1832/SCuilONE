
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0dc3579a7891"
down_revision: Union[str, Sequence[str], None] = "2999cce1e3d2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "leads",
        sa.Column("created_by", sa.UUID(), nullable=True),
    )

    op.create_foreign_key(
        "fk_leads_created_by_users",
        "leads",
        "users",
        ["created_by"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint(
        "fk_leads_created_by_users",
        "leads",
        type_="foreignkey",
    )

    op.drop_column("leads", "created_by")
