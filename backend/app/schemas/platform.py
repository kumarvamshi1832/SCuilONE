from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator

from app.core.password_policy import validate_password


class PlatformLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class PlatformFirstPasswordChangeRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=15, max_length=128)
    confirm_password: str = Field(min_length=15, max_length=128)

    @model_validator(mode="after")
    def validate_passwords(self):
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match")
        if self.current_password == self.new_password:
            raise ValueError("New password must differ from temporary password")
        validate_password(self.new_password)
        return self


class PlatformBootstrapSuperAdminRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(min_length=15, max_length=128)
    confirm_password: str = Field(min_length=15, max_length=128)

    @model_validator(mode="after")
    def validate_passwords(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")
        validate_password(self.password, [self.email, self.full_name])
        return self


class PlatformAddEmployeeRequest(BaseModel):
    """
    Implements the Add Employee Flow from platfrom support (1).pdf (Pages 2 & 5):
    Admin enters employee_name (or full_name), email, temporary_password, industry_type, and role.
    """
    employee_name: str | None = Field(default=None, min_length=2, max_length=150)
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    email: EmailStr
    temporary_password: str = Field(min_length=15, max_length=128)
    industry_type: str | None = Field(default=None, max_length=100)
    role: str = Field(default="Industry Support", min_length=2, max_length=100)
    phone: str | None = Field(default=None, max_length=20)
    department: str | None = Field(default=None, max_length=100)
    max_ticket_load: int = Field(default=25, ge=1, le=500)

    @model_validator(mode="after")
    def ensure_name(self):
        name = (self.employee_name or self.full_name or "").strip()
        if len(name) < 2:
            raise ValueError("Provide employee_name (or full_name) with at least 2 characters.")
        self.employee_name = name
        self.full_name = name
        validate_password(self.temporary_password, [str(self.email), name])
        return self


class PlatformEmployeeUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    role: str | None = Field(default=None, min_length=2, max_length=100)
    industry_type: str | None = Field(default=None, max_length=100)
    status: str | None = Field(default=None, pattern="^(Active|Inactive|Suspended)$")
    availability_status: str | None = Field(default=None, pattern="^(Available|Busy|Offline|On Leave)$")
    max_ticket_load: int | None = Field(default=None, ge=1, le=500)
    manager_user_id: UUID | None = None
    department: str | None = Field(default=None, max_length=100)


class IndustryTeamCreateOrUpdateRequest(BaseModel):
    industry_key: str | None = Field(default=None, max_length=80)
    name: str = Field(min_length=2, max_length=150)
    description: str = Field(default="", max_length=1000)
    is_active: bool = True
    max_members: int = Field(default=7, ge=1, le=50)
    sla_response_minutes: int = Field(default=60, ge=5, le=10080)
    sla_resolution_hours: int = Field(default=24, ge=1, le=720)
    allocated_budget: Decimal = Field(default=Decimal("0.00"), ge=0)
    manager_user_id: UUID | None = None
    team_admin_user_id: UUID | None = None
    config_json: dict | None = None


class IndustryTeamUpdateRequest(BaseModel):
    """Partial update schema for PATCH; omitted fields remain unchanged."""
    name: str | None = Field(default=None, min_length=2, max_length=150)
    description: str | None = Field(default=None, max_length=1000)
    is_active: bool | None = None
    max_members: int | None = Field(default=None, ge=1, le=50)
    sla_response_minutes: int | None = Field(default=None, ge=5, le=10080)
    sla_resolution_hours: int | None = Field(default=None, ge=1, le=720)
    allocated_budget: Decimal | None = Field(default=None, ge=0)
    manager_user_id: UUID | None = None
    team_admin_user_id: UUID | None = None
    config_json: dict | None = None


class PlatformTenantCreateRequest(BaseModel):
    name: str = Field(min_length=2, max_length=150)
    industry: str = Field(min_length=2, max_length=100)
    plan_key: str | None = Field(default="starter", max_length=60)
    owner_full_name: str | None = Field(default=None, max_length=150)
    owner_email: EmailStr | None = None
    owner_password: str | None = Field(default=None, min_length=15, max_length=128)

    @model_validator(mode="after")
    def validate_owner_and_company(self):
        self.name = self.name.strip()
        self.industry = self.industry.strip()
        if len(self.name) < 2:
            raise ValueError("Company name must be at least 2 non-whitespace characters.")
        if len(self.industry) < 2:
            raise ValueError("Industry must be at least 2 non-whitespace characters.")
        owner_fields = [self.owner_full_name, self.owner_email, self.owner_password]
        if any(f is not None for f in owner_fields):
            if not (self.owner_full_name and self.owner_full_name.strip() and self.owner_email and self.owner_password):
                raise ValueError(
                    "When provisioning an initial Tenant Owner, owner_full_name, owner_email, and owner_password are all required."
                )
            self.owner_full_name = self.owner_full_name.strip()
            validate_password(self.owner_password, [str(self.owner_email), self.owner_full_name])
        return self


class PlatformTenantUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=150)
    industry: str | None = Field(default=None, min_length=2, max_length=100)
    status: str | None = Field(default=None, pattern="^(Active|Suspended|Inactive|Trial)$")


