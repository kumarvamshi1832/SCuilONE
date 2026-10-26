from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator


class InstallmentCreate(BaseModel):
    sequence: int = Field(gt=0)
    name: str = Field(min_length=1, max_length=150)
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    due_date: date
    notes: str | None = Field(default=None, max_length=5000)


class PaymentPlanCreate(BaseModel):
    installments: list[InstallmentCreate] = Field(min_length=1, max_length=100)
    notes: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def validate_installments(self):
        sequences = [item.sequence for item in self.installments]
        if len(sequences) != len(set(sequences)):
            raise ValueError("Installment sequence numbers must be unique.")
        return self


class InstallmentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    payment_plan_id: UUID
    sequence: int
    name: str
    amount: Decimal
    due_date: date
    status: str
    notes: str | None
    created_at: datetime
    updated_at: datetime


class PaymentPlanResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    booking_id: UUID
    total_amount: Decimal
    status: Literal["Active", "Cancelled"]
    notes: str | None
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime
    installments: list[dict]
    total_collected: Decimal
    total_outstanding: Decimal


class CollectionSummary(BaseModel):
    booking_id: UUID
    payment_preference: Literal["Full Payment", "Installments"]
    installment_request_notes: str | None
    agreed_price: Decimal
    total_verified: Decimal
    total_processed_refunds: Decimal
    net_collected: Decimal
    outstanding_balance: Decimal
    pending_payments: Decimal
    installments: list[dict]
