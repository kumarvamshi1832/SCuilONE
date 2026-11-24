"""Pydantic schemas for Phases 1-4: Real Estate business profiles, Global Agency onboarding/auth,
Company-Agency invitations & bi-directional connection requests, versioned agreements, and shared inventory.
"""
from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field, model_validator


class RealEstateBusinessProfileUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=2, max_length=200)
    rera_registration_number: str | None = Field(default=None, max_length=100)
    gst_number: str | None = Field(default=None, max_length=40)
    pan_number: str | None = Field(default=None, max_length=20)
    website: str | None = Field(default=None, max_length=255)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default=None, max_length=100)
    office_address: str | None = Field(default=None, max_length=1000)
    operating_cities: list[str] | None = None
    specializations: list[str] | None = None


class BusinessTypeConversionRequest(BaseModel):
    target_business_type: Literal["real_estate_company", "real_estate_agency"]
    reason: str = Field(min_length=10, max_length=1000)


class CommissionRuleIn(BaseModel):
    structure: Literal["percentage", "fixed", "one_month_rent", "custom"]
    value: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    payer: Literal["company", "customer", "owner", "split"] = "company"
    calculation_basis: str = Field(default="agreed_transaction_value", min_length=2, max_length=120)
    eligibility_conditions: str = Field(default="Verified booking/agreement confirmation", max_length=500)
    trigger_event: str = Field(default="booking_confirmed", min_length=2, max_length=120)
    payment_due_days: int = Field(default=15, ge=0, le=180)
    tax_and_deduction_terms: str | None = Field(default=None, max_length=500)
    cancellation_refund_treatment: str = Field(
        default="Reversible if transaction cancelled before confirmation", max_length=500
    )


class CommissionTermsBundleIn(BaseModel):
    sale: CommissionRuleIn | None = None
    rent: CommissionRuleIn | None = None
    lease: CommissionRuleIn | None = None


class AgencyInviteCreateIn(BaseModel):
    agency_name: str = Field(min_length=2, max_length=200)
    contact_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    phone: str = Field(min_length=7, max_length=30)
    business_details: dict | None = None
    can_sale: bool = True
    can_rent: bool = False
    can_lease: bool = False
    sharing_scope: Literal["all_eligible", "selected_properties"] = "selected_properties"
    property_ids: list[UUID] = Field(default_factory=list)
    commission_terms: CommissionTermsBundleIn = Field(default_factory=CommissionTermsBundleIn)
    responsibilities: dict = Field(default_factory=dict)
    agreement_text: str | None = Field(default=None, max_length=20000)
    start_date: date | None = None
    expiry_date: date | None = None
    termination_notice_days: int = Field(default=30, ge=0, le=365)
    expires_in_hours: int = Field(default=168, ge=1, le=720)

    @model_validator(mode="after")
    def validate_terms(self):
        if not (self.can_sale or self.can_rent or self.can_lease):
            raise ValueError("Enable at least one transaction permission (Sale, Rent, or Lease).")
        if self.start_date and self.expiry_date and self.expiry_date < self.start_date:
            raise ValueError("expiry_date cannot be earlier than start_date.")
        return self


class InvitationOnboardingIn(BaseModel):
    token: str = Field(min_length=20)
    onboarding_choice: Literal["free_external", "paid_tenant"]
    password: str | None = Field(default=None, min_length=12, max_length=128)
    full_name: str | None = Field(default=None, min_length=2, max_length=150)
    rera_registration_number: str | None = Field(default=None, max_length=100)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    office_address: str | None = Field(default=None, max_length=1000)


class FreeAgencyLoginIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class AgencyConnectionRequestIn(BaseModel):
    company_tenant_id: UUID
    can_sale: bool = True
    can_rent: bool = False
    can_lease: bool = False
    sharing_scope: Literal["all_eligible", "selected_properties"] = "all_eligible"
    commission_terms: CommissionTermsBundleIn = Field(default_factory=CommissionTermsBundleIn)
    responsibilities: dict = Field(default_factory=dict)
    agreement_text: str | None = Field(default=None, max_length=20000)
    start_date: date | None = None
    expiry_date: date | None = None
    termination_notice_days: int = Field(default=30, ge=0, le=365)
    notes: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_perms(self):
        if not (self.can_sale or self.can_rent or self.can_lease):
            raise ValueError("Request at least one transaction permission (Sale, Rent, or Lease).")
        return self


class AgreementCounterproposalIn(BaseModel):
    can_sale: bool
    can_rent: bool
    can_lease: bool
    sharing_scope: Literal["all_eligible", "selected_properties"]
    commission_terms: CommissionTermsBundleIn
    responsibilities: dict = Field(default_factory=dict)
    agreement_text: str | None = Field(default=None, max_length=20000)
    effective_from: date | None = None
    effective_to: date | None = None
    termination_notice_days: int = Field(default=30, ge=0, le=365)
    change_summary: str = Field(min_length=5, max_length=1000)

    @model_validator(mode="after")
    def validate_perms(self):
        if not (self.can_sale or self.can_rent or self.can_lease):
            raise ValueError("Enable at least one transaction permission (Sale, Rent, or Lease).")
        return self


class AgreementSignIn(BaseModel):
    signature_name: str = Field(min_length=2, max_length=150)
    accepted_terms: bool = True


class ConnectionStatusActionIn(BaseModel):
    reason: str = Field(min_length=5, max_length=1000)
    post_termination_policy: Literal["preserve_active_transactions", "company_direct_takeover"] | None = None


class PropertyShareUpdateIn(BaseModel):
    sharing_scope: Literal["all_eligible", "selected_properties"] | None = None
    grant_property_ids: list[UUID] = Field(default_factory=list)
    revoke_property_ids: list[UUID] = Field(default_factory=list)
    notes: str | None = Field(default=None, max_length=500)
