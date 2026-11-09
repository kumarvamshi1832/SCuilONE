import uuid
from datetime import datetime, date
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class PlatformIndustryTeam(Base):
    """Represents one of the 10 Industry Teams at the platform level, each holding the 7 reusable industry roles."""

    __tablename__ = "platform_industry_teams"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    industry_key: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    max_members: Mapped[int] = mapped_column(Integer, nullable=False, default=7, server_default="7")
    manager_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    team_admin_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    sla_response_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60, server_default="60")
    sla_resolution_hours: Mapped[int] = mapped_column(Integer, nullable=False, default=24, server_default="24")
    allocated_budget: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00"), server_default="0.00"
    )
    spent_budget: Mapped[Decimal] = mapped_column(
        Numeric(14, 2), nullable=False, default=Decimal("0.00"), server_default="0.00"
    )
    config_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PlatformEmployee(Base):
    """Platform-level employee metadata linking a User to either a Central Platform Role (11) or Industry Team Role (7)."""

    __tablename__ = "platform_employees"

    __table_args__ = (
        Index("ix_platform_employees_scope_role", "role_scope", "role_name"),
        Index("ix_platform_employees_industry_key", "industry_key"),
        Index("ix_platform_employees_team_id", "industry_team_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    employee_code: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    role_scope: Mapped[str] = mapped_column(
        String(30), nullable=False, default="platform", server_default="platform"
    )  # "platform" (11 central roles) or "industry_team" (7 reusable industry roles)
    role_name: Mapped[str] = mapped_column(String(100), nullable=False)
    industry_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    industry_team_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_industry_teams.id", ondelete="SET NULL"), nullable=True
    )
    manager_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    department: Mapped[str | None] = mapped_column(String(100), nullable=True)
    availability_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Available", server_default="Available"
    )
    max_ticket_load: Mapped[int] = mapped_column(Integer, nullable=False, default=25, server_default="25")
    is_platform_owner: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PlatformSubscriptionPlan(Base):
    """Subscription tiers managed by Platform Super Admin / Billing."""

    __tablename__ = "platform_subscription_plans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    plan_key: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    billing_cycle: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Monthly", server_default="Monthly"
    )
    price: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0.00"
    )
    annual_price: Mapped[Decimal | None] = mapped_column(
        Numeric(12, 2), nullable=True
    )
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR", server_default="INR")
    trial_days: Mapped[int] = mapped_column(Integer, nullable=False, default=14, server_default="14")
    max_users: Mapped[int] = mapped_column(Integer, nullable=False, default=10, server_default="10")
    max_branches: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    storage_limit_gb: Mapped[int] = mapped_column(Integer, nullable=False, default=10, server_default="10")
    features_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    enabled_modules_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    limits_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PlatformTenantSubscription(Base):
    """Tracks each customer tenant's subscription, status, trial, plan selection, and renewal."""

    __tablename__ = "platform_tenant_subscriptions"

    __table_args__ = (
        Index("ix_platform_tenant_subs_tenant", "tenant_id"),
        Index("ix_platform_tenant_subs_status", "status"),
        Index("ix_platform_tenant_subs_renewal_date", "renewal_date"),
        Index("ix_platform_tenant_subs_trial_end", "trial_end_date"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    plan_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_subscription_plans.id", ondelete="RESTRICT"), nullable=False
    )
    selected_plan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_subscription_plans.id", ondelete="SET NULL"), nullable=True
    )
    selected_billing_cycle: Mapped[str | None] = mapped_column(
        String(30), nullable=True
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Trial", server_default="Trial"
    )  # Trial, Active, Past Due, Suspended, Cancelled, Expired
    billing_cycle: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Monthly", server_default="Monthly"
    )
    auto_renew: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    trial_start_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    starts_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    renewal_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    grace_period_ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    suspended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    suspension_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    expired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    cancelled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    activated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_complimentary: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    applied_limits_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    usage_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PlatformBillingInvoice(Base):
    """Customer company SaaS subscription invoices managed by Platform Billing & Finance."""

    __tablename__ = "platform_billing_invoices"

    __table_args__ = (
        Index("ix_platform_billing_invoices_tenant", "tenant_id"),
        Index("ix_platform_billing_invoices_status", "status"),
        Index("ix_platform_billing_invoices_sub", "subscription_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_tenant_subscriptions.id", ondelete="SET NULL"), nullable=True
    )
    plan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_subscription_plans.id", ondelete="SET NULL"), nullable=True
    )
    billing_cycle: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Monthly", server_default="Monthly"
    )
    invoice_type: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Subscription", server_default="Subscription"
    )  # Subscription, Renewal
    billing_period_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    billing_period_end: Mapped[date | None] = mapped_column(Date, nullable=True)
    amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0.00"
    )
    tax_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0.00"
    )
    total_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0.00"
    )
    paid_amount: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0.00"
    )
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR", server_default="INR")
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Issued", server_default="Issued"
    )  # Draft, Issued, Paid, Overdue, Failed, Void, Refunded
    issue_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    due_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    plan_snapshot_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    payment_instructions_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PlatformBillingPayment(Base):
    """Customer subscription manual payment submissions, verification & transaction tracking."""

    __tablename__ = "platform_billing_payments"

    __table_args__ = (
        Index("ix_platform_billing_payments_tenant", "tenant_id"),
        Index("ix_platform_billing_payments_invoice", "invoice_id"),
        Index("ix_platform_billing_payments_status", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_billing_invoices.id", ondelete="CASCADE"), nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(60), nullable=False, default="Manual", server_default="Manual")
    transaction_reference: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR", server_default="INR")
    payment_method: Mapped[str] = mapped_column(
        String(50), nullable=False, default="Bank Transfer", server_default="Bank Transfer"
    )
    payment_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    payment_proof_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    payment_proof_filename: Mapped[str | None] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Submitted", server_default="Submitted"
    )  # Submitted, Under Review, Succeeded, Failed, Rejected, Pending, Refunded
    submitted_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    payment_submitted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    payment_approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    admin_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    failure_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reconciled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    reconciled_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    reconciled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    paid_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PlatformSubscriptionReminderCampaign(Base):
    """Tracks pre-expiration trial reminders (Days 12, 13, 14) and post-trial 30-day campaign (Days 1, 3, 7, 14, 21, 30)."""

    __tablename__ = "platform_subscription_reminder_campaigns"

    __table_args__ = (
        Index("ix_platform_sub_reminder_camp_status", "campaign_status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), unique=True, nullable=False, index=True
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_tenant_subscriptions.id", ondelete="SET NULL"), nullable=True
    )
    campaign_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Trial_Active", server_default="Trial_Active"
    )  # Trial_Active, Post_Trial_Active, Stopped_Subscribed, Completed, Unsubscribed, Cancelled
    trial_end_date: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_day_12_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_day_13_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    trial_day_14_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    post_trial_day_1_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    post_trial_day_3_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    post_trial_day_7_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    post_trial_day_14_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    post_trial_day_21_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    post_trial_day_30_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    retry_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    next_retry_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stopped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    stopped_reason: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PlatformSubscriptionReminderLog(Base):
    """Idempotent delivery log for each individual trial or post-trial reminder email."""

    __tablename__ = "platform_subscription_reminder_logs"

    __table_args__ = (
        UniqueConstraint("subscription_id", "reminder_key", name="uq_platform_sub_reminder_sub_key"),
        Index("ix_platform_sub_reminder_logs_tenant", "tenant_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    subscription_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_tenant_subscriptions.id", ondelete="CASCADE"), nullable=False
    )
    campaign_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_subscription_reminder_campaigns.id", ondelete="CASCADE"), nullable=True
    )
    reminder_key: Mapped[str] = mapped_column(String(50), nullable=False)
    subject: Mapped[str] = mapped_column(String(255), nullable=False)
    recipient_email: Mapped[str] = mapped_column(String(255), nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Sent", server_default="Sent"
    )  # Sent, Failed, Skipped
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class PlatformSubscriptionEvent(Base):
    """Audit and lifecycle event history for tenant subscriptions, invoices, and payments."""

    __tablename__ = "platform_subscription_events"

    __table_args__ = (
        Index("ix_platform_sub_events_tenant", "tenant_id"),
        Index("ix_platform_sub_events_sub", "subscription_id"),
        Index("ix_platform_sub_events_type", "event_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_tenant_subscriptions.id", ondelete="SET NULL"), nullable=True
    )
    invoice_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_billing_invoices.id", ondelete="SET NULL"), nullable=True
    )
    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_billing_payments.id", ondelete="SET NULL"), nullable=True
    )
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    event_type: Mapped[str] = mapped_column(String(60), nullable=False)
    previous_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    new_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class PlatformRefundRequest(Base):
    """Subscription refund requests reviewed/approved by Billing & audited by Finance/Audit."""

    __tablename__ = "platform_refund_requests"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    invoice_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_billing_invoices.id", ondelete="CASCADE"), nullable=False
    )
    payment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_billing_payments.id", ondelete="SET NULL"), nullable=True
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR", server_default="INR")
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Pending", server_default="Pending"
    )  # Pending, Approved, Rejected, Processed
    requested_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    resolution_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    processed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PlatformExpense(Base):
    """Operating expenses & industry team expense requests managed by Platform Finance and Team Finance."""

    __tablename__ = "platform_expenses"

    __table_args__ = (
        Index("ix_platform_expenses_industry_status", "industry_key", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    expense_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    category: Mapped[str] = mapped_column(
        String(80), nullable=False, default="Operations", server_default="Operations"
    )  # Cloud Infrastructure, Marketing, Training, Operations, Tooling, Payroll, Other
    industry_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    industry_team_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_industry_teams.id", ondelete="SET NULL"), nullable=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(12, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False, default="INR", server_default="INR")
    expense_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Pending", server_default="Pending"
    )  # Pending, Approved, Rejected, Paid, Reconciled
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    requested_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    reconciled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PlatformSalesProspect(Base):
    """Platform-level B2B customer acquisition leads, prospects, pipeline opportunities, demos, and onboarding."""

    __tablename__ = "platform_sales_prospects"

    __table_args__ = (
        Index("ix_platform_sales_industry_stage", "industry_key", "pipeline_stage"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    company_name: Mapped[str] = mapped_column(String(180), nullable=False)
    contact_name: Mapped[str] = mapped_column(String(150), nullable=False)
    contact_email: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    industry_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    lead_status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="New", server_default="New"
    )  # New, Contacted, Qualified, Unqualified, Converted
    pipeline_stage: Mapped[str] = mapped_column(
        String(30), nullable=False, default="New", server_default="New"
    )  # New, Qualified, Demo, Negotiation, Won, Lost
    interest_level: Mapped[str] = mapped_column(
        String(20), nullable=False, default="Medium", server_default="Medium"
    )  # Low, Medium, High
    estimated_mrr: Mapped[Decimal] = mapped_column(
        Numeric(12, 2), nullable=False, default=Decimal("0.00"), server_default="0.00"
    )
    recommended_plan: Mapped[str | None] = mapped_column(String(60), nullable=True)
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    demo_scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    demo_outcome: Mapped[str | None] = mapped_column(Text, nullable=True)
    next_follow_up_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    onboarding_status: Mapped[str] = mapped_column(
        String(40), nullable=False, default="Not Started", server_default="Not Started"
    )  # Not Started, Setup In Progress, Initial Configuration, Handed Over to Support, Completed
    converted_tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True
    )
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PlatformSupportTicketMeta(Base):
    """Platform-level routing, SLA, issue type, and escalation metadata for customer support tickets."""

    __tablename__ = "platform_support_ticket_meta"

    __table_args__ = (
        Index("ix_platform_ticket_meta_industry_queue", "industry_key", "routing_queue"),
        Index("ix_platform_ticket_meta_escalated", "is_escalated", "escalation_target"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ticket_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("support_tickets.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False
    )
    industry_key: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    industry_team_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_industry_teams.id", ondelete="SET NULL"), nullable=True
    )
    issue_type: Mapped[str] = mapped_column(
        String(40), nullable=False, default="Support", server_default="Support"
    )  # Support (usage questions), Technical (software bugs), Billing (subscription issues)
    routing_queue: Mapped[str] = mapped_column(
        String(50), nullable=False, default="Industry Support", server_default="Industry Support"
    )  # Industry Support, Team Manager, Platform Support, Technical, Billing
    assigned_employee_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    is_escalated: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    escalation_target: Mapped[str | None] = mapped_column(
        String(50), nullable=True
    )  # Team Manager, Platform Manager, Technical, Billing
    escalation_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    escalated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    escalated_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sla_response_due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sla_resolution_due_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    first_responded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    sla_breached: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    audit_reviewed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="false")
    audit_review_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    audit_reviewed_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    history_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PlatformKnowledgeArticle(Base):
    """Knowledge base articles, troubleshooting guides, and FAQs for Platform Support & Industry Support."""

    __tablename__ = "platform_knowledge_articles"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    slug: Mapped[str] = mapped_column(String(160), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(220), nullable=False)
    category: Mapped[str] = mapped_column(
        String(80), nullable=False, default="Troubleshooting", server_default="Troubleshooting"
    )
    industry_key: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tags_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    is_published: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default="true")
    author_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PlatformTechnicalIncident(Base):
    """Tracks outages, software bugs, deployments, and automatic/manual technical incidents."""

    __tablename__ = "platform_technical_incidents"

    __table_args__ = (
        Index(
            "ix_platform_tech_incidents_fingerprint_status",
            "service_name",
            "error_fingerprint",
            "environment",
            "status",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    incident_number: Mapped[str] = mapped_column(String(50), unique=True, nullable=False)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    incident_type: Mapped[str] = mapped_column(
        String(40), nullable=False, default="Incident", server_default="Incident"
    )  # Incident, Outage, ErrorLog, Deployment
    service_name: Mapped[str] = mapped_column(
        String(80), nullable=False, default="API Gateway", server_default="API Gateway", index=True
    )
    severity: Mapped[str] = mapped_column(
        String(20), nullable=False, default="Medium", server_default="Medium"
    )  # Low, Medium, High, Critical
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Investigating", server_default="Investigating", index=True
    )  # Investigating, Identified, Monitoring, Resolved, Deployed
    environment: Mapped[str] = mapped_column(
        String(40), nullable=False, default="production", server_default="production"
    )
    error_fingerprint: Mapped[str | None] = mapped_column(String(160), nullable=True, index=True)
    detection_source: Mapped[str] = mapped_column(
        String(30), nullable=False, default="manual", server_default="manual"
    )  # automatic, manual
    version_tag: Mapped[str | None] = mapped_column(String(40), nullable=True)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    recovery_actions: Mapped[str | None] = mapped_column(Text, nullable=True)
    first_occurrence_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_occurrence_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    occurrence_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    affected_endpoint: Mapped[str | None] = mapped_column(String(255), nullable=True)
    affected_tenant_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    affected_tenant_ids_json: Mapped[list] = mapped_column(JSONB, nullable=False, default=list, server_default="[]")
    diagnostics_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    consecutive_healthy_checks: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    recovery_detected_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    recovery_evidence_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    last_notified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_notified_severity: Mapped[str | None] = mapped_column(String(20), nullable=True)
    notification_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    related_ticket_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("support_tickets.id", ondelete="SET NULL"), nullable=True
    )
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PlatformErrorLog(Base):
    """Centralized, secret-redacted structured error logs for unexpected application and service failures."""

    __tablename__ = "platform_error_logs"

    __table_args__ = (
        Index("ix_platform_error_logs_service_fp", "service_name", "error_fingerprint"),
        Index("ix_platform_error_logs_last_seen", "last_seen_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_code: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    service_name: Mapped[str] = mapped_column(
        String(80), nullable=False, default="API Gateway", server_default="API Gateway", index=True
    )
    environment: Mapped[str] = mapped_column(
        String(40), nullable=False, default="production", server_default="production"
    )
    endpoint: Mapped[str | None] = mapped_column(String(255), nullable=True, index=True)
    http_method: Mapped[str | None] = mapped_column(String(16), nullable=True)
    http_status_code: Mapped[int | None] = mapped_column(Integer, nullable=True, index=True)
    exception_type: Mapped[str] = mapped_column(String(120), nullable=False)
    error_fingerprint: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    safe_message: Mapped[str] = mapped_column(Text, nullable=False)
    redacted_stack_trace: Mapped[str | None] = mapped_column(Text, nullable=True)
    correlation_id: Mapped[str | None] = mapped_column(String(80), nullable=True, index=True)
    tenant_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="SET NULL"), nullable=True, index=True
    )
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    occurrence_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    first_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=datetime.utcnow)
    related_incident_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("platform_technical_incidents.id", ondelete="SET NULL"), nullable=True
    )
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)


