
"""Add payment status guard and customer booking confirmation audit.

Revision ID: b3c5d7e9f1a2
Revises: a18c9d7e4f20
"""

from alembic import op
import sqlalchemy as sa


revision = "b3c5d7e9f1a2"
down_revision = "a18c9d7e4f20"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    # ---------------------------------------------------------
    # 1. Validate existing payment statuses before adding CHECK.
    # ---------------------------------------------------------
    invalid_statuses = bind.execute(
        sa.text("""
            SELECT DISTINCT status
            FROM payments
            WHERE status IS NULL
               OR status NOT IN (
                   'Pending',
                   'Under Verification',
                   'Verified',
                   'Rejected',
                   'Failed'
               )
        """)
    ).scalars().all()

    if invalid_statuses:
        raise RuntimeError(
            "Cannot add payment status constraint. "
            f"Unsupported existing payment statuses: {invalid_statuses}"
        )

    # ---------------------------------------------------------
    # 2. Add payment status CHECK constraint if missing.
    # ---------------------------------------------------------
    payment_constraints = {
        item["name"]
        for item in inspector.get_check_constraints("payments")
    }

    if "ck_payments_status_valid" not in payment_constraints:
        op.create_check_constraint(
            "ck_payments_status_valid",
            "payments",
            """
            status IN (
                'Pending',
                'Under Verification',
                'Verified',
                'Rejected',
                'Failed'
            )
            """,
        )

    # ---------------------------------------------------------
    # 3. Add final_confirmed_by column if missing.
    # ---------------------------------------------------------
    booking_request_columns = {
        column["name"]
        for column in inspector.get_columns("customer_booking_requests")
    }

    if "final_confirmed_by" not in booking_request_columns:
        op.add_column(
            "customer_booking_requests",
            sa.Column(
                "final_confirmed_by",
                sa.String(length=20),
                nullable=True,
            ),
        )

    # ---------------------------------------------------------
    # 4. Backfill existing confirmed booking requests.
    # ---------------------------------------------------------
    op.execute("""
        UPDATE customer_booking_requests
        SET final_confirmed_by = 'Staff'
        WHERE final_confirmed_at IS NOT NULL
          AND final_confirmed_by IS NULL
    """)

    # ---------------------------------------------------------
    # 5. Validate existing confirmation audit values.
    # ---------------------------------------------------------
    invalid_actors = bind.execute(
        sa.text("""
            SELECT DISTINCT final_confirmed_by
            FROM customer_booking_requests
            WHERE final_confirmed_by IS NOT NULL
              AND final_confirmed_by NOT IN ('Customer', 'Staff')
        """)
    ).scalars().all()

    if invalid_actors:
        raise RuntimeError(
            "Cannot add confirmation audit constraint. "
            f"Unsupported values: {invalid_actors}"
        )

    # ---------------------------------------------------------
    # 6. Add confirmation audit CHECK constraint if missing.
    # ---------------------------------------------------------
    inspector = sa.inspect(bind)

    booking_constraints = {
        item["name"]
        for item in inspector.get_check_constraints(
            "customer_booking_requests"
        )
    }

    if "ck_customer_booking_request_confirmed_by" not in booking_constraints:
        op.create_check_constraint(
            "ck_customer_booking_request_confirmed_by",
            "customer_booking_requests",
            """
            final_confirmed_by IS NULL
            OR final_confirmed_by IN ('Customer', 'Staff')
            """,
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    booking_constraints = {
        item["name"]
        for item in inspector.get_check_constraints(
            "customer_booking_requests"
        )
    }

    if "ck_customer_booking_request_confirmed_by" in booking_constraints:
        op.drop_constraint(
            "ck_customer_booking_request_confirmed_by",
            "customer_booking_requests",
            type_="check",
        )

    booking_columns = {
        column["name"]
        for column in inspector.get_columns("customer_booking_requests")
    }

    if "final_confirmed_by" in booking_columns:
        op.drop_column(
            "customer_booking_requests",
            "final_confirmed_by",
        )

    inspector = sa.inspect(bind)

    payment_constraints = {
        item["name"]
        for item in inspector.get_check_constraints("payments")
    }

    if "ck_payments_status_valid" in payment_constraints:
        op.drop_constraint(
            "ck_payments_status_valid",
            "payments",
            type_="check",
        )
