"""Add complete rental and lease lifecycle."""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "c8f2a6d91b40"
down_revision = "b3c5d7e9f1a2"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column("properties", sa.Column("price_frequency", sa.String(20), nullable=False, server_default="One-time"))
    op.add_column("properties", sa.Column("security_deposit", sa.Numeric(14, 2), nullable=True))
    op.add_column("properties", sa.Column("minimum_term_months", sa.Integer(), nullable=True))
    op.add_column("properties", sa.Column("maximum_term_months", sa.Integer(), nullable=True))
    op.execute("UPDATE properties SET price_frequency = 'Monthly' WHERE listing_type IN ('Rent', 'Lease')")

    op.add_column("property_offers", sa.Column("price_frequency", sa.String(20), nullable=False, server_default="One-time"))
    op.execute("UPDATE property_offers po SET price_frequency = p.price_frequency FROM property_matches pm JOIN properties p ON p.id = pm.property_id WHERE po.property_match_id = pm.id")

    op.add_column("buyer_requirements", sa.Column("budget_frequency", sa.String(20), nullable=False, server_default="One-time"))
    op.add_column("buyer_requirements", sa.Column("min_duration_months", sa.Integer(), nullable=True))
    op.add_column("buyer_requirements", sa.Column("max_duration_months", sa.Integer(), nullable=True))
    op.execute("UPDATE buyer_requirements SET budget_frequency = 'Monthly' WHERE requirement_type IN ('Rent', 'Lease')")

    op.create_table(
        "rental_agreements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("properties.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("lead_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("leads.id", ondelete="SET NULL")),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contacts.id", ondelete="SET NULL")),
        sa.Column("buyer_requirement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("buyer_requirements.id", ondelete="SET NULL")),
        sa.Column("property_match_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("property_matches.id", ondelete="SET NULL")),
        sa.Column("accepted_offer_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("property_offers.id", ondelete="SET NULL")),
        sa.Column("agreement_type", sa.String(20), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="Draft"),
        sa.Column("customer_name", sa.String(200), nullable=False),
        sa.Column("customer_email", sa.String(255)),
        sa.Column("customer_phone", sa.String(30)),
        sa.Column("rent_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("rent_frequency", sa.String(20), nullable=False, server_default="Monthly"),
        sa.Column("deposit_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("maintenance_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("maintenance_frequency", sa.String(20), nullable=False, server_default="Monthly"),
        sa.Column("agreement_start", sa.Date(), nullable=False),
        sa.Column("agreement_end", sa.Date()),
        sa.Column("lock_in_months", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notice_period_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("due_day", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("escalation_percentage", sa.Numeric(5, 2)),
        sa.Column("escalation_interval_months", sa.Integer()),
        sa.Column("escalation_base_date", sa.Date()),
        sa.Column("agreement_document_url", sa.Text()),
        sa.Column("signed_at", sa.DateTime()),
        sa.Column("customer_signed_at", sa.DateTime()),
        sa.Column("customer_signature_name", sa.String(200)),
        sa.Column("activated_at", sa.DateTime()),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("agreement_type IN ('Rent', 'Lease')", name="ck_rental_agreement_type"),
        sa.CheckConstraint("status IN ('Draft', 'Pending Signature', 'Active', 'Termination Requested', 'Expired', 'Terminated', 'Completed', 'Cancelled')", name="ck_rental_agreement_status"),
        sa.CheckConstraint("rent_amount > 0", name="ck_rental_agreement_rent_positive"),
        sa.CheckConstraint("deposit_amount >= 0", name="ck_rental_agreement_deposit_nonnegative"),
        sa.CheckConstraint("lock_in_months >= 0 AND notice_period_days >= 0", name="ck_rental_agreement_terms_nonnegative"),
        sa.CheckConstraint("due_day >= 1 AND due_day <= 28", name="ck_rental_agreement_due_day"),
    )
    op.create_index("ix_rental_agreements_tenant_status", "rental_agreements", ["tenant_id", "status"])
    op.create_index("ix_rental_agreements_tenant_property", "rental_agreements", ["tenant_id", "property_id"])
    op.create_index("ix_rental_agreements_tenant_customer", "rental_agreements", ["tenant_id", "contact_id"])
    op.create_index("uq_rental_agreements_one_active_property", "rental_agreements", ["tenant_id", "property_id"], unique=True, postgresql_where=sa.text("status IN ('Active', 'Termination Requested')"))

    op.create_table(
        "rental_payment_schedules",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agreement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rental_agreements.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("charge_type", sa.String(30), nullable=False, server_default="Rent"),
        sa.Column("period_start", sa.Date(), nullable=False),
        sa.Column("period_end", sa.Date(), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="Pending"),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "agreement_id", "sequence", name="uq_rental_schedule_sequence"),
        sa.CheckConstraint("amount > 0", name="ck_rental_schedule_amount_positive"),
        sa.CheckConstraint("status IN ('Pending', 'Partially Paid', 'Paid', 'Overdue', 'Cancelled')", name="ck_rental_schedule_status"),
    )
    op.create_index("ix_rental_schedule_tenant_due", "rental_payment_schedules", ["tenant_id", "due_date", "status"])

    op.create_table(
        "rental_payments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agreement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rental_agreements.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("schedule_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rental_payment_schedules.id", ondelete="SET NULL")),
        sa.Column("settlement_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("payment_type", sa.String(30), nullable=False, server_default="Rent"),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("payment_method", sa.String(30), nullable=False),
        sa.Column("transaction_reference", sa.String(255)),
        sa.Column("proof_document_url", sa.Text()),
        sa.Column("receipt_number", sa.String(40)),
        sa.Column("payment_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="Pending"),
        sa.Column("verified_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("verified_at", sa.DateTime()),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "receipt_number", name="uq_rental_payment_receipt_number"),
        sa.CheckConstraint("amount > 0", name="ck_rental_payment_amount_positive"),
        sa.CheckConstraint("payment_type IN ('Rent', 'Deposit', 'Maintenance', 'Other')", name="ck_rental_payment_type"),
        sa.CheckConstraint("status IN ('Pending', 'Under Verification', 'Verified', 'Rejected', 'Failed')", name="ck_rental_payment_status"),
    )
    op.create_index("ix_rental_payments_tenant_agreement", "rental_payments", ["tenant_id", "agreement_id"])
    op.create_index("ix_rental_payments_tenant_status", "rental_payments", ["tenant_id", "status"])

    op.create_table(
        "rental_exit_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agreement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rental_agreements.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("requested_vacate_date", sa.Date(), nullable=False),
        sa.Column("notice_served_date", sa.Date()),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(30), nullable=False, server_default="Requested"),
        sa.Column("early_exit_approved", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("early_exit_charge", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("notice_period_waived", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("notice_shortfall_charge", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("decision_notes", sa.Text()),
        sa.Column("decided_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("decided_at", sa.DateTime()),
        sa.Column("active_request_key", sa.String(20), nullable=False, server_default="OPEN"),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("status IN ('Requested', 'Under Review', 'Approved', 'Rejected', 'Withdrawn', 'Inspection Pending', 'Settlement Pending', 'Closed')", name="ck_rental_exit_status"),
        sa.CheckConstraint("early_exit_charge >= 0 AND notice_shortfall_charge >= 0", name="ck_rental_exit_charge_nonnegative"),
    )
    op.create_index("ix_rental_exit_tenant_status", "rental_exit_requests", ["tenant_id", "status"])
    op.create_index("uq_rental_exit_one_open_request", "rental_exit_requests", ["tenant_id", "agreement_id"], unique=True, postgresql_where=sa.text("status IN ('Requested', 'Under Review', 'Approved', 'Inspection Pending', 'Settlement Pending')"))

    op.create_table(
        "rental_inspections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agreement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rental_agreements.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("exit_request_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rental_exit_requests.id", ondelete="SET NULL")),
        sa.Column("inspection_type", sa.String(20), nullable=False),
        sa.Column("condition", sa.String(30), nullable=False),
        sa.Column("damage_details", sa.Text()),
        sa.Column("damage_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("photographs", postgresql.JSON()),
        sa.Column("meter_readings", postgresql.JSON()),
        sa.Column("inspected_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("inspected_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("tenant_acknowledged", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("tenant_acknowledgement_notes", sa.Text()),
        sa.Column("tenant_acknowledged_at", sa.DateTime()),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("inspection_type IN ('Move In', 'Move Out', 'Periodic')", name="ck_rental_inspection_type"),
        sa.CheckConstraint("damage_amount >= 0", name="ck_rental_inspection_damage_nonnegative"),
    )
    op.create_index("ix_rental_inspections_tenant_agreement", "rental_inspections", ["tenant_id", "agreement_id", "inspection_type"])

    op.create_table(
        "rental_settlements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agreement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rental_agreements.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("exit_request_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rental_exit_requests.id", ondelete="SET NULL")),
        sa.Column("deposit_balance", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("rent_arrears", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("utility_charges", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("damage_charges", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("early_exit_charge", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("notice_shortfall_charge", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("other_charges", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("deductions_total", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("refund_amount", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("amount_due_from_tenant", sa.Numeric(14, 2), nullable=False, server_default="0"),
        sa.Column("status", sa.String(30), nullable=False, server_default="Draft"),
        sa.Column("calculation_snapshot", postgresql.JSON(), nullable=False, server_default=sa.text("'{}'::json")),
        sa.Column("approved_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("approved_at", sa.DateTime()),
        sa.Column("refunded_at", sa.DateTime()),
        sa.Column("refund_reference", sa.String(255)),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "agreement_id", name="uq_rental_settlement_agreement"),
        sa.CheckConstraint("deposit_balance >= 0 AND rent_arrears >= 0 AND utility_charges >= 0 AND damage_charges >= 0 AND early_exit_charge >= 0 AND notice_shortfall_charge >= 0 AND other_charges >= 0", name="ck_rental_settlement_nonnegative"),
        sa.CheckConstraint("refund_amount >= 0 AND amount_due_from_tenant >= 0", name="ck_rental_settlement_result_nonnegative"),
        sa.CheckConstraint("status IN ('Draft', 'Under Review', 'Approved', 'Partially Refunded', 'Refunded', 'Amount Due', 'Partially Collected', 'Collected', 'Cancelled')", name="ck_rental_settlement_status"),
    )

    op.create_foreign_key("fk_rental_payment_settlement", "rental_payments", "rental_settlements", ["settlement_id"], ["id"], ondelete="SET NULL")

    op.create_table(
        "rental_deposit_transactions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agreement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rental_agreements.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("payment_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rental_payments.id", ondelete="SET NULL")),
        sa.Column("settlement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rental_settlements.id", ondelete="SET NULL")),
        sa.Column("direction", sa.String(10), nullable=False),
        sa.Column("transaction_type", sa.String(40), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="Posted"),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("reference", sa.String(255)),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("amount > 0", name="ck_rental_deposit_amount_positive"),
        sa.CheckConstraint("direction IN ('Credit', 'Debit')", name="ck_rental_deposit_direction"),
        sa.CheckConstraint("status IN ('Pending', 'Posted', 'Reversed')", name="ck_rental_deposit_status"),
    )
    op.create_index("ix_rental_deposit_tenant_agreement", "rental_deposit_transactions", ["tenant_id", "agreement_id", "created_at"])

    op.create_table(
        "rental_agreement_revisions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agreement_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("rental_agreements.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("revision_number", sa.Integer(), nullable=False),
        sa.Column("revision_type", sa.String(30), nullable=False, server_default="Renewal"),
        sa.Column("old_end_date", sa.Date()),
        sa.Column("new_end_date", sa.Date(), nullable=False),
        sa.Column("old_rent_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("new_rent_amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("reason", sa.Text()),
        sa.Column("status", sa.String(20), nullable=False, server_default="Pending"),
        sa.Column("requested_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("decided_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id")),
        sa.Column("decided_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("tenant_id", "agreement_id", "revision_number", name="uq_rental_agreement_revision_number"),
        sa.CheckConstraint("status IN ('Pending', 'Approved', 'Rejected', 'Cancelled')", name="ck_rental_revision_status"),
    )
    op.create_index("ix_rental_agreement_revisions_tenant_agreement", "rental_agreement_revisions", ["tenant_id", "agreement_id"])


def downgrade():
    op.drop_index("ix_rental_agreement_revisions_tenant_agreement", table_name="rental_agreement_revisions")
    op.drop_table("rental_agreement_revisions")
    op.drop_index("ix_rental_deposit_tenant_agreement", table_name="rental_deposit_transactions")
    op.drop_table("rental_deposit_transactions")
    op.drop_constraint("fk_rental_payment_settlement", "rental_payments", type_="foreignkey")
    op.drop_column("rental_payments", "settlement_id")
    op.drop_table("rental_settlements")
    op.drop_index("ix_rental_inspections_tenant_agreement", table_name="rental_inspections")
    op.drop_table("rental_inspections")
    op.drop_index("uq_rental_exit_one_open_request", table_name="rental_exit_requests")
    op.drop_index("ix_rental_exit_tenant_status", table_name="rental_exit_requests")
    op.drop_table("rental_exit_requests")
    op.drop_index("ix_rental_payments_tenant_status", table_name="rental_payments")
    op.drop_index("ix_rental_payments_tenant_agreement", table_name="rental_payments")
    op.drop_table("rental_payments")
    op.drop_index("ix_rental_schedule_tenant_due", table_name="rental_payment_schedules")
    op.drop_table("rental_payment_schedules")
    op.drop_index("uq_rental_agreements_one_active_property", table_name="rental_agreements")
    op.drop_index("ix_rental_agreements_tenant_customer", table_name="rental_agreements")
    op.drop_index("ix_rental_agreements_tenant_property", table_name="rental_agreements")
    op.drop_index("ix_rental_agreements_tenant_status", table_name="rental_agreements")
    op.drop_table("rental_agreements")
    op.drop_column("buyer_requirements", "max_duration_months")
    op.drop_column("buyer_requirements", "min_duration_months")
    op.drop_column("buyer_requirements", "budget_frequency")
    op.drop_column("property_offers", "price_frequency")
    op.drop_column("properties", "maximum_term_months")
    op.drop_column("properties", "minimum_term_months")
    op.drop_column("properties", "security_deposit")
    op.drop_column("properties", "price_frequency")
