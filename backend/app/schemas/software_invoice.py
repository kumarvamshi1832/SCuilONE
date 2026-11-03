from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SoftwareInvoiceItemCreate(BaseModel):
    # For time-entry lines these three are optional: the description defaults to the task
    # title, the quantity to the hours worked and the price to the contract hourly rate.
    description: str | None = Field(default=None, min_length=1, max_length=300)
    quantity: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=4)
    unit_price: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    tax_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100, max_digits=5, decimal_places=2)
    time_entry_id: UUID | None = None

    @model_validator(mode="after")
    def require_details_for_manual_lines(self):
        if self.time_entry_id is None:
            missing = [name for name in ("description", "quantity", "unit_price") if getattr(self, name) is None]
            if missing:
                raise ValueError(f"{', '.join(missing)} required unless the line is a time entry")
        return self


class SoftwareInvoiceCreate(BaseModel):
    invoice_number: str | None = Field(default=None, max_length=50)  # blank = auto-number
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


class SoftwareInvoicePaymentReverse(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


class SoftwareCreditNoteCreate(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    reason: str = Field(min_length=3, max_length=1000)


class SoftwareCreditNoteResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    invoice_id: UUID
    created_by: UUID | None
    credit_note_number: str
    issue_date: date
    amount: Decimal
    reason: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


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
    status: str
    reversed_at: datetime | None
    reversal_reason: str | None
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
    credited_amount: Decimal
    balance_due: Decimal
    is_overdue: bool
    days_overdue: int
    notes: str | None
    sent_at: datetime | None
    created_at: datetime
    updated_at: datetime
    items: list[SoftwareInvoiceItemResponse]
    payments: list[SoftwareInvoicePaymentResponse]
    credit_notes: list[SoftwareCreditNoteResponse]
    model_config = ConfigDict(from_attributes=True)
