from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class SoftwareInvoiceItemCreate(BaseModel):
    description: str = Field(min_length=1, max_length=300)
    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=4)
    unit_price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    tax_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100, max_digits=5, decimal_places=2)
    time_entry_id: UUID | None = None


class SoftwareInvoiceCreate(BaseModel):
    invoice_number: str = Field(min_length=1, max_length=50)
    project_id: UUID
    software_contract_id: UUID
    issue_date: date | None = None
    due_date: date | None = None
    notes: str | None = Field(default=None, max_length=4000)
    items: list[SoftwareInvoiceItemCreate] = Field(min_length=1, max_length=100)


class SoftwareInvoiceStatusUpdate(BaseModel):
    status: Literal["Sent", "Void"]


class SoftwareInvoicePaymentCreate(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    payment_method: str = Field(min_length=1, max_length=30)
    transaction_reference: str | None = Field(default=None, max_length=150)
    payment_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)


class SoftwareInvoiceItemResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    invoice_id: UUID
    time_entry_id: UUID | None
    description: str
    quantity: Decimal
    unit_price: Decimal
    tax_percent: Decimal
    line_subtotal: Decimal
    line_tax: Decimal
    line_total: Decimal
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class SoftwareInvoicePaymentResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    invoice_id: UUID
    created_by: UUID | None
    amount: Decimal
    payment_method: str
    transaction_reference: str | None
    payment_date: date
    notes: str | None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class SoftwareInvoiceResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    project_id: UUID
    software_contract_id: UUID
    created_by: UUID | None
    invoice_number: str
    currency: str
    issue_date: date
    due_date: date | None
    status: str
    subtotal: Decimal
    tax_total: Decimal
    total_amount: Decimal
    amount_paid: Decimal
    balance_due: Decimal
    notes: str | None
    sent_at: datetime | None
    created_at: datetime
    updated_at: datetime
    items: list[SoftwareInvoiceItemResponse]
    payments: list[SoftwareInvoicePaymentResponse]
    model_config = ConfigDict(from_attributes=True)
