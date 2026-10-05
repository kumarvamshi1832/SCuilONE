from uuid import UUID
from datetime import datetime

from pydantic import BaseModel, EmailStr, ConfigDict


class ContactCreate(BaseModel):
    full_name: str
    email: EmailStr | None = None
    phone: str | None = None
    company: str | None = None
    job_title: str | None = None
    address: str | None = None
    source: str | None = None
    assigned_to: UUID | None = None
    notes: str | None = None


class ContactUpdate(BaseModel):
    full_name: str | None = None
    email: EmailStr | None = None
    phone: str | None = None
    company: str | None = None
    job_title: str | None = None
    address: str | None = None
    source: str | None = None
    assigned_to: UUID | None = None
    notes: str | None = None


class ContactResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    full_name: str
    email: EmailStr | None
    phone: str | None
    company: str | None
    job_title: str | None
    address: str | None
    source: str | None
    assigned_to: UUID | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)