class SubscriptionPlanCreateRequest(BaseModel):
    plan_key: str = Field(min_length=2, max_length=60)
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=1000)
    billing_cycle: str = Field(default="Monthly", pattern="^(Monthly|Annual)$")
    price: Decimal = Field(default=Decimal("0.00"), ge=0)
    currency: str = Field(default="INR", max_length=10)
    trial_days: int = Field(default=14, ge=0, le=365)
    max_users: int = Field(default=10, ge=1)
    max_branches: int = Field(default=1, ge=1)
    storage_limit_gb: int = Field(default=10, ge=1)
    features_json: list[str] = Field(default_factory=list)
    limits_json: dict = Field(default_factory=dict)
    is_active: bool = True


class SubscriptionPlanUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = None
    billing_cycle: str | None = Field(default=None, pattern="^(Monthly|Annual)$")
    price: Decimal | None = Field(default=None, ge=0)
    trial_days: int | None = Field(default=None, ge=0, le=365)
    max_users: int | None = Field(default=None, ge=1)
    max_branches: int | None = Field(default=None, ge=1)
    storage_limit_gb: int | None = Field(default=None, ge=1)
    features_json: list[str] | None = None
    limits_json: dict | None = None
    is_active: bool | None = None


class TenantSubscriptionAssignRequest(BaseModel):
    tenant_id: UUID
    plan_id: UUID
    status: str = Field(default="Active", pattern="^(Trial|Active|Past Due|Suspended|Cancelled|Expired)$")
    billing_cycle: str = Field(default="Monthly", pattern="^(Monthly|Annual)$")
    auto_renew: bool = True
    renewal_date: date | None = None


class PlatformInvoiceCreateRequest(BaseModel):
    tenant_id: UUID
    subscription_id: UUID | None = None
    amount: Decimal = Field(gt=0)
    tax_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    currency: str = Field(default="INR", max_length=10)
    due_date: date | None = None
    notes: str | None = None


class PlatformPaymentCreateRequest(BaseModel):
    invoice_id: UUID
    provider: str = Field(default="Razorpay", max_length=60)
    transaction_reference: str = Field(min_length=2, max_length=120)
    amount: Decimal = Field(gt=0)
    payment_method: str = Field(default="Card", max_length=50)
    status: str = Field(default="Succeeded", pattern="^(Succeeded|Failed|Pending)$")
    failure_reason: str | None = None


class PlatformRefundCreateRequest(BaseModel):
    invoice_id: UUID
    payment_id: UUID | None = None
    amount: Decimal = Field(gt=0)
    reason: str = Field(min_length=3, max_length=1000)


