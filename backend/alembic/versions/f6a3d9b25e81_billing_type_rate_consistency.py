"""billing type: estimate value check and hourly-rate consistency on estimates and contracts

Revision ID: f6a3d9b25e81
Revises: 5e4413ac893c
Create Date: 2026-11-07
"""
from typing import Sequence, Union

from alembic import op


revision: str = "f6a3d9b25e81"
down_revision: Union[str, Sequence[str], None] = "5e4413ac893c"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

RATE_RULE = (
    "(billing_type = 'Time & Material' AND hourly_rate IS NOT NULL AND hourly_rate > 0) "
    "OR (billing_type = 'Fixed Price' AND hourly_rate IS NULL)"
)


def upgrade() -> None:
    # Contracts already have their billing_type value check (ab91c3d2e4f7);
    # estimates did not, so add it there (unknown values become the safe default first).
    op.execute(
        "UPDATE software_estimates SET billing_type = 'Fixed Price' "
        "WHERE billing_type NOT IN ('Fixed Price', 'Time & Material')"
    )
    op.create_check_constraint(
        "ck_software_estimates_billing_type_valid",
        "software_estimates",
        "billing_type IN ('Fixed Price', 'Time & Material')",
    )

    # NOT VALID: every new or changed row must follow the rule, but old rows that
    # may already disagree do not block the migration. After fixing them you can run
    #   ALTER TABLE software_estimates VALIDATE CONSTRAINT ck_software_estimates_hourly_rate_matches_billing_type;
    for table in ("estimates", "contracts"):
        op.execute(
            f"ALTER TABLE software_{table} ADD CONSTRAINT ck_software_{table}_hourly_rate_matches_billing_type "
            f"CHECK ({RATE_RULE}) NOT VALID"
        )


def downgrade() -> None:
    for table in ("contracts", "estimates"):
        op.drop_constraint(f"ck_software_{table}_hourly_rate_matches_billing_type", f"software_{table}", type_="check")
    op.drop_constraint("ck_software_estimates_billing_type_valid", "software_estimates", type_="check")
