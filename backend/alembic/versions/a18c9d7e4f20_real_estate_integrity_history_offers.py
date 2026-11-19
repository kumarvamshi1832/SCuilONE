"""Tenant guards, buyer requirement revisions, site visit history and offers.

Revision ID: a18c9d7e4f20
Revises: a17b9c2d4e61
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a18c9d7e4f20"
down_revision = "a17b9c2d4e61"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "buyer_requirement_revisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("buyer_requirement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("buyer_requirements.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("snapshot", postgresql.JSONB(), nullable=False),
        sa.Column("change_reason", sa.Text(), nullable=True),
        sa.Column("changed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("tenant_id", "buyer_requirement_id", "revision_number", name="uq_br_revision_number"),
    )
    op.create_index("ix_br_revisions_tenant_requirement", "buyer_requirement_revisions", ["tenant_id", "buyer_requirement_id", "revision_number"])
    op.create_table(
        "site_visit_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("site_visit_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("site_visits.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("event_type", sa.String(40), nullable=False),
        sa.Column("before_data", postgresql.JSONB(), nullable=True),
        sa.Column("after_data", postgresql.JSONB(), nullable=False),
        sa.Column("reason", sa.Text(), nullable=True),
        sa.Column("changed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_site_visit_history_tenant_visit", "site_visit_history", ["tenant_id", "site_visit_id", "created_at"])
    op.create_table(
        "property_offers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("property_match_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("property_matches.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("parent_offer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("property_offers.id", ondelete="RESTRICT"), nullable=True),
        sa.Column("offered_price", sa.Numeric(14,2), nullable=False),
        sa.Column("status", sa.String(24), nullable=False, server_default="Submitted"),
        sa.Column("offer_type", sa.String(24), nullable=False, server_default="Buyer"),
        sa.Column("terms", sa.Text(), nullable=True),
        sa.Column("response_notes", sa.Text(), nullable=True),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("responded_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=True),
        sa.Column("responded_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("offered_price > 0", name="ck_property_offers_price_positive"),
    )
    op.create_index("ix_property_offers_tenant_match_created", "property_offers", ["tenant_id", "property_match_id", "created_at"])
    op.create_index("ix_property_offers_tenant_status", "property_offers", ["tenant_id", "status"])
    op.add_column("bookings", sa.Column("accepted_offer_id", postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key("fk_bookings_accepted_offer", "bookings", "property_offers", ["accepted_offer_id"], ["id"])
    op.create_unique_constraint("uq_bookings_accepted_offer", "bookings", ["accepted_offer_id"])

    # Seed a baseline revision/history entry for records that existed before this migration.
    op.execute("""
      INSERT INTO buyer_requirement_revisions
        (id, tenant_id, buyer_requirement_id, revision_number, snapshot, change_reason, changed_by, created_at)
      SELECT gen_random_uuid(), br.tenant_id, br.id, 1,
        jsonb_build_object('id', br.id, 'tenant_id', br.tenant_id, 'lead_id', br.lead_id,
          'contact_id', br.contact_id, 'assigned_to', br.assigned_to, 'requirement_type', br.requirement_type,
          'property_type', br.property_type, 'preferred_city', br.preferred_city,
          'preferred_location', br.preferred_location, 'min_budget', br.min_budget,
          'max_budget', br.max_budget, 'bedrooms', br.bedrooms, 'min_area', br.min_area,
          'max_area', br.max_area, 'area_unit', br.area_unit, 'status', br.status,
          'notes', br.notes, 'created_at', br.created_at, 'updated_at', br.updated_at),
        'Baseline snapshot at history rollout', br.created_by, now()
      FROM buyer_requirements br
      ON CONFLICT (tenant_id, buyer_requirement_id, revision_number) DO NOTHING
    """)
    op.execute("""
      INSERT INTO site_visit_history
        (id, tenant_id, site_visit_id, event_type, before_data, after_data, reason, changed_by, created_at)
      SELECT gen_random_uuid(), sv.tenant_id, sv.id, 'BASELINE', NULL,
        jsonb_build_object('id', sv.id, 'property_match_id', sv.property_match_id,
          'assigned_to', sv.assigned_to, 'created_by', sv.created_by,
          'scheduled_start', sv.scheduled_start, 'scheduled_end', sv.scheduled_end,
          'status', sv.status, 'outcome', sv.outcome, 'buyer_feedback', sv.buyer_feedback,
          'interest_level', sv.interest_level, 'follow_up_required', sv.follow_up_required,
          'follow_up_date', sv.follow_up_date, 'cancellation_reason', sv.cancellation_reason),
        'Baseline snapshot at history rollout', sv.created_by, now()
      FROM site_visits sv
    """)

    # Fail safely rather than silently accepting legacy cross-tenant links.
    op.execute("""
    DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM buyer_requirements r JOIN leads x ON x.id=r.lead_id WHERE r.lead_id IS NOT NULL AND x.tenant_id <> r.tenant_id)
      OR EXISTS (SELECT 1 FROM buyer_requirements r JOIN contacts x ON x.id=r.contact_id WHERE r.contact_id IS NOT NULL AND x.tenant_id <> r.tenant_id)
      OR EXISTS (SELECT 1 FROM buyer_requirements r JOIN users x ON x.id=r.assigned_to WHERE r.assigned_to IS NOT NULL AND x.tenant_id <> r.tenant_id)
      OR EXISTS (SELECT 1 FROM property_matches r JOIN buyer_requirements x ON x.id=r.buyer_requirement_id WHERE x.tenant_id <> r.tenant_id)
      OR EXISTS (SELECT 1 FROM property_matches r JOIN properties x ON x.id=r.property_id WHERE x.tenant_id <> r.tenant_id)
      OR EXISTS (SELECT 1 FROM property_matches r JOIN users x ON x.id=r.assigned_to WHERE r.assigned_to IS NOT NULL AND x.tenant_id <> r.tenant_id)
      OR EXISTS (SELECT 1 FROM site_visits r JOIN property_matches x ON x.id=r.property_match_id WHERE x.tenant_id <> r.tenant_id)
      OR EXISTS (SELECT 1 FROM site_visits r JOIN users x ON x.id=r.assigned_to WHERE r.assigned_to IS NOT NULL AND x.tenant_id <> r.tenant_id)
      OR EXISTS (SELECT 1 FROM bookings r JOIN properties x ON x.id=r.property_id WHERE x.tenant_id <> r.tenant_id)
      OR EXISTS (SELECT 1 FROM bookings r JOIN leads x ON x.id=r.lead_id WHERE r.lead_id IS NOT NULL AND x.tenant_id <> r.tenant_id)
      OR EXISTS (SELECT 1 FROM bookings r JOIN buyer_requirements x ON x.id=r.buyer_requirement_id WHERE r.buyer_requirement_id IS NOT NULL AND x.tenant_id <> r.tenant_id)
      OR EXISTS (SELECT 1 FROM bookings r JOIN users x ON x.id=r.created_by WHERE r.created_by IS NOT NULL AND x.tenant_id <> r.tenant_id)
      THEN RAISE EXCEPTION 'SCuilONE tenant integrity preflight failed: cross-tenant relationship found. Repair the affected records before retrying this migration.';
      END IF;
    END $$;
    """)

    # Enforce tenant equality at the database boundary, including writes that bypass API routes.
    op.execute("""
    CREATE OR REPLACE FUNCTION scuilone_assert_related_tenant() RETURNS trigger AS $$
    DECLARE related_tenant uuid; related_id uuid;
    BEGIN
      related_id := (to_jsonb(NEW) ->> TG_ARGV[1])::uuid;
      IF related_id IS NULL THEN RETURN NEW; END IF;
      EXECUTE format('SELECT tenant_id FROM %I WHERE id = $1', TG_ARGV[0]) INTO related_tenant USING related_id;
      IF related_tenant IS NOT NULL AND related_tenant <> NEW.tenant_id THEN
        RAISE EXCEPTION 'Cross-tenant relationship rejected: %.% does not belong to tenant %', TG_TABLE_NAME, TG_ARGV[1], NEW.tenant_id USING ERRCODE = '23514';
      END IF;
      RETURN NEW;
    END; $$ LANGUAGE plpgsql;
    """)
    guards = [
      ("buyer_requirements", "leads", "lead_id"), ("buyer_requirements", "contacts", "contact_id"),
      ("buyer_requirements", "users", "assigned_to"), ("buyer_requirements", "users", "created_by"),
      ("property_matches", "buyer_requirements", "buyer_requirement_id"), ("property_matches", "properties", "property_id"),
      ("property_matches", "users", "assigned_to"), ("property_matches", "users", "created_by"),
      ("site_visits", "property_matches", "property_match_id"), ("site_visits", "users", "assigned_to"), ("site_visits", "users", "created_by"),
      ("bookings", "properties", "property_id"), ("bookings", "leads", "lead_id"),
      ("bookings", "buyer_requirements", "buyer_requirement_id"), ("bookings", "users", "created_by"), ("bookings", "property_offers", "accepted_offer_id"),
      ("property_offers", "property_matches", "property_match_id"), ("property_offers", "property_offers", "parent_offer_id"),
      ("property_offers", "users", "created_by"), ("property_offers", "users", "responded_by"),
      ("buyer_requirement_revisions", "buyer_requirements", "buyer_requirement_id"), ("buyer_requirement_revisions", "users", "changed_by"),
      ("site_visit_history", "site_visits", "site_visit_id"), ("site_visit_history", "users", "changed_by"),
    ]
    for table, target, column in guards:
        name = f"trg_tenant_guard_{table}_{column}"
        op.execute(f"CREATE TRIGGER {name} BEFORE INSERT OR UPDATE OF tenant_id, {column} ON {table} FOR EACH ROW EXECUTE FUNCTION scuilone_assert_related_tenant('{target}', '{column}')")


def downgrade():
    guards = [
      ("buyer_requirements", "lead_id"), ("buyer_requirements", "contact_id"), ("buyer_requirements", "assigned_to"), ("buyer_requirements", "created_by"),
      ("property_matches", "buyer_requirement_id"), ("property_matches", "property_id"), ("property_matches", "assigned_to"), ("property_matches", "created_by"),
      ("site_visits", "property_match_id"), ("site_visits", "assigned_to"), ("site_visits", "created_by"),
      ("bookings", "property_id"), ("bookings", "lead_id"), ("bookings", "buyer_requirement_id"), ("bookings", "created_by"), ("bookings", "accepted_offer_id"),
      ("property_offers", "property_match_id"), ("property_offers", "parent_offer_id"), ("property_offers", "created_by"), ("property_offers", "responded_by"),
      ("buyer_requirement_revisions", "buyer_requirement_id"), ("buyer_requirement_revisions", "changed_by"),
      ("site_visit_history", "site_visit_id"), ("site_visit_history", "changed_by"),
    ]
    for table, column in guards:
        op.execute(f"DROP TRIGGER IF EXISTS trg_tenant_guard_{table}_{column} ON {table}")
    op.execute("DROP FUNCTION IF EXISTS scuilone_assert_related_tenant()")
    op.drop_constraint("uq_bookings_accepted_offer", "bookings", type_="unique")
    op.drop_constraint("fk_bookings_accepted_offer", "bookings", type_="foreignkey")
    op.drop_column("bookings", "accepted_offer_id")
    op.drop_table("property_offers")
    op.drop_table("site_visit_history")
    op.drop_table("buyer_requirement_revisions")
