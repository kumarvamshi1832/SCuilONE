"""customer portal lifecycle: notifications, cancellation, handover and after-sales"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d901_portal_lifecycle"
down_revision = "c301_customer_booking_journey"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "customer_portal_notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("portal_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("customer_portal_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("notification_type", sa.String(60), nullable=False, server_default="general"),
        sa.Column("related_module", sa.String(60)),
        sa.Column("related_record_id", postgresql.UUID(as_uuid=True)),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_customer_portal_notifications_user_created", "customer_portal_notifications", ["tenant_id", "portal_user_id", "created_at"])
    op.create_index("ix_customer_portal_notifications_user_unread", "customer_portal_notifications", ["tenant_id", "portal_user_id", "is_read"])

    op.create_table(
        "customer_booking_cancellation_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("portal_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("customer_portal_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="Pending"),
        sa.Column("staff_notes", sa.Text()),
        sa.Column("reviewed_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("reviewed_at", sa.DateTime()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("status IN ('Pending', 'Approved', 'Rejected', 'Withdrawn')", name="ck_customer_booking_cancellation_status"),
    )
    op.create_index("ix_customer_booking_cancellation_tenant_status", "customer_booking_cancellation_requests", ["tenant_id", "status", "created_at"])
    op.create_index("uq_customer_booking_cancellation_pending", "customer_booking_cancellation_requests", ["tenant_id", "booking_id"], unique=True, postgresql_where=sa.text("status = 'Pending'"))

    op.create_table(
        "property_handovers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("properties.id"), nullable=False),
        sa.Column("portal_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("customer_portal_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(20), nullable=False, server_default="Pending"),
        sa.Column("scheduled_at", sa.DateTime()),
        sa.Column("checklist", sa.JSON(), nullable=False, server_default=sa.text("'[]'")),
        sa.Column("customer_notes", sa.Text()),
        sa.Column("staff_notes", sa.Text()),
        sa.Column("customer_acknowledged_at", sa.DateTime()),
        sa.Column("completed_at", sa.DateTime()),
        sa.Column("created_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("status IN ('Pending', 'Scheduled', 'In Progress', 'Completed', 'On Hold')", name="ck_property_handovers_status"),
        sa.UniqueConstraint("tenant_id", "booking_id", name="uq_property_handovers_tenant_booking"),
    )
    op.create_index("ix_property_handovers_tenant_status", "property_handovers", ["tenant_id", "status"])

    op.create_table(
        "customer_property_service_requests",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("portal_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("customer_portal_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("booking_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("bookings.id", ondelete="CASCADE"), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("properties.id"), nullable=False),
        sa.Column("category", sa.String(60), nullable=False),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("priority", sa.String(20), nullable=False, server_default="Medium"),
        sa.Column("status", sa.String(30), nullable=False, server_default="Open"),
        sa.Column("assigned_to", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("resolution", sa.Text()),
        sa.Column("staff_notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("closed_at", sa.DateTime()),
        sa.CheckConstraint("status IN ('Open', 'In Progress', 'Waiting on Customer', 'Resolved', 'Closed', 'Rejected')", name="ck_customer_property_service_status"),
        sa.CheckConstraint("priority IN ('Low', 'Medium', 'High', 'Urgent')", name="ck_customer_property_service_priority"),
    )
    op.create_index("ix_customer_property_service_tenant_status", "customer_property_service_requests", ["tenant_id", "status", "created_at"])


def downgrade():
    op.drop_index("ix_customer_property_service_tenant_status", table_name="customer_property_service_requests")
    op.drop_table("customer_property_service_requests")
    op.drop_index("ix_property_handovers_tenant_status", table_name="property_handovers")
    op.drop_table("property_handovers")
    op.drop_index("uq_customer_booking_cancellation_pending", table_name="customer_booking_cancellation_requests")
    op.drop_index("ix_customer_booking_cancellation_tenant_status", table_name="customer_booking_cancellation_requests")
    op.drop_table("customer_booking_cancellation_requests")
    op.drop_index("ix_customer_portal_notifications_user_unread", table_name="customer_portal_notifications")
    op.drop_index("ix_customer_portal_notifications_user_created", table_name="customer_portal_notifications")
    op.drop_table("customer_portal_notifications")
