"""invoice numbering, payment reversal and credit notes

Revision ID: c9a47e2d5b13
Revises: f2a8c6d91e40
Create Date: 2026-11-03
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = "c9a47e2d5b13"
down_revision: Union[str, Sequence[str], None] = "f2a8c6d91e40"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

OLD_INDEX = "uq_software_invoice_payments_tenant_reference"
NEW_INDEX = "uq_software_invoice_payments_tenant_method_reference"


def upgrade() -> None:
    # --- gap-free running numbers (INV-2026-0001, CN-2026-0001) ---
    op.create_table(
        "document_sequences",
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("sequence_key", sa.String(length=60), nullable=False),
        sa.Column("last_value", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.PrimaryKeyConstraint("tenant_id", "sequence_key"),
    )

    # --- payments can be reversed instead of deleted ---
    op.add_column(
        "software_invoice_payments",
        sa.Column("status", sa.String(length=20), nullable=False, server_default="Received"),
    )
    op.add_column("software_invoice_payments", sa.Column("reversed_at", sa.DateTime(), nullable=True))
    op.add_column(
        "software_invoice_payments",
        sa.Column("reversed_by", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.add_column("software_invoice_payments", sa.Column("reversal_reason", sa.Text(), nullable=True))
    op.create_foreign_key(
        "fk_software_invoice_payments_reversed_by_users",
        "software_invoice_payments", "users", ["reversed_by"], ["id"],
    )
    op.create_check_constraint(
        "ck_software_invoice_payments_status",
        "software_invoice_payments",
        "status IN ('Received', 'Reversed')",
    )

    # --- reference uniqueness: per payment method, and only while the payment counts ---
    op.drop_index(OLD_INDEX, table_name="software_invoice_payments")
    op.create_index(
        NEW_INDEX,
        "software_invoice_payments",
        [
            "tenant_id",
            sa.text("lower(btrim(payment_method))"),
            sa.text("lower(btrim(transaction_reference))"),
        ],
        unique=True,
        postgresql_where=sa.text(
            "transaction_reference IS NOT NULL "
            "AND btrim(transaction_reference) <> '' "
            "AND status = 'Received'"
        ),
    )

    # --- a fully credited invoice gets its own status ---
    op.drop_constraint("ck_software_invoices_status", "software_invoices", type_="check")
    op.create_check_constraint(
        "ck_software_invoices_status",
        "software_invoices",
        "status IN ('Draft', 'Sent', 'Partially Paid', 'Paid', 'Credited', 'Void')",
    )

    # --- credit notes ---
    op.create_table(
        "software_credit_notes",
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("invoice_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("credit_note_number", sa.String(length=40), nullable=False),
        sa.Column("issue_date", sa.Date(), nullable=False),
        sa.Column("amount", sa.Numeric(14, 2), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("amount > 0", name="ck_software_credit_notes_amount_positive"),
        sa.ForeignKeyConstraint(["tenant_id"], ["tenants.id"]),
        sa.ForeignKeyConstraint(["invoice_id"], ["software_invoices.id"]),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("tenant_id", "credit_note_number", name="uq_software_credit_notes_tenant_number"),
    )
    op.create_index(
        "ix_software_credit_notes_tenant_invoice",
        "software_credit_notes",
        ["tenant_id", "invoice_id"],
    )


def downgrade() -> None:
    op.drop_index("ix_software_credit_notes_tenant_invoice", table_name="software_credit_notes")
    op.drop_table("software_credit_notes")

    op.drop_constraint("ck_software_invoices_status", "software_invoices", type_="check")
    op.create_check_constraint(
        "ck_software_invoices_status",
        "software_invoices",
        "status IN ('Draft', 'Sent', 'Partially Paid', 'Paid', 'Void')",
    )

    op.drop_index(NEW_INDEX, table_name="software_invoice_payments")
    op.create_index(
        OLD_INDEX,
        "software_invoice_payments",
        ["tenant_id", sa.text("lower(btrim(transaction_reference))")],
        unique=True,
        postgresql_where=sa.text(
            "transaction_reference IS NOT NULL AND btrim(transaction_reference) <> ''"
        ),
    )

    op.drop_constraint("ck_software_invoice_payments_status", "software_invoice_payments", type_="check")
    op.drop_constraint("fk_software_invoice_payments_reversed_by_users", "software_invoice_payments", type_="foreignkey")
    op.drop_column("software_invoice_payments", "reversal_reason")
    op.drop_column("software_invoice_payments", "reversed_by")
    op.drop_column("software_invoice_payments", "reversed_at")
    op.drop_column("software_invoice_payments", "status")

    op.drop_table("document_sequences")
