
from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


BookingStatus = Literal["Pending", "Confirmed", "Completed", "Cancelled"]


class BookingCreate(BaseModel):
    property_id: UUID
    buyer_name: str = Field(min_length=1, max_length=200)
    buyer_email: str | None = Field(default=None, max_length=255)
    buyer_phone: str | None = Field(default=None, max_length=30)
    booking_amount: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    agreed_price: Decimal | None = Field(
        default=None,
        gt=0,
        max_digits=14,
        decimal_places=2,
    )


class BookingUpdate(BaseModel):
    buyer_name: str | None = Field(default=None, min_length=1, max_length=200)
    buyer_email: str | None = Field(default=None, max_length=255)
    buyer_phone: str | None = Field(default=None, max_length=30)
    status: Literal["Pending", "Confirmed", "Completed"] | None = None


class BookingCancel(BaseModel):
    cancellation_reason: str = Field(min_length=1, max_length=2000)


class BookingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    property_id: UUID
    buyer_name: str
    buyer_email: str | None
    buyer_phone: str | None
    booking_amount: Decimal
    agreed_price: Decimal
    refund_amount: Decimal
    status: BookingStatus
    booking_date: datetime
    cancellation_reason: str | None
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime
