
from datetime import datetime, date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator, EmailStr


BookingStatus = Literal["Pending", "Confirmed", "Completed", "Cancelled"]


class BookingNomineeInput(BaseModel):
    nominee_name: str = Field(min_length=2, max_length=200)
    relationship: str = Field(min_length=2, max_length=80)
    phone: str | None = Field(default=None, max_length=30)
    email: EmailStr | None = None
    date_of_birth: date | None = None
    address: str | None = Field(default=None, max_length=2000)
    allocation_percentage: Decimal | None = Field(default=None, gt=0, le=100, max_digits=5, decimal_places=2)
    remarks: str | None = Field(default=None, max_length=2000)


class BookingNomineeResponse(BookingNomineeInput):
    id: UUID
    tenant_id: UUID
    booking_id: UUID
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


def validate_nominee_allocations(nominees):
    supplied = [n.allocation_percentage for n in nominees if n.allocation_percentage is not None]
    if supplied and len(supplied) != len(nominees):
        raise ValueError("Provide allocation_percentage for every nominee or for none of them.")
    if supplied and sum(supplied, Decimal("0.00")) != Decimal("100.00"):
        raise ValueError("Nominee allocation percentages must total exactly 100%.")
    return nominees


class BookingCreate(BaseModel):
    property_id: UUID
    buyer_name: str = Field(min_length=1, max_length=200)
    buyer_email: str | None = Field(default=None, max_length=255)
    buyer_phone: str | None = Field(default=None, max_length=30)
    buyer_address: str | None = Field(default=None, max_length=2000)
    nominees: list[BookingNomineeInput] = Field(default_factory=list, max_length=20)
    lead_id: UUID | None = None
    buyer_requirement_id: UUID | None = None
    accepted_offer_id: UUID | None = None
    booking_amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    payment_preference: Literal["Full Payment", "Installments"] = "Full Payment"
    installment_request_notes: str | None = Field(default=None, max_length=2000)
    agreed_price: Decimal | None = Field(
        default=None,
        gt=0,
        max_digits=14,
        decimal_places=2,
    )

    @model_validator(mode="after")
    def validate_nominees(self):
        validate_nominee_allocations(self.nominees)
        if self.agreed_price is not None and self.booking_amount > self.agreed_price:
            raise ValueError("booking_amount cannot exceed agreed_price.")
        return self


class BookingUpdate(BaseModel):
    buyer_name: str | None = Field(default=None, min_length=1, max_length=200)
    buyer_email: str | None = Field(default=None, max_length=255)
    buyer_phone: str | None = Field(default=None, max_length=30)
    buyer_address: str | None = Field(default=None, max_length=2000)
    nominees: list[BookingNomineeInput] = Field(default_factory=list, max_length=20)
    status: Literal["Pending", "Confirmed", "Completed"] | None = None

    @model_validator(mode="after")
    def validate_nominees(self):
        if "nominees" in self.model_fields_set:
            validate_nominee_allocations(self.nominees)
        return self


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
    buyer_address: str | None = None
    buyer_details_submitted_at: datetime | None = None
    nominees: list[BookingNomineeResponse] = Field(default_factory=list)
    lead_id: UUID | None = None
    buyer_requirement_id: UUID | None = None
    accepted_offer_id: UUID | None = None
    payment_preference: Literal["Full Payment", "Installments"]
    installment_request_notes: str | None
    booking_amount: Decimal
    agreed_price: Decimal
    refund_amount: Decimal
    status: BookingStatus
    booking_date: datetime
    cancellation_reason: str | None
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime


class CustomerBookingDetailsUpdate(BaseModel):
    buyer_name: str = Field(min_length=2, max_length=200)
    buyer_phone: str = Field(min_length=7, max_length=30)
    buyer_email: EmailStr | None = None
    buyer_address: str | None = Field(default=None, max_length=2000)
    nominees: list[BookingNomineeInput] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def validate_nominees(self):
        validate_nominee_allocations(self.nominees)
        return self
