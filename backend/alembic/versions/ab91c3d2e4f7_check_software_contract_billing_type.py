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
depends_on: Union[str, Sequence[str], None] = None


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
