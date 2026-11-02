"""contract milestone billing mode (sequential or parallel)

Revision ID: d4e7b3a91c58
Revises: c9a47e2d5b13
Create Date: 2026-11-04
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d4e7b3a91c58"
down_revision: Union[str, Sequence[str], None] = "c9a47e2d5b13"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Existing contracts keep today's behaviour (Sequential).
    op.add_column(
        "software_contracts",
        sa.Column(
            "milestone_billing_mode",
            sa.String(length=20),
            nullable=False,
            server_default="Sequential",
        ),
    )
    op.create_check_constraint(
        "ck_software_contracts_milestone_billing_mode",
        "software_contracts",
        "milestone_billing_mode IN ('Sequential', 'Parallel')",
    )


def downgrade() -> None:
    op.drop_constraint(
        "ck_software_contracts_milestone_billing_mode",
        "software_contracts",
        type_="check",
    )
    op.drop_column("software_contracts", "milestone_billing_mode")
