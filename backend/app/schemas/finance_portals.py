from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator



class AgencyRentalBookingRequestIn(BaseModel):
    connection_id: UUID
    property_id: UUID
    agency_lead_id: UUID
    booking_type: Literal["Rent", "Lease"] = "Rent"
    proposed_rent_amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    proposed_deposit_amount: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    advance_amount: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    duration_months: int | None = Field(default=11, ge=1, le=360)
    lock_in_months: int = Field(default=3, ge=0, le=120)
    notice_period_days: int = Field(default=30, ge=0, le=365)
    escalation_frequency_months: int | None = Field(default=None, ge=1, le=60)
    escalation_percent: Decimal | None = Field(default=None, ge=0, le=100, max_digits=6, decimal_places=2)
    maintenance_responsibility: Literal["tenant", "owner", "shared"] = "tenant"
    desired_start_date: date | None = None
    notes: str | None = Field(default=None, max_length=2000)


class LeaseEscalationPreviewIn(BaseModel):
    base_rent: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    duration_months: int = Field(ge=1, le=360)
    escalation_frequency_months: int = Field(default=12, ge=1, le=60)
    escalation_percent: Decimal = Field(default=Decimal("5.00"), ge=0, le=100, max_digits=6, decimal_places=2)



class FreeAgencyUpgradeIn(BaseModel):
    company_name: str | None = Field(default=None, min_length=2, max_length=150)
    gst_number: str | None = Field(default=None, max_length=40)
    rera_registration_number: str | None = Field(default=None, max_length=100)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    office_address: str | None = Field(default=None, max_length=1000)



class CommissionCalculateIn(BaseModel):
    connection_id: UUID
    transaction_type: Literal["Sale", "Rent", "Lease"]
    transaction_value: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    booking_id: UUID | None = None
    rental_agreement_id: UUID | None = None
    tax_deduction: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    other_deductions: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    notes: str | None = Field(default=None, max_length=1000)


class CommissionActionIn(BaseModel):
    action: Literal["Approve", "MarkPaid", "Reverse"]
    payout_reference: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)


class PropertyOwnerCreateIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=30)
    pan_number: str | None = Field(default=None, max_length=20)
    payout_details: dict | None = None
    portal_password: str | None = Field(default=None, min_length=12, max_length=128)


class OwnerMandateCreateIn(BaseModel):
    owner_id: UUID
    property_id: UUID
    management_fee_type: Literal["percentage", "fixed"] = "percentage"
    management_fee_value: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    collection_authority: Literal["authorized_collection", "direct_to_owner"] = "authorized_collection"
    starts_at: date | None = None
    expires_at: date | None = None
    termination_notice_days: int = Field(default=30, ge=0, le=365)
    agreement_text: str | None = Field(default=None, max_length=10000)


class OwnerPortalLoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class OwnerPayoutRecordIn(BaseModel):
    mandate_id: UUID
    rental_agreement_id: UUID
    rental_payment_id: UUID | None = None
    rent_collected: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    commission_deduction: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    approved_expenses: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    notes: str | None = Field(default=None, max_length=1000)


class OwnerPayoutMarkPaidIn(BaseModel):
    bank_transfer_reference: str = Field(min_length=3, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)


class AgencyCustomerCommissionIn(BaseModel):
    """Record buyer/tenant/leaseholder-side brokerage commission for Free or Paid agencies."""
    connection_id: UUID | None = None
    transaction_type: Literal["Sale", "Rent", "Lease"]
    transaction_value: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    commission_structure: Literal["percentage", "fixed", "one_month_rent", "custom"] = "one_month_rent"
    commission_rate_or_value: Decimal = Field(default=Decimal("1.00"), ge=0, max_digits=14, decimal_places=2)
    booking_id: UUID | None = None
    rental_agreement_id: UUID | None = None
    customer_name: str | None = Field(default=None, max_length=150)
    tax_deduction: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    other_deductions: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    payment_received: bool = False
    payout_reference: str | None = Field(default=None, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def validate_received(self):
        if self.payment_received and not (self.payout_reference and self.payout_reference.strip()):
            raise ValueError("payout_reference is required when payment_received is true.")
        return self


class AgencyCustomerCommissionMarkPaidIn(BaseModel):
    payout_reference: str = Field(min_length=3, max_length=120)
    notes: str | None = Field(default=None, max_length=1000)
