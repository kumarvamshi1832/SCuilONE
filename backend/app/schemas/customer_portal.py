from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from typing import Literal
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


class PortalBuyerRequirementCreate(BaseModel):
    """Customer-owned manual real-estate requirement; ownership fields are server supplied."""
    requirement_type: Literal["Buy", "Rent", "Lease"] = "Buy"
    property_type: str = Field(min_length=1, max_length=50)
    preferred_city: str = Field(min_length=1, max_length=100)
    preferred_location: str | None = Field(default=None, max_length=200)
    budget_frequency: Literal["One-time", "Monthly", "Quarterly", "Yearly"] | None = None
    min_duration_months: int | None = Field(default=None, ge=1, le=600)
    max_duration_months: int | None = Field(default=None, ge=1, le=600)
    min_budget: Decimal | None = Field(default=None, ge=0)
    max_budget: Decimal | None = Field(default=None, ge=0)
    bedrooms: int | None = Field(default=None, ge=0, le=100)
    min_area: Decimal | None = Field(default=None, ge=0)
    max_area: Decimal | None = Field(default=None, ge=0)
    area_unit: str = Field(default="sqft", min_length=1, max_length=20)
    notes: str | None = Field(default=None, max_length=5000)

    @field_validator("property_type", "preferred_city", "preferred_location", "area_unit", "notes")
    @classmethod
    def strip_requirement_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned if cleaned else None

    @model_validator(mode="after")
    def validate_requirement_ranges(self):
        if self.min_budget is not None and self.max_budget is not None and self.min_budget > self.max_budget:
            raise ValueError("Minimum budget cannot exceed maximum budget.")
        if self.min_area is not None and self.max_area is not None and self.min_area > self.max_area:
            raise ValueError("Minimum area cannot exceed maximum area.")
        if not self.property_type or not self.preferred_city:
            raise ValueError("Property type and preferred city are required.")
        expected = "One-time" if self.requirement_type == "Buy" else "Monthly"
        if self.budget_frequency is None:
            self.budget_frequency = expected
        if self.requirement_type == "Buy" and self.budget_frequency != "One-time":
            raise ValueError("Buy requirements must use One-time budget frequency.")
        if self.requirement_type in ("Rent", "Lease") and self.budget_frequency == "One-time":
            raise ValueError("Rent and Lease requirements must use recurring budget frequency.")
        if self.min_duration_months and self.max_duration_months and self.min_duration_months > self.max_duration_months:
            raise ValueError("Minimum duration cannot exceed maximum duration.")
        return self


class PortalInviteCreate(BaseModel):
    contact_id: UUID


class PortalInviteResponse(BaseModel):
    portal_user_id: UUID
    contact_id: UUID
    account_id: UUID
    email: EmailStr
    status: str
    invitation_expires_at: datetime


class PortalActivateRequest(BaseModel):
    token: str = Field(min_length=20, max_length=500)
    password: str = Field(min_length=15, max_length=128)


class PortalLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    tenant_id: UUID | None = None


class PortalSwitchWorkspaceRequest(BaseModel):
    tenant_id: UUID


class PortalForgotPasswordRequest(BaseModel):
    email: EmailStr
    tenant_id: UUID | None = None


class PortalResetPasswordRequest(BaseModel):
    token: str = Field(min_length=20, max_length=500)
    new_password: str = Field(min_length=15, max_length=128)


class PortalChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=15, max_length=128)


class PortalRefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=500)


class PortalLogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=500)


class PortalProfileUpdateRequest(BaseModel):
    full_name: str | None = Field(default=None, min_length=1, max_length=150)
    phone: str | None = Field(default=None, max_length=30)
    job_title: str | None = Field(default=None, max_length=100)
    address: str | None = Field(default=None, max_length=1000)

    @field_validator("full_name", "phone", "job_title", "address")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return None
        cleaned = value.strip()
        return cleaned if cleaned else None


class PortalTicketCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=10000)
    category: str = Field(default="General", max_length=60)
    priority: str = Field(default="Medium", max_length=20)
    software_project_id: UUID | None = None

    @field_validator("subject", "description")
    @classmethod
    def nonblank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value


class PortalTicketDecisionRequest(BaseModel):
    comment: str | None = Field(default=None, max_length=2000)


class PortalCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10000)

    @field_validator("body")
    @classmethod
    def nonblank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Comment cannot be blank.")
        return value


class PortalCommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    ticket_id: UUID
    author_type: str  # "customer" or "support"; never expose internal staff IDs to portal users
    body: str
    created_at: datetime


class PortalTicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    ticket_number: str
    subject: str
    description: str
    category: str
    status: str
    priority: str
    requester_name: str
    account_id: UUID | None
    contact_id: UUID | None
    software_project_id: UUID | None
    resolution: str | None
    resolved_at: datetime | None
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PortalTicketDetailResponse(PortalTicketResponse):
    comments: list[PortalCommentResponse] = Field(default_factory=list)


