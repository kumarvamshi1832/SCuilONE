
from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


PaymentMethod = Literal[
    "Cash",
    "Bank Transfer",
    "UPI",
    "Cheque",
    "Card",
    "Other",
]

PaymentStatus = Literal["Pending", "Verified", "Rejected"]


class PaymentCreate(BaseModel):
    amount: Decimal = Field(
        gt=0,
        max_digits=14,
        decimal_places=2,
    )
    payment_method: PaymentMethod
    transaction_reference: str | None = Field(
        default=None,
        max_length=255,
    )
    payment_date: datetime | None = None
    notes: str | None = Field(
        default=None,
        max_length=5000,
    )


class PaymentDecision(BaseModel):
    status: Literal["Verified", "Rejected"]
    notes: str | None = Field(
        default=None,
        max_length=5000,
    )


class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    booking_id: UUID
    amount: Decimal
    payment_method: str
    transaction_reference: str | None
    status: PaymentStatus
    payment_date: datetime
    verified_by: UUID | None
    verified_at: datetime | None
    notes: str | None
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime
