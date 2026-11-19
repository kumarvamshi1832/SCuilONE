
from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


PaymentMethod = Literal[
    "Cash",
    "Bank Transfer",
    "UPI",
    "Cheque",
    "Demand Draft",
    "Card",
    "Other",
]

PaymentStatus = Literal["Pending", "Under Verification", "Verified", "Rejected", "Failed"]


class PaymentCreate(BaseModel):
    installment_id: UUID | None = None
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

    @model_validator(mode="after")
    def require_reference_for_traceable_modes(self):
        if self.payment_method in ("UPI", "Bank Transfer", "Cheque", "Demand Draft", "Card") and not (self.transaction_reference or "").strip():
            raise ValueError("Transaction/reference number is required for this payment mode.")
        return self


class PaymentDecision(BaseModel):
    # "Under Verification" marks the payment as picked up for review; the other three close it.
    status: Literal["Under Verification", "Verified", "Rejected", "Failed"]
    notes: str | None = Field(
        default=None,
        max_length=5000,
    )

    @model_validator(mode="after")
    def rejection_requires_reason(self):
        if self.status == "Rejected" and not (self.notes or "").strip():
            raise ValueError("A rejection reason is required when rejecting a payment.")
        return self


class PaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    booking_id: UUID
    installment_id: UUID | None
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
