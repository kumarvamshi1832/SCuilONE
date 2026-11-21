from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RentalBookingRequestPortalCreate(BaseModel):
    property_id: UUID
    booking_type: Literal["Rent", "Lease"] | None = None
    buyer_requirement_id: UUID | None = None
    property_match_id: UUID | None = None
    accepted_offer_id: UUID | None = None
    proposed_rent_amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    proposed_deposit_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    desired_start_date: date
    desired_end_date: date | None = None
    duration_months: int | None = Field(default=None, ge=1, le=600)
    customer_notes: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.desired_end_date and self.desired_end_date < self.desired_start_date:
            raise ValueError("Desired end date cannot be before start date.")
        return self


class RentalBookingRequestWalkInCreate(BaseModel):
    property_id: UUID
    booking_type: Literal["Rent", "Lease"] | None = None
    contact_id: UUID | None = None
    account_id: UUID | None = None
    lead_id: UUID | None = None
    buyer_requirement_id: UUID | None = None
    property_match_id: UUID | None = None
    accepted_offer_id: UUID | None = None
    customer_name: str = Field(min_length=1, max_length=200)
    customer_email: str | None = Field(default=None, max_length=255)
    customer_phone: str | None = Field(default=None, max_length=30)
    proposed_rent_amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    proposed_deposit_amount: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    maintenance_amount: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    maintenance_frequency: Literal["Monthly", "Quarterly", "Yearly"] = "Monthly"
    desired_start_date: date
    desired_end_date: date | None = None
    duration_months: int | None = Field(default=None, ge=1, le=600)
    lock_in_months: int = Field(default=0, ge=0, le=600)
    notice_period_days: int = Field(default=30, ge=0, le=365)
    due_day: int = Field(default=5, ge=1, le=28)
    late_fee_type: Literal["Fixed", "Percentage"] = "Fixed"
    late_fee_amount: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    late_fee_grace_days: int = Field(default=0, ge=0, le=365)
    hold_hours: int | None = Field(default=None, ge=1, le=720)
    terms_notes: str | None = Field(default=None, max_length=5000)
    staff_notes: str | None = Field(default=None, max_length=5000)

    @model_validator(mode="after")
    def validate_walkin(self):
        if self.desired_end_date and self.desired_end_date < self.desired_start_date:
            raise ValueError("Desired end date cannot be before start date.")
        if self.contact_id is None and self.lead_id is None and self.buyer_requirement_id is None:
            raise ValueError("A walk-in rental/lease booking request must link a Contact, Lead, or BuyerRequirement.")
        return self


class RentalBookingRequestDecision(BaseModel):
    decision: Literal["Approve", "Reject"]
    approved_rent_amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    approved_deposit_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    maintenance_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    maintenance_frequency: Literal["Monthly", "Quarterly", "Yearly"] | None = None
    desired_start_date: date | None = None
    desired_end_date: date | None = None
    duration_months: int | None = Field(default=None, ge=1, le=600)
    lock_in_months: int | None = Field(default=None, ge=0, le=600)
    notice_period_days: int | None = Field(default=None, ge=0, le=365)
    due_day: int | None = Field(default=None, ge=1, le=28)
    late_fee_type: Literal["Fixed", "Percentage"] | None = None
    late_fee_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    late_fee_grace_days: int | None = Field(default=None, ge=0, le=365)
    hold_hours: int | None = Field(default=None, ge=1, le=720)
    terms_notes: str | None = Field(default=None, max_length=5000)
    staff_notes: str | None = Field(default=None, max_length=5000)
    rejection_reason: str | None = Field(default=None, max_length=5000)


class RentalBookingRequestCancel(BaseModel):
    reason: str = Field(min_length=3, max_length=5000)


class RentalBookingRequestResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    property_id: UUID
    booking_type: str
    channel: str
    portal_user_id: UUID | None = None
    contact_id: UUID | None = None
    account_id: UUID | None = None
    lead_id: UUID | None = None
    buyer_requirement_id: UUID | None = None
    property_match_id: UUID | None = None
    accepted_offer_id: UUID | None = None
    rental_agreement_id: UUID | None = None
    customer_name: str
    customer_email: str | None = None
    customer_phone: str | None = None
    proposed_rent_amount: Decimal
    approved_rent_amount: Decimal | None = None
    rent_frequency: str
    proposed_deposit_amount: Decimal
    approved_deposit_amount: Decimal | None = None
    maintenance_amount: Decimal
    maintenance_frequency: str
    desired_start_date: date
    desired_end_date: date | None = None
    duration_months: int | None = None
    lock_in_months: int
    notice_period_days: int
    due_day: int
    late_fee_type: str = "Fixed"
    late_fee_amount: Decimal = Decimal("0.00")
    late_fee_grace_days: int = 0
    status: str
    hold_created_at: datetime | None = None
    hold_expires_at: datetime | None = None
    expired_at: datetime | None = None
    terms_notes: str | None = None
    customer_notes: str | None = None
    staff_notes: str | None = None
    rejection_reason: str | None = None
    cancellation_reason: str | None = None
    reviewed_by: UUID | None = None
    reviewed_at: datetime | None = None
    created_by: UUID | None = None
    created_at: datetime
    updated_at: datetime


