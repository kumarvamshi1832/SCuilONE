
from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "f2a9d4c8e105"
down_revision = "e4b9c2f7a108"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("tenants", sa.Column("business_type", sa.String(length=40), nullable=True))
    op.create_check_constraint(
        "ck_tenants_business_type_valid",
        "tenants",
        "business_type IS NULL OR business_type IN ('real_estate_company', 'real_estate_agency')",
    )
    op.create_index("ix_tenants_industry_business_type", "tenants", ["industry", "business_type"])

    op.execute(
        sa.text(
            "UPDATE tenants SET business_type = 'real_estate_company' "
            "WHERE business_type IS NULL AND lower(replace(trim(industry), '-', ' ')) IN ('real estate', 'realestate', 'real_estate')"
        )
    )

    op.add_column("pending_registrations", sa.Column("business_type", sa.String(length=40), nullable=True))
    op.add_column("pending_registrations", sa.Column("rera_registration_number", sa.String(length=100), nullable=True))
    op.add_column("pending_registrations", sa.Column("city", sa.String(length=100), nullable=True))
    op.add_column("pending_registrations", sa.Column("state", sa.String(length=100), nullable=True))
    op.add_column("pending_registrations", sa.Column("office_address", sa.Text(), nullable=True))

    op.create_table(
        "real_estate_business_profiles",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("business_type", sa.String(length=40), nullable=False),
        sa.Column("legal_name", sa.String(length=200), nullable=False),
        sa.Column("display_name", sa.String(length=200), nullable=False),
        sa.Column("rera_registration_number", sa.String(length=100), nullable=True),
        sa.Column("gst_number", sa.String(length=40), nullable=True),
        sa.Column("pan_number", sa.String(length=20), nullable=True),
        sa.Column("website", sa.String(length=255), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("state", sa.String(length=100), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=False, server_default="India"),
        sa.Column("office_address", sa.Text(), nullable=True),
        sa.Column("operating_cities", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("specializations", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("verification_status", sa.String(length=30), nullable=False, server_default="Unverified"),
        sa.Column("conversion_locked", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_converted_at", sa.DateTime(), nullable=True),
        sa.Column("last_converted_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("business_type IN ('real_estate_company', 'real_estate_agency')", name="ck_re_profile_business_type"),
        sa.CheckConstraint("verification_status IN ('Unverified', 'Pending', 'Verified', 'Rejected')", name="ck_re_profile_verification_status"),
    )
    op.create_index("ix_re_profile_business_type_city", "real_estate_business_profiles", ["business_type", "city"])

    op.create_table(
        "agencies",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("agency_code", sa.String(length=40), nullable=False, unique=True),
        sa.Column("legal_name", sa.String(length=200), nullable=False),
        sa.Column("display_name", sa.String(length=200), nullable=False),
        sa.Column("primary_contact_name", sa.String(length=150), nullable=False),
        sa.Column("verified_email", sa.String(length=255), nullable=False, unique=True),
        sa.Column("verified_phone", sa.String(length=30), nullable=False),
        sa.Column("rera_registration_number", sa.String(length=100), nullable=True),
        sa.Column("gst_number", sa.String(length=40), nullable=True),
        sa.Column("city", sa.String(length=100), nullable=True),
        sa.Column("state", sa.String(length=100), nullable=True),
        sa.Column("country", sa.String(length=100), nullable=False, server_default="India"),
        sa.Column("office_address", sa.Text(), nullable=True),
        sa.Column("operating_mode", sa.String(length=30), nullable=False, server_default="free_external"),
        sa.Column("tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, unique=True),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="Active"),
        sa.Column("max_free_team_members", sa.Integer(), nullable=False, server_default="3"),
        sa.Column("upgraded_to_paid_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("operating_mode IN ('free_external', 'paid_tenant')", name="ck_agencies_operating_mode"),
        sa.CheckConstraint("status IN ('Active', 'Suspended', 'Inactive')", name="ck_agencies_status"),
        sa.CheckConstraint(
            "(operating_mode = 'free_external' AND tenant_id IS NULL) OR (operating_mode = 'paid_tenant' AND tenant_id IS NOT NULL)",
            name="ck_agencies_mode_tenant_consistency",
        ),
    )
    op.create_index("ix_agencies_verified_phone", "agencies", ["verified_phone"])
    op.create_index("ix_agencies_mode_status", "agencies", ["operating_mode", "status"])

    op.create_table(
        "agency_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True, unique=True),
        sa.Column("full_name", sa.String(length=150), nullable=False),
        sa.Column("email", sa.String(length=255), nullable=False),
        sa.Column("phone", sa.String(length=30), nullable=True),
        sa.Column("password_hash", sa.String(length=255), nullable=True),
        sa.Column("role", sa.String(length=30), nullable=False, server_default="agency_owner"),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="Active"),
        sa.Column("last_login_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("agency_id", "email", name="uq_agency_members_agency_email"),
        sa.CheckConstraint("role IN ('agency_owner', 'agency_agent')", name="ck_agency_members_role"),
        sa.CheckConstraint("status IN ('Active', 'Invited', 'Inactive')", name="ck_agency_members_status"),
    )
    op.create_index("ix_agency_members_agency_id", "agency_members", ["agency_id"])
    op.create_index("ix_agency_members_email", "agency_members", ["email"])

    op.create_table(
        "agency_sessions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agency_member_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agency_members.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_agency_sessions_member_revoked", "agency_sessions", ["agency_member_id", "revoked"])

    op.create_table(
        "agency_invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("company_tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("invited_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("existing_agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="SET NULL"), nullable=True),
        sa.Column("invited_agency_name", sa.String(length=200), nullable=False),
        sa.Column("invited_contact_name", sa.String(length=150), nullable=False),
        sa.Column("invited_email", sa.String(length=255), nullable=False),
        sa.Column("invited_phone", sa.String(length=30), nullable=False),
        sa.Column("business_details", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("token_hash", sa.String(length=64), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("opened_at", sa.DateTime(), nullable=True),
        sa.Column("used_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("onboarding_choice", sa.String(length=30), nullable=False, server_default="pending"),
        sa.Column("can_sale", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("can_rent", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("can_lease", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("proposed_sharing_scope", sa.String(length=30), nullable=False, server_default="selected_properties"),
        sa.Column("proposed_property_ids", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("proposed_commission_terms", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("proposed_responsibilities", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("proposed_agreement_text", sa.Text(), nullable=True),
        sa.Column("proposed_start_date", sa.Date(), nullable=True),
        sa.Column("proposed_expiry_date", sa.Date(), nullable=True),
        sa.Column("termination_notice_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="Sent"),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("status IN ('Draft', 'Sent', 'Opened', 'Accepted', 'Rejected', 'Expired', 'Cancelled')", name="ck_agency_invitations_status"),
        sa.CheckConstraint("proposed_sharing_scope IN ('all_eligible', 'selected_properties')", name="ck_agency_invitations_scope"),
        sa.CheckConstraint("onboarding_choice IN ('pending', 'free_external', 'paid_tenant')", name="ck_agency_invitations_onboarding_choice"),
    )
    op.create_index("ix_agency_invitations_company_status", "agency_invitations", ["company_tenant_id", "status"])
    op.create_index("ix_agency_invitations_email", "agency_invitations", ["invited_email"])

    op.create_table(
        "company_agency_connections",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("company_tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("initiated_by", sa.String(length=20), nullable=False),
        sa.Column("invitation_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agency_invitations.id", ondelete="SET NULL"), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="Pending"),
        sa.Column("can_sale", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("can_rent", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("can_lease", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("sharing_scope", sa.String(length=30), nullable=False, server_default="selected_properties"),
        sa.Column("active_agreement_version_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("starts_at", sa.Date(), nullable=True),
        sa.Column("expires_at", sa.Date(), nullable=True),
        sa.Column("termination_notice_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("post_termination_policy", sa.String(length=40), nullable=False, server_default="preserve_active_transactions"),
        sa.Column("activated_at", sa.DateTime(), nullable=True),
        sa.Column("activated_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("suspended_at", sa.DateTime(), nullable=True),
        sa.Column("suspended_reason", sa.Text(), nullable=True),
        sa.Column("terminated_at", sa.DateTime(), nullable=True),
        sa.Column("termination_reason", sa.Text(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("initiated_by IN ('company', 'agency')", name="ck_company_agency_conn_initiated_by"),
        sa.CheckConstraint(
            "status IN ('Draft', 'Sent', 'Pending', 'Counterproposed', 'Agreement Pending', 'Active', 'Rejected', 'Expired', 'Cancelled', 'Suspended', 'Terminated')",
            name="ck_company_agency_conn_status",
        ),
        sa.CheckConstraint("sharing_scope IN ('all_eligible', 'selected_properties')", name="ck_company_agency_conn_scope"),
        sa.CheckConstraint("post_termination_policy IN ('preserve_active_transactions', 'company_direct_takeover')", name="ck_company_agency_conn_post_term_policy"),
    )
    op.create_index("ix_company_agency_conn_company_status", "company_agency_connections", ["company_tenant_id", "status"])
    op.create_index("ix_company_agency_conn_agency_status", "company_agency_connections", ["agency_id", "status"])
    op.create_index(
        "uq_active_company_agency_connection",
        "company_agency_connections",
        ["company_tenant_id", "agency_id"],
        unique=True,
        postgresql_where=sa.text("status NOT IN ('Rejected', 'Expired', 'Cancelled', 'Terminated')"),
    )

    op.create_table(
        "agency_agreement_versions",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company_agency_connections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version_number", sa.Integer(), nullable=False),
        sa.Column("proposed_by_side", sa.String(length=20), nullable=False),
        sa.Column("proposed_by_actor_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("status", sa.String(length=30), nullable=False, server_default="Proposed"),
        sa.Column("can_sale", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("can_rent", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("can_lease", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("sharing_scope", sa.String(length=30), nullable=False, server_default="selected_properties"),
        sa.Column("commission_terms", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("responsibilities", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("agreement_text", sa.Text(), nullable=True),
        sa.Column("effective_from", sa.Date(), nullable=True),
        sa.Column("effective_to", sa.Date(), nullable=True),
        sa.Column("termination_notice_days", sa.Integer(), nullable=False, server_default="30"),
        sa.Column("change_summary", sa.Text(), nullable=True),
        sa.Column("company_accepted_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("company_accepted_at", sa.DateTime(), nullable=True),
        sa.Column("company_signature_name", sa.String(length=150), nullable=True),
        sa.Column("agency_accepted_by", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("agency_accepted_at", sa.DateTime(), nullable=True),
        sa.Column("agency_signature_name", sa.String(length=150), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("connection_id", "version_number", name="uq_agency_agreement_conn_version"),
        sa.CheckConstraint("proposed_by_side IN ('company', 'agency')", name="ck_agency_agreement_side"),
        sa.CheckConstraint("status IN ('Draft', 'Proposed', 'Counterproposed', 'Accepted', 'Superseded', 'Rejected')", name="ck_agency_agreement_status"),
        sa.CheckConstraint("sharing_scope IN ('all_eligible', 'selected_properties')", name="ck_agency_agreement_scope"),
    )
    op.create_index("ix_agency_agreement_conn_status", "agency_agreement_versions", ["connection_id", "status"])
    op.create_foreign_key(
        "fk_conn_active_agreement_ver",
        "company_agency_connections",
        "agency_agreement_versions",
        ["active_agreement_version_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "agency_property_access",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company_agency_connections.id", ondelete="CASCADE"), nullable=False),
        sa.Column("company_tenant_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("properties.id", ondelete="CASCADE"), nullable=False),
        sa.Column("access_status", sa.String(length=20), nullable=False, server_default="Active"),
        sa.Column("granted_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("granted_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_by_user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.UniqueConstraint("connection_id", "property_id", name="uq_agency_property_access_conn_prop"),
        sa.CheckConstraint("access_status IN ('Active', 'Revoked')", name="ck_agency_property_access_status"),
    )
    op.create_index("ix_agency_property_access_agency_status", "agency_property_access", ["agency_id", "access_status"])
    op.create_index("ix_agency_property_access_company_prop", "agency_property_access", ["company_tenant_id", "property_id", "access_status"])

    op.create_table(
        "agency_notifications",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column("agency_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("agencies.id", ondelete="CASCADE"), nullable=False),
        sa.Column("connection_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("company_agency_connections.id", ondelete="SET NULL"), nullable=True),
        sa.Column("property_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("properties.id", ondelete="SET NULL"), nullable=True),
        sa.Column("event_type", sa.String(length=60), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("message", sa.Text(), nullable=False),
        sa.Column("payload", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("idempotency_key", sa.String(length=160), nullable=True, unique=True),
        sa.Column("is_read", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("read_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_agency_notifications_agency_read", "agency_notifications", ["agency_id", "is_read", "created_at"])


def downgrade() -> None:
    op.drop_index("ix_agency_notifications_agency_read", table_name="agency_notifications")
    op.drop_table("agency_notifications")

    op.drop_index("ix_agency_property_access_company_prop", table_name="agency_property_access")
    op.drop_index("ix_agency_property_access_agency_status", table_name="agency_property_access")
    op.drop_table("agency_property_access")

    op.drop_constraint("fk_conn_active_agreement_ver", "company_agency_connections", type_="foreignkey")
    op.drop_index("ix_agency_agreement_conn_status", table_name="agency_agreement_versions")
    op.drop_table("agency_agreement_versions")

    op.drop_index("uq_active_company_agency_connection", table_name="company_agency_connections")
    op.drop_index("ix_company_agency_conn_agency_status", table_name="company_agency_connections")
    op.drop_index("ix_company_agency_conn_company_status", table_name="company_agency_connections")
    op.drop_table("company_agency_connections")

    op.drop_index("ix_agency_invitations_email", table_name="agency_invitations")
    op.drop_index("ix_agency_invitations_company_status", table_name="agency_invitations")
    op.drop_table("agency_invitations")

    op.drop_index("ix_agency_sessions_member_revoked", table_name="agency_sessions")
    op.drop_table("agency_sessions")

    op.drop_index("ix_agency_members_email", table_name="agency_members")
    op.drop_index("ix_agency_members_agency_id", table_name="agency_members")
    op.drop_table("agency_members")

    op.drop_index("ix_agencies_mode_status", table_name="agencies")
    op.drop_index("ix_agencies_verified_phone", table_name="agencies")
    op.drop_table("agencies")

    op.drop_index("ix_re_profile_business_type_city", table_name="real_estate_business_profiles")
    op.drop_table("real_estate_business_profiles")

    op.drop_column("pending_registrations", "office_address")
    op.drop_column("pending_registrations", "state")
    op.drop_column("pending_registrations", "city")
    op.drop_column("pending_registrations", "rera_registration_number")
    op.drop_column("pending_registrations", "business_type")

    op.drop_index("ix_tenants_industry_business_type", table_name="tenants")
    op.drop_constraint("ck_tenants_business_type_valid", "tenants", type_="check")
    op.drop_column("tenants", "business_type")
