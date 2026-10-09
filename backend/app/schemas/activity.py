
from uuid import UUID
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


ActivityType = Literal["Task", "Call", "Meeting"]
ActivityStatus = Literal["Pending", "In Progress", "Completed", "Cancelled"]
ActivityPriority = Literal["Low", "Medium", "High"]


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
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)