class PlatformRefundDecisionRequest(BaseModel):
    status: str = Field(pattern="^(Approved|Rejected|Processed)$")
    resolution_notes: str | None = None


class PlatformExpenseCreateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=180)
    category: str = Field(default="Operations", max_length=80)
    industry_type: str | None = Field(default=None, max_length=80)
    amount: Decimal = Field(gt=0)
    currency: str = Field(default="INR", max_length=10)
    expense_date: date | None = None
    description: str | None = None


class PlatformExpenseDecisionRequest(BaseModel):
    status: str = Field(pattern="^(Approved|Rejected|Paid|Reconciled)$")
    reconciled: bool | None = None


class PlatformSalesProspectCreateRequest(BaseModel):
    company_name: str = Field(min_length=2, max_length=180)
    contact_name: str = Field(min_length=2, max_length=150)
    contact_email: EmailStr
    contact_phone: str | None = Field(default=None, max_length=30)
    industry_type: str = Field(min_length=2, max_length=80)
    lead_status: str = Field(default="New", pattern="^(New|Contacted|Qualified|Unqualified|Converted)$")
    pipeline_stage: str = Field(default="New", pattern="^(New|Qualified|Demo|Negotiation|Won|Lost)$")
    interest_level: str = Field(default="Medium", pattern="^(Low|Medium|High)$")
    estimated_mrr: Decimal = Field(default=Decimal("0.00"), ge=0)
    recommended_plan: str | None = Field(default="Starter", max_length=60)
    assigned_to: UUID | None = None
    demo_scheduled_at: datetime | None = None
    next_follow_up_at: datetime | None = None
    notes: str | None = None


class PlatformSalesProspectUpdateRequest(BaseModel):
    lead_status: str | None = Field(default=None, pattern="^(New|Contacted|Qualified|Unqualified|Converted)$")
    pipeline_stage: str | None = Field(default=None, pattern="^(New|Qualified|Demo|Negotiation|Won|Lost)$")
    interest_level: str | None = Field(default=None, pattern="^(Low|Medium|High)$")
    estimated_mrr: Decimal | None = Field(default=None, ge=0)
    recommended_plan: str | None = None
    assigned_to: UUID | None = None
    demo_scheduled_at: datetime | None = None
    demo_outcome: str | None = None
    next_follow_up_at: datetime | None = None
    onboarding_status: str | None = Field(
        default=None,
        pattern="^(Not Started|Setup In Progress|Initial Configuration|Handed Over to Support|Completed)$",
    )
    notes: str | None = None


class PlatformTicketAssignRequest(BaseModel):
    assigned_employee_user_id: UUID
    routing_queue: str | None = Field(default=None, pattern="^(Support|Technical|Billing|Team Manager|Platform Manager)$")
    notes: str | None = None


class PlatformTicketEscalateRequest(BaseModel):
    escalation_target: str = Field(pattern="^(Team Manager|Platform Manager|Technical|Billing)$")
    escalation_reason: str = Field(min_length=3, max_length=1000)
    assigned_employee_user_id: UUID | None = None


class PlatformTicketAuditReviewRequest(BaseModel):
    audit_reviewed: bool = True
    audit_review_notes: str = Field(min_length=3, max_length=1000)


class KnowledgeArticleCreateRequest(BaseModel):
    slug: str = Field(min_length=2, max_length=160)
    title: str = Field(min_length=2, max_length=220)
    category: str = Field(default="Troubleshooting", max_length=80)
    industry_type: str | None = None
    content: str = Field(min_length=5)
    tags_json: list[str] = Field(default_factory=list)
    is_published: bool = True


