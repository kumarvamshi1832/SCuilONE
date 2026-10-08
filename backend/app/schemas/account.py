from uuid import UUID
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, ConfigDict


AccountStatus = Literal[
    "Active",
    "Inactive",
    "Prospect",
    "Churned"
]

class AccountCreate(BaseModel):
    name: str
    email: EmailStr | None = None
    phone: str | None = None
    website: str | None = None
    industry: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    postal_code: str | None = None
    status: AccountStatus = "Active"
    source: str | None = None
    assigned_to: UUID | None = None
    notes: str | None = None
    lead_id: UUID | None = None


class AccountUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    website: str | None = None
    industry: str | None = None
    address: str | None = None
    city: str | None = None
    state: str | None = None
    country: str | None = None
    postal_code: str | None = None
    status: AccountStatus | None = None
    source: str | None = None
    assigned_to: UUID | None = None
    notes: str | None = None


class AccountResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    email: EmailStr | None
    phone: str | None
    website: str | None
    industry: str | None
    address: str | None
    city: str | None
    state: str | None
    country: str | None
    postal_code: str | None
    status: AccountStatus
    source: str | None
    assigned_to: UUID | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)