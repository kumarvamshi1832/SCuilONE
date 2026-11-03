"""check software contract billing type

Revision ID: ab91c3d2e4f7
Revises: d4e7b3a91c58
Create Date: 2026-11-03
"""
from typing import Sequence, Union
from alembic import op

revision: str = "ab91c3d2e4f7"
down_revision: Union[str, Sequence[str], None] = "d4e7b3a91c58"
branch_labels: Union[str, Sequence[str], None] = None
# The billing_type column is created by 9c4a7f2d1b60, which is on a parallel branch.
# depends_on makes Alembic always run that migration first, without changing the
# revision history (so databases already stamped at the merge revision keep working).
depends_on: Union[str, Sequence[str], None] = "9c4a7f2d1b60"


def upgrade() -> None:
    op.create_check_constraint(
        "ck_software_contracts_billing_type",
        "software_contracts",
        "billing_type IN ('Fixed Price', 'Time & Material')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_software_contracts_billing_type",
        "software_contracts",
        type_="check",
    )
