"""add independent customer chat, participants, messages and assignment history"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "d902_customer_independent_chat"
down_revision = "d901_portal_lifecycle"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "customer_chat_conversations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("portal_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("customer_portal_users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("account_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("accounts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("contact_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("contacts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("original_inviter_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("primary_assignee_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("status", sa.String(30), nullable=False, server_default="Open"),
        sa.Column("customer_last_read_at", sa.DateTime(timezone=True)),
        sa.Column("last_message_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("tenant_id", "portal_user_id", name="uq_customer_chat_tenant_portal_user"),
        sa.CheckConstraint("status IN ('Open', 'Needs Reassignment', 'Closed')", name="ck_customer_chat_conversation_status"),
    )
    op.create_index("ix_customer_chat_tenant_assignee_last", "customer_chat_conversations", ["tenant_id", "primary_assignee_user_id", "last_message_at"])

    op.create_table(
        "customer_chat_participants",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("customer_chat_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("is_inviter", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_primary", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("status", sa.String(20), nullable=False, server_default="Active"),
        sa.Column("added_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("removed_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("last_read_at", sa.DateTime(timezone=True)),
        sa.Column("added_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("removed_at", sa.DateTime(timezone=True)),
        sa.UniqueConstraint("conversation_id", "user_id", name="uq_customer_chat_participant_user"),
        sa.CheckConstraint("status IN ('Active', 'Removed', 'Inactive')", name="ck_customer_chat_participant_status"),
    )
    op.create_index("ix_customer_chat_participants_user_status", "customer_chat_participants", ["tenant_id", "user_id", "status"])

    op.create_table(
        "customer_chat_messages",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("customer_chat_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("sender_type", sa.String(20), nullable=False),
        sa.Column("sender_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("sender_portal_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("customer_portal_users.id", ondelete="SET NULL")),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("edited_at", sa.DateTime(timezone=True)),
        sa.Column("deleted_at", sa.DateTime(timezone=True)),
        sa.CheckConstraint("sender_type IN ('Customer', 'Staff', 'System')", name="ck_customer_chat_message_sender_type"),
        sa.CheckConstraint("length(trim(content)) > 0", name="ck_customer_chat_message_content_nonempty"),
    )
    op.create_index("ix_customer_chat_messages_conversation_created", "customer_chat_messages", ["conversation_id", "created_at"])
    op.create_index("ix_customer_chat_messages_tenant_created", "customer_chat_messages", ["tenant_id", "created_at"])

    op.create_table(
        "customer_chat_assignment_history",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("conversation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("customer_chat_conversations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("previous_assignee_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("new_assignee_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("changed_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("reason", sa.String(500)),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_customer_chat_assignment_history_conversation", "customer_chat_assignment_history", ["conversation_id", "created_at"])

    # Backfill existing portal users. The first invitation remains the recorded inviter.
    op.execute(sa.text("""
        INSERT INTO customer_chat_conversations
            (id, tenant_id, portal_user_id, account_id, contact_id, original_inviter_user_id,
             primary_assignee_user_id, status, last_message_at, created_at, updated_at)
        SELECT gen_random_uuid(), p.tenant_id, p.id, p.account_id, p.contact_id,
               inv.invited_by_user_id,
               CASE WHEN u.status = 'Active' THEN inv.invited_by_user_id ELSE NULL END,
               CASE WHEN u.status = 'Active' THEN 'Open' ELSE 'Needs Reassignment' END,
               now(), now(), now()
        FROM customer_portal_users p
        LEFT JOIN LATERAL (
            SELECT i.invited_by_user_id FROM customer_portal_invitations i
            WHERE i.portal_user_id = p.id AND i.tenant_id = p.tenant_id
            ORDER BY i.created_at ASC LIMIT 1
        ) inv ON TRUE
        LEFT JOIN users u ON u.id = inv.invited_by_user_id AND u.tenant_id = p.tenant_id
    """))
    op.execute(sa.text("""
        INSERT INTO customer_chat_participants
            (id, tenant_id, conversation_id, user_id, is_inviter, is_primary, status, added_by_user_id, added_at)
        SELECT gen_random_uuid(), c.tenant_id, c.id, c.original_inviter_user_id, TRUE, TRUE, 'Active', c.original_inviter_user_id, now()
        FROM customer_chat_conversations c
        JOIN users u ON u.id = c.original_inviter_user_id AND u.tenant_id = c.tenant_id AND u.status = 'Active'
        WHERE c.original_inviter_user_id IS NOT NULL
    """))
    op.execute(sa.text("""
        INSERT INTO customer_chat_assignment_history
            (id, tenant_id, conversation_id, previous_assignee_user_id, new_assignee_user_id, changed_by_user_id, reason, created_at)
        SELECT gen_random_uuid(), c.tenant_id, c.id, NULL, c.primary_assignee_user_id,
               c.original_inviter_user_id, 'Backfilled initial assignment to the original portal inviter.', now()
        FROM customer_chat_conversations c
        WHERE c.primary_assignee_user_id IS NOT NULL
    """))


def downgrade():
    op.drop_index("ix_customer_chat_assignment_history_conversation", table_name="customer_chat_assignment_history")
    op.drop_table("customer_chat_assignment_history")
    op.drop_index("ix_customer_chat_messages_tenant_created", table_name="customer_chat_messages")
    op.drop_index("ix_customer_chat_messages_conversation_created", table_name="customer_chat_messages")
    op.drop_table("customer_chat_messages")
    op.drop_index("ix_customer_chat_participants_user_status", table_name="customer_chat_participants")
    op.drop_table("customer_chat_participants")
    op.drop_index("ix_customer_chat_tenant_assignee_last", table_name="customer_chat_conversations")
    op.drop_table("customer_chat_conversations")
