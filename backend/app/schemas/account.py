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


class AccountLeadSummary(BaseModel):
    id: UUID
    full_name: str
    email: EmailStr | None
    phone: str | None
    status: str

    model_config = ConfigDict(from_attributes=True)


class AccountContactSummary(BaseModel):
    id: UUID
    full_name: str
    email: EmailStr | None
    phone: str | None
    company: str | None
    job_title: str | None

    model_config = ConfigDict(from_attributes=True)


class AccountDealSummary(BaseModel):
    id: UUID
    name: str
    amount: float | None
    stage: str
    lead_id: UUID | None
    contact_id: UUID | None

    model_config = ConfigDict(from_attributes=True)


class AccountDetailsResponse(AccountResponse):
    leads: list[AccountLeadSummary]
    contacts: list[AccountContactSummary]
    deals: list[AccountDealSummary]
    total_deals: int
    won_deals: int
    total_revenue: float