from datetime import date, datetime
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator


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


class PortalSwitchWorkspaceRequest(BaseModel):
    tenant_id: UUID


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
    author_type: str  # "customer" or "support"; staff ids are never exposed
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
