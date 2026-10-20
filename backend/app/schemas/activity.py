
from uuid import UUID
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


ActivityType = Literal["Task", "Call", "Meeting"]
ActivityStatus = Literal["Pending", "In Progress", "Completed", "Cancelled"]
ActivityPriority = Literal["Low", "Medium", "High"]


def _normalize_type(v):
    if isinstance(v, str):
        c = v.strip().lower()
        if c == "task":
            return "Task"
        if c == "call":
            return "Call"
        if c == "meeting":
            return "Meeting"
    return v


def _normalize_status(v):
    if isinstance(v, str):
        c = v.strip().lower()
        if c == "pending":
            return "Pending"
        if c in ["in progress", "in_progress", "inprogress"]:
            return "In Progress"
        if c == "completed":
            return "Completed"
        if c in ["cancelled", "canceled"]:
            return "Cancelled"
    return v


def _normalize_priority(v):
    if isinstance(v, str):
        c = v.strip().lower()
        if c == "low":
            return "Low"
        if c == "medium":
            return "Medium"
        if c == "high":
            return "High"
    return v


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

    @field_validator("activity_type", mode="before")
    @classmethod
    def validate_type(cls, v):
        return _normalize_type(v)

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v):
        return _normalize_status(v)

    @field_validator("priority", mode="before")
    @classmethod
    def validate_priority(cls, v):
        return _normalize_priority(v)


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

    @field_validator("activity_type", mode="before")
    @classmethod
    def validate_type(cls, v):
        return _normalize_type(v) if v is not None else v

    @field_validator("status", mode="before")
    @classmethod
    def validate_status(cls, v):
        return _normalize_status(v) if v is not None else v

    @field_validator("priority", mode="before")
    @classmethod
    def validate_priority(cls, v):
        return _normalize_priority(v) if v is not None else v



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