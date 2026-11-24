"""Pydantic schemas for Bundle 2 (Phases 5–10):
- Agency team members, leads, requirements, shortlists
- Multi-party site visits & 3-party feedback, offers/counteroffers
- Agency-submitted Sale booking requests, agreements, payment evidence & entity-aware support routing
"""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator


# --- Phase 5: Free/Paid Agency Team ---

class AgencyTeamMemberCreateIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    phone: str | None = Field(default=None, max_length=30)
    password: str = Field(min_length=12, max_length=128)
    role: Literal["agency_owner", "agency_agent"] = "agency_agent"


# --- Phase 6: Agency Leads, Requirements & Shortlists ---

class AgencyLeadCreateIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr | None = None
    phone: str | None = Field(default=None, max_length=30)
    source: str = Field(default="Direct", max_length=50)
    notes: str | None = Field(default=None, max_length=3000)
    customer_consent_given: bool = False


class AgencyRequirementCreateIn(BaseModel):
    agency_lead_id: UUID
    transaction_type: Literal["Sale", "Rent", "Lease"] = "Sale"
    property_type: str | None = Field(default=None, max_length=50)
    city: str | None = Field(default=None, max_length=100)
    preferred_locality: str | None = Field(default=None, max_length=150)
    bedrooms: int | None = Field(default=None, ge=0, le=20)
    min_budget: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    max_budget: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    min_area: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    max_area: Decimal | None = Field(default=None, ge=0, max_digits=12, decimal_places=2)
    preferred_amenities: list[str] | None = None
    lease_duration_months: int | None = Field(default=None, ge=1, le=360)
    lock_in_months: int | None = Field(default=None, ge=0, le=120)
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def check_ranges(self):
        if self.min_budget is not None and self.max_budget is not None and self.min_budget > self.max_budget:
            raise ValueError("min_budget cannot exceed max_budget.")
        return self


class AgencyShortlistAddIn(BaseModel):
    agency_requirement_id: UUID
    connection_id: UUID
    property_id: UUID
    notes: str | None = Field(default=None, max_length=1000)


# --- Phase 7: Site Visits & Offers ---

class AgencySiteVisitRequestIn(BaseModel):
    connection_id: UUID
    property_id: UUID
    agency_lead_id: UUID
    scheduled_start: datetime
    scheduled_end: datetime
    notes: str | None = Field(default=None, max_length=1000)

    @model_validator(mode="after")
    def check_times(self):
        if self.scheduled_end <= self.scheduled_start:
            raise ValueError("scheduled_end must be after scheduled_start.")
        return self


class CompanySiteVisitDecisionIn(BaseModel):
    decision: Literal["Approve", "Reject", "Reschedule"]
    assigned_to: UUID | None = None
    scheduled_start: datetime | None = None
    scheduled_end: datetime | None = None
    visit_instructions: str | None = Field(default=None, max_length=2000)
    reason: str | None = Field(default=None, max_length=1000)


class SiteVisitFeedbackIn(BaseModel):
    feedback: str = Field(min_length=3, max_length=3000)
    interest_level: Literal["High", "Medium", "Low", "Not Interested"] | None = None
    mark_completed: bool = False


class AgencyOfferCreateIn(BaseModel):
    connection_id: UUID
    property_id: UUID
    agency_lead_id: UUID
    offered_price: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    price_frequency: Literal["One-Time", "Monthly", "Yearly"] = "One-Time"
    terms: str | None = Field(default=None, max_length=3000)
    expires_in_hours: int = Field(default=72, ge=1, le=720)


class CompanyOfferDecisionIn(BaseModel):
    decision: Literal["Accept", "Reject", "Counteroffer"]
    counter_price: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    response_notes: str | None = Field(default=None, max_length=2000)


# --- Phase 8 & 9: Agency Sale Booking Request, Agreement & Payment Evidence ---

class AgencySaleBookingRequestCreateIn(BaseModel):
    connection_id: UUID
    property_id: UUID
    agency_lead_id: UUID
    agency_requirement_id: UUID | None = None
    accepted_offer_id: UUID | None = None
    proposed_price: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    booking_amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    payment_preference: Literal["Full Payment", "Installments"] = "Full Payment"
    customer_consent_confirmed: bool = True
    agency_notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def check_amounts(self):
        if self.booking_amount > self.proposed_price:
            raise ValueError("booking_amount cannot exceed proposed_price.")
        if not self.customer_consent_confirmed:
            raise ValueError("Customer consent is required before sharing customer details with the company.")
        return self


class CompanySaleBookingDecisionIn(BaseModel):
    decision: Literal["Approve", "Reject"]
    agreed_price: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    booking_amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    hold_hours: int = Field(default=48, ge=1, le=336)
    payment_instructions: str | None = Field(default=None, max_length=5000)
    agreement_text: str | None = Field(default=None, max_length=30000)
    company_notes: str | None = Field(default=None, max_length=2000)
    rejection_reason: str | None = Field(default=None, max_length=2000)


class SaleAgreementSignIn(BaseModel):
    customer_signed_name: str = Field(min_length=2, max_length=150)


class AgencyPaymentEvidenceIn(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    payment_method: str = Field(min_length=2, max_length=50)
    transaction_reference: str = Field(min_length=3, max_length=120)
    installment_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=1000)


class CompanyPaymentVerifyIn(BaseModel):
    decision: Literal["Verify", "Reject"]
    notes: str | None = Field(default=None, max_length=1000)


# --- Phase 10: Entity-Aware After-Sales Support ---

class EntityAwareSupportCreateIn(BaseModel):
    booking_id: UUID
    issue_type: Literal["property_defect", "rental_maintenance", "booking_clarification", "agency_complaint", "payment_verification"]
    subject: str = Field(min_length=4, max_length=200)
    description: str = Field(min_length=10, max_length=5000)
    priority: Literal["Low", "Medium", "High", "Urgent"] = "Medium"
