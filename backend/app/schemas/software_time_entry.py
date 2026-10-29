from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ManualTimeEntryCreate(BaseModel):
    activity_id: UUID
    duration_minutes: int = Field(gt=0, le=1440)
    work_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    is_billable: bool = False


class TimerStartRequest(BaseModel):
    activity_id: UUID
    notes: str | None = Field(default=None, max_length=2000)
    is_billable: bool = False


class SoftwareTimeEntryResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    activity_id: UUID
    user_id: UUID
    duration_minutes: int | None
    work_date: date
    notes: str | None
    is_billable: bool
    billing_status: Literal["Unreviewed", "Approved", "Rejected"]
    source: Literal["manual", "timer"]
    started_at: datetime | None
    stopped_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
