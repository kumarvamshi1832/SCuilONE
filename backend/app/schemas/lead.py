from uuid import UUID
from datetime import date, datetime

from pydantic import BaseModel, EmailStr, ConfigDict


class LeadCreate(BaseModel):
    full_name: str
    email: EmailStr | None = None
    phone: str | None = None
    source: str | None = None
    status: str = "New"
    assigned_to: UUID | None = None
    notes: str | None = None
    override_capacity: bool = False
    override_reason: str | None = None



class LeadUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    source: str | None = None
    status: str | None = None
    assigned_to: UUID | None = None
    notes: str | None = None
    override_capacity: bool = False
    override_reason: str | None = None



class LeadResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    full_name: str
    email: EmailStr | None
    phone: str | None
    source: str | None
    status: str
    account_id: UUID | None
    assigned_to: UUID | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class LeadConvertRequest(BaseModel):
    create_account: bool = False
    account_name: str | None = None
    create_deal: bool = True
    deal_name: str | None = None
    deal_amount: float | None = None
    deal_stage: str = "New"
    expected_close_date: date | None = None
    notes: str | None = None


class LeadConvertResponse(BaseModel):
    lead_id: UUID
    lead_status: str
    contact_id: UUID
    contact_created: bool
    account_id: UUID | None = None
    account_created: bool = False
    deal_id: UUID | None = None
    deal_created: bool = False