class RentalAgreementCreate(BaseModel):
    property_id: UUID
    lead_id: UUID | None = None
    contact_id: UUID | None = None
    buyer_requirement_id: UUID | None = None
    property_match_id: UUID | None = None
    accepted_offer_id: UUID | None = None
    agreement_type: Literal["Rent", "Lease"]
    customer_name: str = Field(min_length=1, max_length=200)
    customer_email: str | None = Field(default=None, max_length=255)
    customer_phone: str | None = Field(default=None, max_length=30)
    rent_amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    rent_frequency: Literal["Monthly", "Quarterly", "Yearly"] = "Monthly"
    deposit_amount: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    maintenance_amount: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    maintenance_frequency: Literal["Monthly", "Quarterly", "Yearly"] = "Monthly"
    agreement_start: date
    agreement_end: date | None = None
    lock_in_months: int = Field(default=0, ge=0, le=600)
    notice_period_days: int = Field(default=30, ge=0, le=365)
    due_day: int = Field(default=5, ge=1, le=28)
    late_fee_type: Literal["Fixed", "Percentage"] = "Fixed"
    late_fee_amount: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    late_fee_grace_days: int = Field(default=0, ge=0, le=365)
    escalation_percentage: Decimal | None = Field(default=None, ge=0, le=100, max_digits=5, decimal_places=2)
    escalation_interval_months: int | None = Field(default=None, ge=1, le=600)
    agreement_document_url: str | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def validate_dates_and_escalation(self):
        if self.agreement_end and self.agreement_end < self.agreement_start:
            raise ValueError("Agreement end date cannot be before start date.")
        if self.escalation_percentage is not None and self.escalation_interval_months is None:
            raise ValueError("Escalation interval is required when escalation is configured.")
        if self.lead_id is None and self.contact_id is None and self.buyer_requirement_id is None:
            raise ValueError("A rental agreement must be linked to a Lead, Contact, or BuyerRequirement.")
        if self.agreement_end:
            duration_months = max(0, (self.agreement_end.year - self.agreement_start.year) * 12 + self.agreement_end.month - self.agreement_start.month)
            if self.lock_in_months > duration_months:
                raise ValueError("Lock-in period cannot exceed the agreement duration.")
        return self


class RentalAgreementUpdate(BaseModel):
    customer_name: str | None = Field(default=None, min_length=1, max_length=200)
    customer_email: str | None = Field(default=None, max_length=255)
    customer_phone: str | None = Field(default=None, max_length=30)
    rent_amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    rent_frequency: Literal["Monthly", "Quarterly", "Yearly"] | None = None
    deposit_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    maintenance_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    maintenance_frequency: Literal["Monthly", "Quarterly", "Yearly"] | None = None
    agreement_start: date | None = None
    agreement_end: date | None = None
    lock_in_months: int | None = Field(default=None, ge=0, le=600)
    notice_period_days: int | None = Field(default=None, ge=0, le=365)
    due_day: int | None = Field(default=None, ge=1, le=28)
    late_fee_type: Literal["Fixed", "Percentage"] | None = None
    late_fee_amount: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    late_fee_grace_days: int | None = Field(default=None, ge=0, le=365)
    escalation_percentage: Decimal | None = Field(default=None, ge=0, le=100, max_digits=5, decimal_places=2)
    escalation_interval_months: int | None = Field(default=None, ge=1, le=600)
    agreement_document_url: str | None = None
    notes: str | None = None


class RentalAgreementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    property_id: UUID
    lead_id: UUID | None
    contact_id: UUID | None
    buyer_requirement_id: UUID | None
    property_match_id: UUID | None
    accepted_offer_id: UUID | None
    agreement_type: str
    status: str
    customer_name: str
    customer_email: str | None
    customer_phone: str | None
    rent_amount: Decimal
    rent_frequency: str
    deposit_amount: Decimal
    maintenance_amount: Decimal
    maintenance_frequency: str
    agreement_start: date
    agreement_end: date | None
    lock_in_months: int
    notice_period_days: int
    due_day: int
    late_fee_type: str = "Fixed"
    late_fee_amount: Decimal = Decimal("0.00")
    late_fee_grace_days: int = 0
    escalation_percentage: Decimal | None
    escalation_interval_months: int | None
    escalation_base_date: date | None
    agreement_document_url: str | None
    signed_at: datetime | None
    customer_signed_at: datetime | None
    customer_signature_method: str | None = None
    customer_signature_document_url: str | None = None
    customer_signature_ip: str | None = None
    customer_signature_user_agent: str | None = None
    customer_signature_name: str | None
    activated_at: datetime | None
    approved_by: UUID | None
    created_by: UUID | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class RentalAgreementSendForSignature(BaseModel):
    agreement_document_url: str = Field(min_length=1, max_length=5000)


