from uuid import UUID
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict

from typing import Literal

DealStage = Literal[
    "New",
    "Qualification",
    "Needs Analysis",
    "Proposal",
    "Negotiation",
    "Closed Won",
    "Closed Lost"
]

class DealCreate(BaseModel):
    name: str
    lead_id: UUID | None = None
    contact_id: UUID | None = None
    account_id: UUID | None = None
    assigned_to: UUID | None = None
    amount: float | None = None
    stage: DealStage = "New"
    expected_close_date: date | None = None
    description: str | None = None


class DealUpdate(BaseModel):
    name: str | None = None
    lead_id: UUID | None = None
    contact_id: UUID | None = None
    account_id: UUID | None = None
    assigned_to: UUID | None = None
    amount: float | None = None
    stage: DealStage | None = None
    expected_close_date: date | None = None
    description: str | None = None


class DealResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    lead_id: UUID | None
    contact_id: UUID | None
    account_id: UUID | None
    assigned_to: UUID | None
    amount: float | None
    stage: str
    expected_close_date: date | None
    description: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)