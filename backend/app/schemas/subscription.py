from datetime import date
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from pydantic import BaseModel, EmailStr, Field, model_validator


class SelectPlanRequest(BaseModel):
    plan_id: UUID | None = None
    plan_key: str | None = Field(default=None, max_length=80)
    billing_cycle: str = Field(default="Monthly", pattern="^(Monthly|Annual|monthly|annual)$")

    # Explicitly capture forbidden manipulation fields so we can reject with 403 Forbidden (PART 2 & PART 14)
    status: Any | None = None
    price: Any | None = None
    amount: Any | None = None
    tax_amount: Any | None = None
    total_amount: Any | None = None
    trial_start_date: Any | None = None
    trial_end_date: Any | None = None
    trial_days: Any | None = None

    @model_validator(mode="after")
    def validate_plan_selection(self):
        forbidden = [
            name
            for name in (
                "status",
                "price",
                "amount",
                "tax_amount",
                "total_amount",
                "trial_start_date",
                "trial_end_date",
                "trial_days",
            )
            if getattr(self, name, None) is not None
        ]
        if forbidden:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Security violation: tenants cannot manipulate {', '.join(forbidden)}. All pricing, trial dates, and status transitions are controlled by the backend.",
            )
        if not self.plan_id and not (self.plan_key and self.plan_key.strip()):
            raise ValueError("Either plan_id or plan_key must be provided.")
        self.billing_cycle = self.billing_cycle.strip().title()
        return self


class TenantManualPaymentSubmitRequest(BaseModel):
    invoice_id: UUID | None = None
    transaction_reference: str = Field(min_length=2, max_length=120)
    amount: Decimal = Field(gt=0)
    currency: str = Field(default="INR", max_length=10)
    payment_method: str = Field(default="Bank Transfer", min_length=2, max_length=50)
    payment_date: date | None = None
    payment_proof_url: str | None = Field(default=None, max_length=2000)
    payment_proof_filename: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=1000)

    # Forbidden fields that a tenant must never set
    status: str | None = None
    approved_by: Any | None = None
    payment_approved_at: Any | None = None

    @model_validator(mode="after")
    def forbid_self_approval(self):
        if self.status is not None and self.status.strip() not in {"Submitted"}:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Security violation: tenants cannot set payment status or mark their own payment as Successful.",
            )
        if self.approved_by is not None or self.payment_approved_at is not None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Security violation: tenants cannot approve their own payments.",
            )
        return self


class TenantBillingInfoUpdateRequest(BaseModel):
    company_name: str | None = Field(default=None, min_length=2, max_length=150)
    billing_email: EmailStr | None = None
    billing_phone: str | None = Field(default=None, max_length=30)
    billing_address: str | None = Field(default=None, max_length=1000)
    gst_number: str | None = Field(default=None, max_length=40)
    email_reminders_opt_out: bool | None = None

    # Forbidden fields
    trial_start_date: Any | None = None
    trial_end_date: Any | None = None
    status: Any | None = None

    @model_validator(mode="after")
    def forbid_trial_or_status_manipulation(self):
        if (
            self.trial_start_date is not None
            or self.trial_end_date is not None
            or self.status is not None
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Security violation: tenants cannot manipulate trial dates or subscription status.",
            )
        return self


class TenantCancelSubscriptionRequest(BaseModel):
    reason: str | None = Field(default=None, max_length=500)
    cancel_immediately: bool = False


class AdminPaymentApprovalRequest(BaseModel):
    admin_notes: str | None = Field(default=None, max_length=1000)


class AdminPaymentRejectionRequest(BaseModel):
    rejection_reason: str = Field(min_length=3, max_length=1000)
    admin_notes: str | None = Field(default=None, max_length=1000)


class AdminSubscriptionSuspensionRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=1000)


class AdminSubscriptionReactivationRequest(BaseModel):
    reason: str = Field(default="Reactivated by Platform Admin", min_length=3, max_length=1000)
    extend_days: int | None = Field(default=None, ge=1, le=365)


class AdminComplimentarySubscriptionRequest(BaseModel):
    tenant_id: UUID
    plan_id: UUID | None = None
    plan_key: str | None = Field(default="enterprise", max_length=60)
    billing_cycle: str = Field(default="Annual", pattern="^(Monthly|Annual)$")
    duration_days: int = Field(default=365, ge=1, le=3650)
    reason: str = Field(min_length=5, max_length=1000)


class TenantSupportRequest(BaseModel):
    subject: str = Field(min_length=1, max_length=200)
    description: str = Field(min_length=1, max_length=10000)
    category: str = Field(default="Billing", max_length=60)
    priority: str = Field(default="High", max_length=30)
    requester_name: str | None = Field(default=None, max_length=150)
    requester_email: str | None = Field(default=None, max_length=255)
