"""Enforce tenant-unique software invoice payment references.

Revision ID: d1f4a9c82b71
Revises: 887c3a054365
Create Date: 2026-10-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "d1f4a9c82b71"
down_revision: Union[str, Sequence[str], None] = "887c3a054365"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


INDEX_NAME = "uq_software_invoice_payments_tenant_reference"


def upgrade() -> None:
    """Add a case-insensitive, tenant-scoped unique payment-reference index.

    Existing duplicate references are deliberately not deleted or rewritten.
    Resolve any reported duplicates as accounting/test-data corrections before
    rerunning this migration.
    """
    connection = op.get_bind()
    duplicates = connection.execute(sa.text("""
        SELECT tenant_id, lower(btrim(transaction_reference)) AS reference_key,
               COUNT(*) AS duplicate_count
        FROM software_invoice_payments
        WHERE transaction_reference IS NOT NULL
          AND btrim(transaction_reference) <> ''
        GROUP BY tenant_id, lower(btrim(transaction_reference))
        HAVING COUNT(*) > 1
        ORDER BY tenant_id, reference_key
    """)).mappings().all()

    if duplicates:
        details = "; ".join(
            f"tenant={row['tenant_id']}, reference={row['reference_key']!r}, count={row['duplicate_count']}"
            for row in duplicates
        )
        raise RuntimeError(
            "Cannot enforce unique software payment transaction references because "
            "duplicate references already exist. Reconcile these records first: " + details
        )

    op.create_index(
        INDEX_NAME,
        "software_invoice_payments",
        ["tenant_id", sa.text("lower(btrim(transaction_reference))")],
        unique=True,
        postgresql_where=sa.text(
            "transaction_reference IS NOT NULL AND btrim(transaction_reference) <> ''"
        ),
    )


def downgrade() -> None:
    op.drop_index(INDEX_NAME, table_name="software_invoice_payments")