class PlatformServiceHealthCheck(Base):
    """Persistent health-check history for real uptime and latency calculation across monitored services."""

    __tablename__ = "platform_service_health_checks"

    __table_args__ = (
        Index("ix_platform_health_checks_service_checked", "service_name", "checked_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    service_name: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    environment: Mapped[str] = mapped_column(
        String(40), nullable=False, default="production", server_default="production"
    )
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Healthy", server_default="Healthy", index=True
    )  # Healthy, Degraded, Unavailable
    latency_ms: Mapped[Decimal] = mapped_column(
        Numeric(10, 2), nullable=False, default=Decimal("0.00"), server_default="0.00"
    )
    details_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    checked_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True
    )


class PlatformWorkerHeartbeat(Base):
    """Tracks background worker availability, heartbeat timestamps, and scheduled job execution outcomes."""

    __tablename__ = "platform_worker_heartbeats"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    worker_name: Mapped[str] = mapped_column(String(100), unique=True, nullable=False, index=True)
    hostname: Mapped[str | None] = mapped_column(String(150), nullable=True)
    pid: Mapped[int | None] = mapped_column(Integer, nullable=True)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Active", server_default="Active"
    )  # Active, Stale, Failed, Stopped
    last_heartbeat_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=datetime.utcnow, index=True
    )
    last_job_name: Mapped[str | None] = mapped_column(String(100), nullable=True)
    last_job_status: Mapped[str | None] = mapped_column(String(30), nullable=True)
    last_job_finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    consecutive_failures: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    metrics_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PlatformSecurityEvent(Base):
    """Tracks login activity, failed logins, suspicious activity, security incidents, and access reviews."""

    __tablename__ = "platform_security_events"

    __table_args__ = (
        Index("ix_platform_sec_events_type_created", "event_type", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    event_type: Mapped[str] = mapped_column(
        String(50), nullable=False
    )  # login_success, login_failed, suspicious_activity, security_incident, access_review, audit_finding
    severity: Mapped[str] = mapped_column(
        String(20), nullable=False, default="Info", server_default="Info"
    )  # Info, Warning, High, Critical
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Open", server_default="Open"
    )  # Open, Investigating, Remediated, Closed, Logged
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    industry_key: Mapped[str | None] = mapped_column(String(80), nullable=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    remediation_steps: Mapped[str | None] = mapped_column(Text, nullable=True)
    metadata_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )


class PlatformSetting(Base):
    """Global platform settings configured by Platform Super Admin."""

    __tablename__ = "platform_settings"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    setting_key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    category: Mapped[str] = mapped_column(String(60), nullable=False, default="General", server_default="General")
    value_json: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict, server_default="{}")
    description: Mapped[str] = mapped_column(String(255), nullable=False, default="", server_default="")
    updated_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow
    )
