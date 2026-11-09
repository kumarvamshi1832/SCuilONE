"""Seed dedicated module packs for canonical SCuilONE industries.

Revision ID: f1a2b3c4d5e6
Revises: c7e9a1b3d5f2
"""
import json
import uuid
from alembic import op
import sqlalchemy as sa

revision = "f1a2b3c4d5e6"
down_revision = "c7e9a1b3d5f2"
branch_labels = None
depends_on = None

COMMON = ["leads", "contacts", "accounts", "deals", "activities"]
PACKS = [
    ("education_consulting", "Education Consulting"),
    ("training_institutes", "Training Institutes"),
    ("digital_marketing_agencies", "Digital Marketing Agencies"),
    ("insurance_agencies", "Insurance Agencies"),
    ("automobile_dealers", "Automobile Dealers"),
    ("interior_designers", "Interior Designers"),
    ("travel_companies", "Travel Companies"),
    ("b2b_sales", "B2B Sales"),
]

def upgrade():
    conn = op.get_bind()
    stmt = sa.text("""
        INSERT INTO industry_packs
          (id, pack_key, name, description, version, is_active, default_config, created_at, updated_at)
        VALUES (:id, :key, :name, :description, '1.0.0', true, CAST(:config AS JSONB), now(), now())
        ON CONFLICT (pack_key) DO NOTHING
    """)
    for key, name in PACKS:
        conn.execute(stmt, {
            "id": uuid.uuid4(), "key": key, "name": name,
            "description": f"SCuilONE {name} industry module pack",
            "config": json.dumps({"enabled_modules": COMMON}),
        })
    # The old generic Software key has one safe canonical equivalent.
    conn.execute(sa.text("""
        UPDATE platform_industry_teams
        SET industry_key='software_companies', name='Software Companies',
            config_json=COALESCE(config_json, '{}'::jsonb) || '{"scuilone_f1a2b3c4d5e6_mapped": true}'::jsonb
        WHERE industry_key='software'
          AND NOT EXISTS (SELECT 1 FROM platform_industry_teams x WHERE x.industry_key='software_companies')
    """))
    conn.execute(sa.text("""
        UPDATE platform_employees
        SET industry_key='software_companies'
        WHERE industry_key='software'
          AND industry_team_id IN (
            SELECT id FROM platform_industry_teams
            WHERE COALESCE((config_json->>'scuilone_f1a2b3c4d5e6_mapped')::boolean, false) IS TRUE
          )
    """))

def downgrade():
    conn = op.get_bind()
    conn.execute(sa.text("""
        UPDATE platform_employees
        SET industry_key='software'
        WHERE industry_key='software_companies'
          AND industry_team_id IN (
            SELECT id FROM platform_industry_teams
            WHERE COALESCE((config_json->>'scuilone_f1a2b3c4d5e6_mapped')::boolean, false) IS TRUE
          )
    """))
    conn.execute(sa.text("""
        UPDATE platform_industry_teams
        SET industry_key='software', name='IT & Software',
            config_json=COALESCE(config_json, '{}'::jsonb) - 'scuilone_f1a2b3c4d5e6_mapped'
        WHERE industry_key='software_companies'
          AND COALESCE((config_json->>'scuilone_f1a2b3c4d5e6_mapped')::boolean, false) IS TRUE
    """))
    op.execute(sa.text("""
        DELETE FROM industry_packs
        WHERE pack_key IN ('education_consulting','training_institutes','digital_marketing_agencies',
          'insurance_agencies','automobile_dealers','interior_designers','travel_companies','b2b_sales')
          AND id NOT IN (SELECT industry_pack_id FROM tenant_industry_configs WHERE industry_pack_id IS NOT NULL)
    """))
