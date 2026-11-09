"""seed default industry packs (software, real_estate, other)

Tenant provisioning (POST /api/v1/platform/tenants) and module access both
require an active row in ``industry_packs``. Nothing created these rows, so a
fresh database could not provision any tenant. This migration inserts the three
packs the application classifies industries into. It is idempotent: packs that
already exist (e.g. inserted manually or customised) are left untouched.

Revision ID: e7a1c3b5d9f4
Revises: d9e1a3c5b7f2
Create Date: 2026-11-08 12:00:00.000000
"""
import json
import uuid
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "e7a1c3b5d9f4"
down_revision: Union[str, Sequence[str], None] = "d9e1a3c5b7f2"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


COMMON_MODULES = ["leads", "contacts", "accounts", "deals", "activities"]
SOFTWARE_MODULES = [
    "software_requirements",
    "software_estimates",
    "software_contracts",
    "software_projects",
    "software_sprints",
    "software_time_entries",
    "software_invoices",
    "software_delivery_reports",
]
REAL_ESTATE_MODULES = [
    "properties",
    "buildings",
    "real_estate_projects",
    "buyer_requirements",
    "property_matches",
    "site_visits",
    "bookings",
]

PACKS = [
    {
        "pack_key": "software",
        "name": "Software & IT Services",
        "description": "CRM plus software requirements, estimates, contracts, projects, sprints, time tracking, invoicing and delivery reports.",
        "enabled_modules": COMMON_MODULES + SOFTWARE_MODULES,
    },
    {
        "pack_key": "real_estate",
        "name": "Real Estate",
        "description": "CRM plus properties, buildings, projects, buyer requirements, matching, site visits and bookings.",
        "enabled_modules": COMMON_MODULES + REAL_ESTATE_MODULES,
    },
    {
        "pack_key": "other",
        "name": "General CRM",
        "description": "Core CRM modules for industries without a dedicated pack.",
        "enabled_modules": COMMON_MODULES,
    },
]


def upgrade() -> None:
    conn = op.get_bind()
    insert_stmt = sa.text(
        """
        INSERT INTO industry_packs
            (id, pack_key, name, description, version, is_active,
             default_config, created_at, updated_at)
        VALUES
            (:id, :pack_key, :name, :description, '1.0.0', true,
             CAST(:default_config AS JSONB), now(), now())
        ON CONFLICT (pack_key) DO NOTHING
        """
    )
    for pack in PACKS:
        conn.execute(
            insert_stmt,
            {
                "id": uuid.uuid4(),
                "pack_key": pack["pack_key"],
                "name": pack["name"],
                "description": pack["description"],
                "default_config": json.dumps(
                    {"enabled_modules": pack["enabled_modules"]}
                ),
            },
        )


def downgrade() -> None:
    # Only remove seeded packs that no tenant configuration references.
    op.execute(
        """
        DELETE FROM industry_packs
        WHERE pack_key IN ('software', 'real_estate', 'other')
          AND id NOT IN (
              SELECT industry_pack_id FROM tenant_industry_configs
              WHERE industry_pack_id IS NOT NULL
          )
        """
    )