class TechnicalIncidentCreateRequest(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    incident_type: str = Field(default="Incident", pattern="^(Incident|Outage|ErrorLog|Deployment)$")
    service_name: str = Field(default="API Gateway", max_length=80)
    severity: str = Field(default="Medium", pattern="^(Low|Medium|High|Critical)$")
    status: str = Field(default="Investigating", pattern="^(Investigating|Identified|Monitoring|Resolved|Deployed)$")
    environment: str = Field(default="production", max_length=40)
    error_fingerprint: str | None = Field(default=None, max_length=160)
    detection_source: str = Field(default="manual", pattern="^(automatic|manual)$")
    version_tag: str | None = Field(default=None, max_length=40)
    description: str = Field(min_length=3)
    recovery_actions: str | None = None
    affected_endpoint: str | None = Field(default=None, max_length=255)
    affected_tenant_ids: list[str] = Field(default_factory=list)
    diagnostics_json: dict = Field(default_factory=dict)
    owner_user_id: UUID | None = None
    related_ticket_id: UUID | None = None


class TechnicalIncidentUpdateRequest(BaseModel):
    status: str | None = Field(default=None, pattern="^(Investigating|Identified|Monitoring|Resolved|Deployed)$")
    severity: str | None = Field(default=None, pattern="^(Low|Medium|High|Critical)$")
    description: str | None = None
    recovery_actions: str | None = None
    diagnostics_json: dict | None = None
    owner_user_id: UUID | None = None


class TechnicalMonitoringThresholdsUpdateRequest(BaseModel):
    environment: str | None = None
    polling_interval_seconds: int | None = Field(default=None, ge=5, le=86400)
    api_5xx_incident_threshold: int | None = Field(default=None, ge=1, le=1000)
    api_5xx_critical_threshold: int | None = Field(default=None, ge=1, le=5000)
    api_window_minutes: int | None = Field(default=None, ge=1, le=1440)
    api_error_rate_degraded_pct: float | None = Field(default=None, ge=0.1, le=100.0)
    api_error_rate_unavailable_pct: float | None = Field(default=None, ge=0.1, le=100.0)
    api_latency_degraded_ms: float | None = Field(default=None, ge=10.0, le=60000.0)
    db_latency_degraded_ms: float | None = Field(default=None, ge=5.0, le=60000.0)
    worker_heartbeat_stale_seconds: int | None = Field(default=None, ge=10, le=86400)
    email_failure_threshold: int | None = Field(default=None, ge=1, le=100)
    storage_failure_threshold: int | None = Field(default=None, ge=1, le=100)
    recovery_consecutive_checks_required: int | None = Field(default=None, ge=1, le=20)
    unresolved_reminder_minutes: int | None = Field(default=None, ge=1, le=10080)
    health_history_retention_days: int | None = Field(default=None, ge=1, le=365)
    cpu_degraded_pct: float | None = Field(default=None, ge=10.0, le=100.0)
    cpu_critical_pct: float | None = Field(default=None, ge=10.0, le=100.0)
    memory_degraded_pct: float | None = Field(default=None, ge=10.0, le=100.0)
    memory_critical_pct: float | None = Field(default=None, ge=10.0, le=100.0)
    disk_degraded_pct: float | None = Field(default=None, ge=10.0, le=100.0)
    disk_critical_pct: float | None = Field(default=None, ge=10.0, le=100.0)


class SecurityEventCreateRequest(BaseModel):
    event_type: str = Field(
        default="security_incident",
        pattern="^(login_success|login_failed|suspicious_activity|security_incident|access_review|audit_finding)$",
    )
    severity: str = Field(default="Warning", pattern="^(Info|Warning|High|Critical)$")
    status: str = Field(default="Open", pattern="^(Open|Investigating|Remediated|Closed|Logged)$")
    user_id: UUID | None = None
    email: str | None = None
    ip_address: str | None = None
    industry_type: str | None = None
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(default="")
    remediation_steps: str | None = None
    metadata_json: dict = Field(default_factory=dict)


class PlatformSettingUpdateRequest(BaseModel):
    category: str = Field(default="General", max_length=60)
    value_json: dict
    description: str = Field(default="", max_length=255)


class RolePermissionsUpdateRequest(BaseModel):
    permissions: list[str]
