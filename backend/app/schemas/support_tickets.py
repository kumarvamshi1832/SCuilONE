from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


TicketStatus = Literal["Open", "In Progress", "Waiting on Customer", "Resolved", "Closed"]
TicketPriority = Literal["Low", "Medium", "High", "Urgent"]
TicketSource = Literal["CRM", "Email", "Phone", "Client Portal", "Other"]
TicketCategory = Literal["General", "Bug", "Technical Support", "Billing", "Feature Request", "Account Access", "Other"]


class SupportTicketCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=10000)
    category: TicketCategory = "General"
    priority: TicketPriority = "Medium"
    source: TicketSource = "CRM"
    requester_name: str = Field(min_length=1, max_length=150)
    requester_email: str | None = Field(default=None, max_length=255)
    account_id: UUID | None = None
    contact_id: UUID | None = None
    software_project_id: UUID | None = None
    assigned_to: UUID | None = None

    @field_validator("subject", "description", "requester_name")
    @classmethod
    def strip_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value


class SupportTicketUpdate(BaseModel):
    subject: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, min_length=1, max_length=10000)
    category: TicketCategory | None = None
    status: TicketStatus | None = None
    priority: TicketPriority | None = None
    source: TicketSource | None = None
    requester_name: str | None = Field(default=None, min_length=1, max_length=150)
    requester_email: str | None = Field(default=None, max_length=255)
    account_id: UUID | None = None
    contact_id: UUID | None = None
    software_project_id: UUID | None = None
    assigned_to: UUID | None = None
    resolution: str | None = Field(default=None, max_length=10000)

    @field_validator("subject", "description", "requester_name", "resolution")
    @classmethod
    def strip_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value


class SupportTicketCommentCreate(BaseModel):
    body: str = Field(min_length=1, max_length=10000)
    is_internal: bool = False

    @field_validator("body")
    @classmethod
    def body_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Comment cannot be blank.")
        return value


class SupportTicketCommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    ticket_id: UUID
    author_user_id: UUID | None
    author_customer_portal_user_id: UUID | None = None
    body: str
    is_internal: bool
    created_at: datetime


class SupportTicketResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    ticket_number: str
    subject: str
    description: str
    category: TicketCategory
    status: TicketStatus
    priority: TicketPriority
    source: TicketSource
    requester_name: str
    requester_email: str | None
    account_id: UUID | None
    contact_id: UUID | None
    software_project_id: UUID | None
    assigned_to: UUID | None
    created_by: UUID | None
    resolution: str | None
    resolved_at: datetime | None
    closed_at: datetime | None
    created_at: datetime
    updated_at: datetime


class SupportTicketDetailResponse(SupportTicketResponse):
    comments: list[SupportTicketCommentResponse] = Field(default_factory=list)


class SupportTicketListResponse(BaseModel):
    items: list[SupportTicketResponse]
    total: int
    limit: int
    offset: int
