"""payments tables

Revision ID: e9b3023c74c6
Revises: 66cb52aeaba8
Create Date: 2026-10-26 12:23:28.668632
"""

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = "e9b3023c74c6"
down_revision: Union[str, Sequence[str], None] = "66cb52aeaba8"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Upgrade schema."""

    op.create_table(
        "payment_plans",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("booking_id", sa.UUID(), nullable=False),
        sa.Column("total_amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "status IN ('Active', 'Cancelled')",
            name="ck_payment_plans_status_valid",
        ),
        sa.CheckConstraint(
            "total_amount > 0",
            name="ck_payment_plans_total_positive",
        ),
        sa.ForeignKeyConstraint(
            ["booking_id"],
            ["bookings.id"],
            name="fk_payment_plans_booking_id_bookings",
        ),
        sa.ForeignKeyConstraint(
            ["created_by"],
            ["users.id"],
            name="fk_payment_plans_created_by_users",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name="fk_payment_plans_tenant_id_tenants",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "booking_id",
            name="uq_payment_plans_tenant_booking",
        ),
    )

    op.create_index(
        "ix_payment_plans_tenant_status",
        "payment_plans",
        ["tenant_id", "status"],
        unique=False,
    )

    op.create_table(
        "payment_plan_installments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("tenant_id", sa.UUID(), nullable=False),
        sa.Column("payment_plan_id", sa.UUID(), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=150), nullable=False),
        sa.Column("amount", sa.Numeric(precision=14, scale=2), nullable=False),
        sa.Column("due_date", sa.Date(), nullable=False),
        sa.Column("status", sa.String(length=30), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint(
            "status IN ('Pending', 'Partially Paid', 'Paid', 'Overdue')",
            name="ck_payment_plan_installment_status_valid",
        ),
        sa.CheckConstraint(
            "amount > 0",
            name="ck_payment_plan_installment_amount_positive",
        ),
        sa.CheckConstraint(
            "sequence > 0",
            name="ck_payment_plan_installment_sequence_positive",
        ),
        sa.ForeignKeyConstraint(
            ["payment_plan_id"],
            ["payment_plans.id"],
            name="fk_payment_plan_installments_plan_id_payment_plans",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tenant_id"],
            ["tenants.id"],
            name="fk_payment_plan_installments_tenant_id_tenants",
        ),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "tenant_id",
            "payment_plan_id",
            "sequence",
            name="uq_payment_plan_installment_sequence",
        ),
    )

    op.create_index(
        "ix_payment_plan_installments_tenant_due_date",
        "payment_plan_installments",
        ["tenant_id", "due_date"],
        unique=False,
    )

    # Add nullable first so existing bookings are not rejected.
    op.add_column(
        "bookings",
        sa.Column("payment_preference", sa.String(length=30), nullable=True),
    )

    # Existing bookings retain their validity with a full-payment default.
    op.execute(
        "UPDATE bookings "
        "SET payment_preference = 'Full' "
        "WHERE payment_preference IS NULL"
    )

    op.alter_column(
        "bookings",
        "payment_preference",
        existing_type=sa.String(length=30),
        nullable=False,
    )

    op.add_column(
        "bookings",
        sa.Column("installment_request_notes", sa.Text(), nullable=True),
    )

    op.add_column(
        "payments",
        sa.Column("installment_id", sa.UUID(), nullable=True),
    )

    op.create_index(
        "ix_payments_installment_id",
        "payments",
        ["installment_id"],
        unique=False,
    )

    op.create_foreign_key(
        "fk_payments_installment_id_payment_plan_installments",
        "payments",
        "payment_plan_installments",
        ["installment_id"],
        ["id"],
    )


def downgrade() -> None:
    """Downgrade schema."""

    op.drop_constraint(
        "fk_payments_installment_id_payment_plan_installments",
        "payments",
        type_="foreignkey",
    )

    op.drop_index(
        "ix_payments_installment_id",
        table_name="payments",
    )

    op.drop_column("payments", "installment_id")

    op.drop_column("bookings", "installment_request_notes")
    op.drop_column("bookings", "payment_preference")

    op.drop_index(
        "ix_payment_plan_installments_tenant_due_date",
        table_name="payment_plan_installments",
    )

    op.drop_table("payment_plan_installments")

    op.drop_index(
        "ix_payment_plans_tenant_status",
        table_name="payment_plans",
    )

    op.drop_table("payment_plans")