class PortalTicketListResponse(BaseModel):
    items: list[PortalTicketResponse]
    total: int
    limit: int
    offset: int


class PortalEstimateItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    item_name: str
    description: str | None
    quantity: Decimal
    unit_price: Decimal
    discount_percent: Decimal
    tax_percent: Decimal
    line_subtotal: Decimal
    line_discount: Decimal
    line_tax: Decimal
    line_total: Decimal
    sort_order: int


class PortalEstimateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    estimate_number: str
    revision_number: int
    title: str
    description: str | None
    billing_type: str
    hourly_rate: Decimal | None
    currency: str
    issue_date: date
    expiry_date: date | None
    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    status: str
    terms_and_conditions: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    items: list[PortalEstimateItemResponse] = Field(default_factory=list)


class PortalEstimateDecisionRequest(BaseModel):
    notes: str | None = Field(default=None, max_length=2000)


class PortalContractMilestoneResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    sequence: int
    name: str
    percentage: Decimal
    amount: Decimal
    trigger_description: str | None
    status: str
    invoice_id: UUID | None


class PortalContractResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    contract_number: str
    software_estimate_id: UUID
    title: str
    description: str | None
    currency: str
    billing_type: str
    hourly_rate: Decimal | None
    contract_value: Decimal
    issue_date: date
    start_date: date | None
    end_date: date | None
    signed_date: date | None
    status: str
    scope_of_work: str
    deliverables: str
    exclusions: str | None
    assumptions: str | None
    acceptance_criteria: str | None
    payment_terms: str | None
    milestone_billing_mode: str
    terms_and_conditions: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime
    payment_milestones: list[PortalContractMilestoneResponse] = Field(default_factory=list)


class PortalContractSignRequest(BaseModel):
    signer_name: str = Field(min_length=2, max_length=150)
    signer_title: str | None = Field(default=None, max_length=100)
    notes: str | None = Field(default=None, max_length=1000)


class PortalSprintSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    name: str
    goal: str | None
    status: str
    start_date: date
    end_date: date


class PortalProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    project_number: str
    software_contract_id: UUID
    name: str
    description: str | None
    scope_of_work: str
    deliverables: str
    status: str
    priority: str
    budget: Decimal
    currency: str
    start_date: date | None
    target_end_date: date | None
    actual_end_date: date | None
    created_at: datetime
    updated_at: datetime


class PortalProjectDetailResponse(PortalProjectResponse):
    sprints: list[PortalSprintSummaryResponse] = Field(default_factory=list)


class PortalInvoiceItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    description: str
    quantity: Decimal
    unit_price: Decimal
    tax_percent: Decimal
    line_subtotal: Decimal
    line_tax: Decimal
    line_total: Decimal


class PortalInvoicePaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    amount: Decimal
    payment_method: str
    transaction_reference: str | None
    payment_date: date
    status: str
    notes: str | None
    created_at: datetime


class PortalCreditNoteResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    credit_note_number: str
    issue_date: date
    amount: Decimal
    reason: str
    created_at: datetime


class PortalInvoiceResponse(BaseModel):
    id: UUID
    project_id: UUID
    software_contract_id: UUID
    invoice_number: str
    currency: str
    issue_date: date
    due_date: date | None
    status: str
    subtotal: Decimal
    tax_total: Decimal
    total_amount: Decimal
    amount_paid: Decimal
    credited_amount: Decimal
    balance_due: Decimal
    is_overdue: bool
    days_overdue: int
    notes: str | None
    sent_at: datetime | None
    created_at: datetime
    updated_at: datetime
    items: list[PortalInvoiceItemResponse] = Field(default_factory=list)
    payments: list[PortalInvoicePaymentResponse] = Field(default_factory=list)
    credit_notes: list[PortalCreditNoteResponse] = Field(default_factory=list)


class PortalDocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    title: str
    filename: str
    document_type: str
    file_url: str
    content_type: str
    file_size: int
    description: str | None
    version_number: int
    expires_at: datetime | None
    created_at: datetime
    updated_at: datetime


class PortalSiteVisitRequest(BaseModel):
    property_match_id: UUID
    scheduled_start: datetime
    scheduled_end: datetime

    @model_validator(mode="after")
    def validate_requested_window(self):
        start = self.scheduled_start
        end = self.scheduled_end
        if end <= start:
            raise ValueError("scheduled_end must be after scheduled_start.")
        if (end - start).total_seconds() < 30 * 60:
            raise ValueError("Please request at least a 30-minute visit window.")
        if (end - start).total_seconds() > 8 * 60 * 60:
            raise ValueError("A site-visit request cannot exceed 8 hours.")
        now = datetime.now(start.tzinfo) if start.tzinfo else datetime.utcnow()
        if start <= now:
            raise ValueError("Please choose a future site-visit time.")
        return self


class PortalShortlistAddRequest(BaseModel):
    property_match_id: UUID
