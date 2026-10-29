from uuid import UUID
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ActivityType = Literal["Task", "Call", "Meeting"]
ActivityStatus = Literal["Pending", "In Progress", "Completed", "Cancelled"]
ActivityPriority = Literal["Low", "Medium", "High"]
ActivityLinkModule = Literal[
    "property",
    "building",
    "real_estate_project",
    "buyer_requirement",
    "property_match",
    "site_visit",
    "booking",
    "software_project",
    "software_sprint",
]


class ActivityLinkInput(BaseModel):
    module: ActivityLinkModule
    record_id: UUID


class ActivityLinkResponse(BaseModel):
    id: UUID
    module: ActivityLinkModule
    record_id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class ActivityCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    activity_type: ActivityType
    status: ActivityStatus = "Pending"
    priority: ActivityPriority = "Medium"
    due_date: datetime | None = None
    assigned_to: UUID | None = None
    lead_id: UUID | None = None
    contact_id: UUID | None = None
    account_id: UUID | None = None
    deal_id: UUID | None = None
    related_records: list[ActivityLinkInput] = Field(default_factory=list)

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Activity title cannot be blank")
        return value


class ActivityUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    activity_type: ActivityType | None = None
    status: ActivityStatus | None = None
    priority: ActivityPriority | None = None
    due_date: datetime | None = None
    assigned_to: UUID | None = None
    lead_id: UUID | None = None
    contact_id: UUID | None = None
    account_id: UUID | None = None
    deal_id: UUID | None = None
    related_records: list[ActivityLinkInput] | None = None

    @field_validator("title")
    @classmethod
    def title_must_not_be_blank(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("Activity title cannot be blank")
        return value


class ActivityResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    title: str
    description: str | None
    activity_type: ActivityType
    status: ActivityStatus
    priority: ActivityPriority
    due_date: datetime | None
    assigned_to: UUID | None
    lead_id: UUID | None
    contact_id: UUID | None
    account_id: UUID | None
    deal_id: UUID | None
    related_records: list[ActivityLinkResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
