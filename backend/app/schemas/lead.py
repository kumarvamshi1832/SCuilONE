from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, EmailStr, ConfigDict


class LeadCreate(BaseModel):
    full_name: str
    email: EmailStr | None = None
    phone: str | None = None
    source: str | None = None
    status: str = "New"
    assigned_to: UUID | None = None
    notes: str | None = None


class LeadUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    source: str | None = None
    status: str | None = None
    assigned_to: UUID | None = None
    notes: str | None = None


class LeadResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    full_name: str
    email: EmailStr | None
    phone: str | None
    source: str | None
    status: str
    assigned_to: UUID | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)