class RentalAgreementCancel(BaseModel):
    reason: str = Field(min_length=1, max_length=2000)


class RentalAgreementWalkInSignature(BaseModel):
    signer_name: str = Field(min_length=2, max_length=200)
    signed_document_url: str = Field(min_length=8, max_length=2000)
    witnessed: bool


class RentalAgreementSignRequest(BaseModel):
    accepted_terms: bool
    signature_name: str = Field(min_length=2, max_length=200)

    @model_validator(mode="after")
    def require_acceptance(self):
        if not self.accepted_terms:
            raise ValueError("You must accept the agreement terms to sign.")
        return self


class RentalAgreementActivate(BaseModel):
    signed_at: datetime | None = None
    agreement_document_url: str | None = None
    confirm_deposit_received: bool = False


class RentalScheduleGenerate(BaseModel):
    through_date: date | None = None


class RentalPaymentCreate(BaseModel):
    schedule_id: UUID | None = None
    payment_type: Literal["Rent", "Deposit", "Maintenance", "Other"] = "Rent"
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    payment_method: Literal["Cash", "Bank Transfer", "UPI", "Cheque", "Card", "Other"]
    transaction_reference: str | None = Field(default=None, max_length=255)
    proof_document_url: str | None = Field(default=None, max_length=5000)
    payment_date: date = Field(default_factory=date.today)
    notes: str | None = None


class RentalPaymentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    agreement_id: UUID
    schedule_id: UUID | None
    settlement_id: UUID | None
    payment_type: str
    amount: Decimal
    payment_method: str
    transaction_reference: str | None
    proof_document_url: str | None
    receipt_number: str | None
    payment_date: date
    status: str
    verified_by: UUID | None
    verified_at: datetime | None
    created_by: UUID | None
    notes: str | None
    created_at: datetime


class RentalPaymentDecision(BaseModel):
    decision: Literal["Verified", "Rejected"]
    notes: str | None = None


class RentalDepositTransactionCreate(BaseModel):
    direction: Literal["Credit", "Debit"]
    transaction_type: Literal["Deposit Received", "Deposit Adjustment", "Refund", "Damage Deduction", "Utility Deduction", "Other Deduction"]
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    description: str = Field(min_length=1, max_length=5000)
    reference: str | None = Field(default=None, max_length=255)


class RentalExitRequestCreate(BaseModel):
    requested_vacate_date: date
    notice_served_date: date | None = None
    reason: str = Field(min_length=1, max_length=5000)


class RentalExitDecision(BaseModel):
    decision: Literal["Approved", "Rejected"]
    early_exit_approved: bool = False
    early_exit_charge: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    notice_period_waived: bool = False
    notice_shortfall_charge: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    decision_notes: str | None = Field(default=None, max_length=5000)


class RentalInspectionCreate(BaseModel):
    exit_request_id: UUID | None = None
    inspection_type: Literal["Move In", "Move Out", "Periodic"]
    condition: Literal["Excellent", "Good", "Fair", "Damaged"]
    damage_details: str | None = None
    damage_amount: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    photographs: list[str] = Field(default_factory=list, max_length=100)
    meter_readings: dict | None = None
    tenant_acknowledged: bool = False
    notes: str | None = None


class RentalInspectionAcknowledge(BaseModel):
    notes: str | None = Field(default=None, max_length=5000)


class RentalSettlementCalculate(BaseModel):
    exit_request_id: UUID
    utility_charges: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    notice_shortfall_charge: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    other_charges: Decimal = Field(default=Decimal("0.00"), ge=0, max_digits=14, decimal_places=2)
    notes: str | None = None


class RentalSettlementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    agreement_id: UUID
    exit_request_id: UUID | None
    deposit_balance: Decimal
    rent_arrears: Decimal
    utility_charges: Decimal
    damage_charges: Decimal
    early_exit_charge: Decimal
    notice_shortfall_charge: Decimal
    other_charges: Decimal
    deductions_total: Decimal
    refund_amount: Decimal
    amount_due_from_tenant: Decimal
    status: str
    calculation_snapshot: dict
    approved_by: UUID | None
    approved_at: datetime | None
    refunded_at: datetime | None
    refund_reference: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime


class RentalRefundCreate(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    reference: str = Field(min_length=1, max_length=255)
    notes: str | None = None


class RentalSettlementCollectionCreate(BaseModel):
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    payment_method: Literal["Cash", "Bank Transfer", "UPI", "Cheque", "Card", "Other"]
    transaction_reference: str | None = Field(default=None, max_length=255)
    payment_date: date = Field(default_factory=date.today)
    notes: str | None = None


class RentalHandoverComplete(BaseModel):
    allow_exception: bool = False
    exception_reason: str | None = Field(default=None, max_length=2000)


class RentalRenewalCreate(BaseModel):
    new_end_date: date
    new_rent_amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    reason: str | None = None


class RentalRenewalDecision(BaseModel):
    decision: Literal["Approved", "Rejected"]
    notes: str | None = None
