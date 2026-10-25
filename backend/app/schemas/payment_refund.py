
from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PaymentRefundCreate(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    reason: str = Field(min_length=3, max_length=500)


class PaymentRefundDecision(BaseModel):
    status: Literal["Rejected"]
    external_reference: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=2000)


class PaymentRefundManualConfirmation(BaseModel):
    confirmed_returned: Literal[True]
    external_reference: str = Field(min_length=1, max_length=255)
    notes: str = Field(min_length=3, max_length=2000)


class PaymentRefundResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    booking_id: UUID
    payment_id: UUID
    amount: Decimal
    reason: str
    status: str
    external_reference: str | None
    notes: str | None
    created_by: UUID | None
    processed_by: UUID | None
    processed_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
