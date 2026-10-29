from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator


class PortalInviteCreate(BaseModel):
    contact_id: UUID


class PortalInviteResponse(BaseModel):
    portal_user_id: UUID
    contact_id: UUID
    account_id: UUID
    email: str
    status: str
    invitation_expires_at: datetime


class PortalActivateRequest(BaseModel):
    token: str = Field(min_length=20, max_length=500)
    password: str = Field(min_length=15, max_length=128)


class PortalLoginRequest(BaseModel):
    tenant_id: UUID
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class PortalRefreshRequest(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=500)


class PortalLogoutRequest(BaseModel):
    refresh_token: str = Field(min_length=20, max_length=500)


class PortalTicketCreate(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=10000)
    category: str = Field(default="General", max_length=60)
    priority: str = Field(default="Medium", max_length=20)

    @field_validator("subject", "description")
    @classmethod
    def nonblank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be blank.")
        return value


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
    author_user_id: UUID | None
    author_customer_portal_user_id: UUID | None
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
