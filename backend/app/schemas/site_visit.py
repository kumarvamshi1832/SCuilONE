
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


SiteVisitStatus = Literal[
    "Scheduled", "Completed", "Cancelled", "Rescheduled", "No-show"
]
SiteVisitOutcome = Literal[
    "Interested", "Follow-up Required", "Not Interested", "Negotiation", "Other"
]
InterestLevel = Literal["Interested", "Maybe", "Not Interested"]


class SiteVisitCreate(BaseModel):
    property_match_id: UUID
    scheduled_start: datetime
    scheduled_end: datetime
    assigned_to: UUID | None = None

    @model_validator(mode="after")
    def validate_schedule(self):
        if self.scheduled_end <= self.scheduled_start:
            raise ValueError("scheduled_end must be after scheduled_start.")
        return self


class SiteVisitUpdate(BaseModel):
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    assigned_to: UUID | None = None
    status: SiteVisitStatus | None = None
    outcome: SiteVisitOutcome | None = None
    buyer_feedback: str | None = Field(default=None, max_length=5000)
    interest_level: InterestLevel | None = None
    follow_up_required: bool | None = None
    follow_up_date: datetime | None = None
    cancellation_reason: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_schedule(self):
        if self.scheduled_start is not None and self.scheduled_end is not None:
            if self.scheduled_end <= self.scheduled_start:
                raise ValueError("scheduled_end must be after scheduled_start.")
        return self


class SiteVisitResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    property_match_id: UUID
    assigned_to: UUID | None
    created_by: UUID | None
    scheduled_start: datetime
    scheduled_end: datetime
    status: SiteVisitStatus
    outcome: SiteVisitOutcome | None
    buyer_feedback: str | None
    interest_level: InterestLevel | None
    follow_up_required: bool
    follow_up_date: datetime | None
    cancellation_reason: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
