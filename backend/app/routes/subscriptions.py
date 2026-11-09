from datetime import date
from decimal import Decimal
from pathlib import Path
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_active_user
from app.core.platform_rbac import auto_route_support_ticket
from app.core.subscription_config import FREE_TRIAL_DAYS, ensure_utc, utc_now
from app.models.platform import (
    PlatformBillingInvoice,
    PlatformBillingPayment,
    PlatformSubscriptionEvent,
    PlatformSubscriptionPlan,
    PlatformSubscriptionReminderCampaign,
    PlatformTenantSubscription,
)
from app.models.support_ticket import SupportTicket
from app.models.tenant import Tenant
from app.models.user import User
from app.schemas.subscription import (
    SelectPlanRequest,
    TenantSupportRequest,
    TenantBillingInfoUpdateRequest,
    TenantCancelSubscriptionRequest,
    TenantManualPaymentSubmitRequest,
)
from app.schemas.support_tickets import SupportTicketCreate
from app.services.audit_service import log_audit
from app.services.subscription_service import (
    ensure_subscription_infrastructure_seeded,
    get_effective_plan_resources,
    get_tenant_subscription,
    record_subscription_event,
    select_tenant_subscription_plan,
    serialize_invoice,
    serialize_payment,
    serialize_plan_details,
    serialize_reminder_campaign,
    serialize_subscription,
    submit_manual_payment_details,
    sync_tenant_subscription_state,
)

router = APIRouter(prefix="/api/v1/subscription", tags=["Tenant Subscription & Billing"])
alias_router = APIRouter(prefix="/api/v1/subscriptions", tags=["Tenant Subscription & Billing (Alias)"])
billing_alias_router = APIRouter(prefix="/api/v1/billing", tags=["Tenant Billing (Alias)"])


def _get_tenant_and_user_ids(current_user: dict) -> tuple[UUID, UUID]:
    try:
        return UUID(str(current_user["tenant_id"])), UUID(str(current_user["user_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid authenticated user or tenant context.")


# ============================================================================
# 1. LIST & VIEW AVAILABLE SUBSCRIPTION PLANS (PART 2)
# ============================================================================

@router.get("/plans")
@alias_router.get("/plans")
@billing_alias_router.get("/plans")
def list_available_plans_for_tenant(
    include_trial: bool = Query(default=True),
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """
    PART 2 Req 1 – List available subscription plans with price, currency, limits, enabled modules, and features.
    Accessible during Trial, Active, and after Trial Expiration (PART 7).
    """
    ensure_subscription_infrastructure_seeded(db)
    tenant_id, _ = _get_tenant_and_user_ids(current_user)
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    industry = tenant.industry if tenant else None

    q = db.query(PlatformSubscriptionPlan).filter(PlatformSubscriptionPlan.is_active.is_(True))
    if not include_trial:
        q = q.filter(PlatformSubscriptionPlan.plan_key != "free_trial")
    plans = q.order_by(PlatformSubscriptionPlan.price.asc()).all()

    return {
        "global_free_trial_days": FREE_TRIAL_DAYS,
        "items": [serialize_plan_details(p, industry) for p in plans],
        "total": len(plans),
    }


@router.get("/plans/{plan_identifier}")
@alias_router.get("/plans/{plan_identifier}")
@billing_alias_router.get("/plans/{plan_identifier}")
def get_plan_details_for_tenant(
    plan_identifier: str,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """PART 2 Req 2 – View individual subscription plan details by plan_id or plan_key."""
    ensure_subscription_infrastructure_seeded(db)
    tenant_id, _ = _get_tenant_and_user_ids(current_user)
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()

    plan = None
    try:
        plan_uuid = UUID(plan_identifier)
        plan = db.query(PlatformSubscriptionPlan).filter(PlatformSubscriptionPlan.id == plan_uuid).first()
    except ValueError:
        cleaned = plan_identifier.strip().lower()
        plan = (
            db.query(PlatformSubscriptionPlan)
            .filter(
                (func.lower(PlatformSubscriptionPlan.plan_key) == cleaned)
                | (func.lower(PlatformSubscriptionPlan.name) == cleaned)
            )
            .first()
        )

    if not plan:
        raise HTTPException(status_code=404, detail="Subscription plan not found.")
    return serialize_plan_details(plan, tenant.industry if tenant else None)


# ============================================================================
# 2. SELECT SUBSCRIPTION PLAN & AUTO-GENERATE PLATFORM INVOICE (PART 2 & PART 3)
# ============================================================================

@router.post("/select-plan", status_code=status.HTTP_200_OK)
@alias_router.post("/select-plan", status_code=status.HTTP_200_OK)
@billing_alias_router.post("/select-plan", status_code=status.HTTP_200_OK)
def tenant_select_subscription_plan(
    payload: SelectPlanRequest,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """
    PART 2 Req 3 & PART 3 – Select a paid subscription plan.
    - Stores selected_plan_id as the intended paid plan WITHOUT terminating an active 14-day free trial.
    - Automatically generates a PlatformBillingInvoice using trusted database plan prices.
    - Prevents duplicate invoice creation on repeated requests.
    """
    tenant_id, user_id = _get_tenant_and_user_ids(current_user)
    result = select_tenant_subscription_plan(
        db=db,
        tenant_id=tenant_id,
        user_id=user_id,
        plan_id=payload.plan_id,
        plan_key=payload.plan_key,
        billing_cycle=payload.billing_cycle,
    )
    return {
        "message": (
            "Subscription plan selected and platform invoice generated."
            if not result["duplicate_prevented"]
            else "Subscription plan already selected; returning existing open invoice."
        ),
        **result,
    }


# ============================================================================
# 3. VIEW CURRENT SUBSCRIPTION STATUS, SELECTED PLAN & RESOURCES (PART 2 & PART 7)
# ============================================================================

@router.get("/status")
@router.get("/current")
@alias_router.get("/status")
@alias_router.get("/current")
@billing_alias_router.get("/status")
def get_my_subscription_status(
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """
    PART 2 Req 4 & 5 – View the tenant's current subscription status, trial dates, selected plan, and enforced resources.
    """
    ensure_subscription_infrastructure_seeded(db)
    tenant_id, _ = _get_tenant_and_user_ids(current_user)
    sub = sync_tenant_subscription_state(db, tenant_id)
    if not sub:
        tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
        return {
            "tenant_id": str(tenant_id),
            "company_name": tenant.name if tenant else None,
            "status": "None",
            "crm_access_allowed": not getattr(tenant, "trial_used", False),
            "current_plan": None,
            "selected_plan": None,
            "resources": get_effective_plan_resources(db, tenant_id),
        }
    return serialize_subscription(db, sub)


@router.get("/selected-plan")
@alias_router.get("/selected-plan")
def get_my_selected_plan(
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """PART 2 Req 4 – View the tenant's currently selected paid plan."""
    tenant_id, _ = _get_tenant_and_user_ids(current_user)
    sub = sync_tenant_subscription_state(db, tenant_id)
    if not sub:
        raise HTTPException(status_code=404, detail="No subscription found for this tenant.")
    data = serialize_subscription(db, sub)
    return {
        "subscription_id": data["subscription_id"],
        "tenant_id": data["tenant_id"],
        "status": data["status"],
        "current_plan": data["current_plan"],
        "selected_plan": data["selected_plan"],
        "selected_billing_cycle": data["selected_billing_cycle"],
    }


@router.get("/resources")
@alias_router.get("/resources")
def get_my_plan_resources(
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """PART 11 – View effective plan resource limits and current tenant usage."""
    tenant_id, _ = _get_tenant_and_user_ids(current_user)
    return get_effective_plan_resources(db, tenant_id)


# ============================================================================
# 4. VIEW & DOWNLOAD TENANT PLATFORM INVOICES (PART 2 Req 6 & PART 3)
# ============================================================================

@router.get("/invoices")
@alias_router.get("/invoices")
@billing_alias_router.get("/invoices")
def list_my_subscription_invoices(
    status_filter: str | None = Query(default=None, alias="status"),
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """PART 2 Req 6 & PART 3 Req 7 – Allow tenant to view only its own subscription invoices."""
    tenant_id, _ = _get_tenant_and_user_ids(current_user)
    q = db.query(PlatformBillingInvoice).filter(PlatformBillingInvoice.tenant_id == tenant_id)
    if status_filter:
        q = q.filter(PlatformBillingInvoice.status == status_filter)
    invoices = q.order_by(PlatformBillingInvoice.created_at.desc()).all()
    return {
        "items": [serialize_invoice(db, inv) for inv in invoices],
        "total": len(invoices),
    }


@router.get("/invoices/{invoice_id}")
@alias_router.get("/invoices/{invoice_id}")
@billing_alias_router.get("/invoices/{invoice_id}")
def get_my_subscription_invoice(
    invoice_id: UUID,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """
    PART 3 & PART 14 Rule 2 – View a single platform invoice.
    Strictly blocks access if the invoice belongs to another tenant.
    """
    tenant_id, _ = _get_tenant_and_user_ids(current_user)
    inv = db.query(PlatformBillingInvoice).filter(PlatformBillingInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    if str(inv.tenant_id) != str(tenant_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: you cannot view another tenant's invoice.",
        )
    return serialize_invoice(db, inv)


@router.get("/invoices/{invoice_id}/download")
@alias_router.get("/invoices/{invoice_id}/download")
@billing_alias_router.get("/invoices/{invoice_id}/download")
def download_my_subscription_invoice(
    invoice_id: UUID,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """PART 3 – Downloadable representation of the tenant's platform invoice."""
    tenant_id, _ = _get_tenant_and_user_ids(current_user)
    inv = db.query(PlatformBillingInvoice).filter(PlatformBillingInvoice.id == invoice_id).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    if str(inv.tenant_id) != str(tenant_id):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied: you cannot download another tenant's invoice.",
        )
    data = serialize_invoice(db, inv)
    return {
        "download_ready": True,
        "document_title": f"SCuilONE Platform Invoice {inv.invoice_number}",
        "issuer": "StaunchCuil Services Private Limited (SCuilONE Platform)",
        "invoice": data,
    }


# ============================================================================
# 5. SUBMIT MANUAL PAYMENT DETAILS, UPLOAD PROOF & VIEW PAYMENT HISTORY (PART 4)
# ============================================================================

@router.post("/payments", status_code=status.HTTP_201_CREATED)
@alias_router.post("/payments", status_code=status.HTTP_201_CREATED)
@billing_alias_router.post("/payments", status_code=status.HTTP_201_CREATED)
def submit_my_manual_payment(
    payload: TenantManualPaymentSubmitRequest,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """
    PART 4 – Tenant submits manual offline payment details for an Issued/Overdue invoice.
    Payment is created with status='Submitted' and awaits Platform Admin verification.
    """
    if not payload.invoice_id:
        raise HTTPException(status_code=422, detail="invoice_id is required.")
    tenant_id, user_id = _get_tenant_and_user_ids(current_user)
    payment = submit_manual_payment_details(
        db=db,
        tenant_id=tenant_id,
        user_id=user_id,
        invoice_id=payload.invoice_id,
        transaction_reference=payload.transaction_reference,
        amount=payload.amount,
        payment_method=payload.payment_method,
        currency=payload.currency,
        payment_date=payload.payment_date,
        payment_proof_url=payload.payment_proof_url,
        payment_proof_filename=payload.payment_proof_filename,
        notes=payload.notes,
    )
    return {
        "message": "Payment details submitted successfully and awaiting Platform Admin verification.",
        "payment": serialize_payment(db, payment),
    }


@router.post("/invoices/{invoice_id}/payments", status_code=status.HTTP_201_CREATED)
@alias_router.post("/invoices/{invoice_id}/payments", status_code=status.HTTP_201_CREATED)
@billing_alias_router.post("/invoices/{invoice_id}/payments", status_code=status.HTTP_201_CREATED)
def submit_my_manual_payment_for_invoice(
    invoice_id: UUID,
    payload: TenantManualPaymentSubmitRequest,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, user_id = _get_tenant_and_user_ids(current_user)
    payment = submit_manual_payment_details(
        db=db,
        tenant_id=tenant_id,
        user_id=user_id,
        invoice_id=invoice_id,
        transaction_reference=payload.transaction_reference,
        amount=payload.amount,
        payment_method=payload.payment_method,
        currency=payload.currency,
        payment_date=payload.payment_date,
        payment_proof_url=payload.payment_proof_url,
        payment_proof_filename=payload.payment_proof_filename,
        notes=payload.notes,
    )
    return {
        "message": "Payment details submitted successfully and awaiting Platform Admin verification.",
        "payment": serialize_payment(db, payment),
    }


@router.post("/payments/{payment_id}/proof")
@alias_router.post("/payments/{payment_id}/proof")
async def upload_payment_proof(
    payment_id: UUID,
    file: UploadFile | None = File(default=None),
    proof_reference: str | None = Form(default=None),
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """PART 4 Req 4 – Allows tenant to upload or attach payment proof for a submitted payment."""
    tenant_id, user_id = _get_tenant_and_user_ids(current_user)
    payment = db.query(PlatformBillingPayment).filter(PlatformBillingPayment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment record not found.")
    if str(payment.tenant_id) != str(tenant_id):
        raise HTTPException(status_code=403, detail="Access denied: payment belongs to another tenant.")
    if payment.status == "Succeeded":
        raise HTTPException(status_code=409, detail="Payment has already been verified and approved.")

    if file is not None:
        max_bytes = 5 * 1024 * 1024
        contents = await file.read(max_bytes + 1)
        await file.close()
        if not contents:
            raise HTTPException(status_code=400, detail="Uploaded proof file is empty.")
        if len(contents) > max_bytes:
            raise HTTPException(status_code=413, detail="Payment proof file must be 5 MB or smaller.")
        safe_name = Path(file.filename or "payment_proof.pdf").name
        uploads_dir = Path("uploads/payment_proofs")
        uploads_dir.mkdir(parents=True, exist_ok=True)
        stored_name = f"{payment.id}_{safe_name}"
        stored_path = uploads_dir / stored_name
        stored_path.write_bytes(contents)
        payment.payment_proof_filename = safe_name
        payment.payment_proof_url = f"/uploads/payment_proofs/{stored_name}"
    elif proof_reference:
        payment.payment_proof_url = proof_reference.strip()
        payment.payment_proof_filename = Path(proof_reference.strip()).name
    else:
        raise HTTPException(status_code=400, detail="Provide either a proof file or proof_reference.")

    log_audit(
        db=db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="UPLOAD_PAYMENT_PROOF",
        module="subscriptions",
        record_id=payment.id,
        description=f"Attached payment proof for payment {payment.transaction_reference}",
    )
    db.commit()
    db.refresh(payment)
    return {
        "message": "Payment proof attached successfully.",
        "payment": serialize_payment(db, payment),
    }


@router.get("/payments")
@alias_router.get("/payments")
@billing_alias_router.get("/payments")
def list_my_payment_history(
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """PART 2 Req 7 & PART 7 – View tenant's own subscription payment history."""
    tenant_id, _ = _get_tenant_and_user_ids(current_user)
    payments = (
        db.query(PlatformBillingPayment)
        .filter(PlatformBillingPayment.tenant_id == tenant_id)
        .order_by(PlatformBillingPayment.created_at.desc())
        .all()
    )
    return {
        "items": [serialize_payment(db, p) for p in payments],
        "total": len(payments),
    }


@router.get("/payments/{payment_id}")
@alias_router.get("/payments/{payment_id}")
@billing_alias_router.get("/payments/{payment_id}")
def get_my_payment_detail(
    payment_id: UUID,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, _ = _get_tenant_and_user_ids(current_user)
    payment = db.query(PlatformBillingPayment).filter(PlatformBillingPayment.id == payment_id).first()
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found.")
    if str(payment.tenant_id) != str(tenant_id):
        raise HTTPException(status_code=403, detail="Access denied: payment belongs to another tenant.")
    return serialize_payment(db, payment)


# Explicitly block any tenant attempt to approve a payment or mutate subscription status (PART 4 & PART 14)
@router.post("/payments/{payment_id}/approve")
@alias_router.post("/payments/{payment_id}/approve")
@billing_alias_router.post("/payments/{payment_id}/approve")
def tenant_forbidden_payment_approve(payment_id: UUID):
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Security violation: tenants are never permitted to approve payments. Only authorized Platform Admin billing personnel can approve payments.",
    )


@router.patch("/status")
@router.post("/activate")
@alias_router.patch("/status")
@alias_router.post("/activate")
def tenant_forbidden_status_change():
    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Security violation: tenants cannot directly activate or change their subscription status.",
    )


# ============================================================================
# 6. UPDATE ESSENTIAL ACCOUNT & BILLING INFO, CANCEL, UNSUBSCRIBE, CONTACT SUPPORT (PART 7, 9, 10)
# ============================================================================

@router.get("/billing-profile")
@alias_router.get("/billing-profile")
@billing_alias_router.get("/profile")
def get_my_billing_profile(
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id, _ = _get_tenant_and_user_ids(current_user)
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    return {
        "tenant_id": str(tenant.id),
        "company_name": tenant.name,
        "industry": tenant.industry,
        "billing_email": tenant.billing_email,
        "billing_phone": tenant.billing_phone,
        "billing_address": tenant.billing_address,
        "gst_number": tenant.gst_number,
        "email_reminders_opt_out": bool(tenant.email_reminders_opt_out),
    }


@router.patch("/billing-profile")
@alias_router.patch("/billing-profile")
@billing_alias_router.patch("/profile")
def update_my_billing_profile(
    payload: TenantBillingInfoUpdateRequest,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """PART 7 – Update essential account and billing information (accessible even after trial expiration)."""
    tenant_id, user_id = _get_tenant_and_user_ids(current_user)
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).with_for_update().first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")

    if payload.company_name is not None:
        cleaned_name = payload.company_name.strip()
        dup = (
            db.query(Tenant)
            .filter(func.lower(Tenant.name) == cleaned_name.lower(), Tenant.id != tenant.id)
            .first()
        )
        if dup:
            raise HTTPException(status_code=409, detail="Another company with this name already exists.")
        tenant.name = cleaned_name
    if payload.billing_email is not None:
        tenant.billing_email = str(payload.billing_email).strip().lower()
    if payload.billing_phone is not None:
        tenant.billing_phone = payload.billing_phone.strip()
    if payload.billing_address is not None:
        tenant.billing_address = payload.billing_address.strip()
    if payload.gst_number is not None:
        tenant.gst_number = payload.gst_number.strip().upper()
    if payload.email_reminders_opt_out is not None:
        tenant.email_reminders_opt_out = payload.email_reminders_opt_out
        camp = (
            db.query(PlatformSubscriptionReminderCampaign)
            .filter(PlatformSubscriptionReminderCampaign.tenant_id == tenant.id)
            .first()
        )
        if camp and payload.email_reminders_opt_out:
            camp.campaign_status = "Unsubscribed"
            camp.stopped_at = utc_now()
            camp.stopped_reason = "Tenant opted out via billing profile"

    log_audit(
        db=db,
        tenant_id=tenant.id,
        user_id=user_id,
        action="UPDATE_BILLING_PROFILE",
        module="subscriptions",
        record_id=tenant.id,
        description=f"Updated billing profile for '{tenant.name}'",
    )
    db.commit()
    db.refresh(tenant)
    return {
        "message": "Billing profile updated successfully.",
        "billing_profile": {
            "tenant_id": str(tenant.id),
            "company_name": tenant.name,
            "billing_email": tenant.billing_email,
            "billing_phone": tenant.billing_phone,
            "billing_address": tenant.billing_address,
            "gst_number": tenant.gst_number,
            "email_reminders_opt_out": bool(tenant.email_reminders_opt_out),
        },
    }


@router.get("/unsubscribe")
@router.post("/unsubscribe")
@alias_router.get("/unsubscribe")
@alias_router.post("/unsubscribe")
def unsubscribe_from_reminder_emails(
    token: str = Query(..., min_length=6),
    db: Session = Depends(get_db),
):
    """PART 9 Req 7 – Public unsubscribe endpoint for trial/post-trial reminder emails."""
    tenant = db.query(Tenant).filter(Tenant.unsubscribe_token == token.strip()).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Invalid or expired unsubscribe token.")
    tenant.email_reminders_opt_out = True
    camp = (
        db.query(PlatformSubscriptionReminderCampaign)
        .filter(PlatformSubscriptionReminderCampaign.tenant_id == tenant.id)
        .first()
    )
    if camp:
        camp.campaign_status = "Unsubscribed"
        camp.stopped_at = utc_now()
        camp.stopped_reason = "Unsubscribed via email link"
    db.commit()
    return {
        "message": f"'{tenant.name}' has been unsubscribed from trial reminder emails.",
        "company_name": tenant.name,
        "email_reminders_opt_out": True,
    }


@router.post("/cancel")
@alias_router.post("/cancel")
def cancel_my_subscription(
    payload: TenantCancelSubscriptionRequest,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """PART 10 – Allows tenant owner/admin to cancel auto-renewal or cancel subscription."""
    tenant_id, user_id = _get_tenant_and_user_ids(current_user)
    sub = get_tenant_subscription(db, tenant_id, for_update=True)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found.")

    now_utc = utc_now()
    prev_status = sub.status
    sub.auto_renew = False
    sub.cancelled_at = now_utc.replace(tzinfo=None)
    if payload.cancel_immediately or sub.status in {"Trial", "Past Due", "Suspended"}:
        sub.status = "Cancelled"
        sub.ends_at = now_utc.replace(tzinfo=None)

    record_subscription_event(
        db=db,
        tenant_id=tenant_id,
        subscription_id=sub.id,
        actor_user_id=user_id,
        event_type="SUBSCRIPTION_CANCELLED",
        previous_status=prev_status,
        new_status=sub.status,
        description=f"Tenant cancelled subscription (cancel_immediately={payload.cancel_immediately}): {payload.reason or 'No reason specified'}",
    )
    log_audit(
        db=db,
        tenant_id=tenant_id,
        user_id=user_id,
        action="CANCEL_SUBSCRIPTION",
        module="subscriptions",
        record_id=sub.id,
        description=f"Cancelled subscription: {payload.reason or 'User requested cancellation'}",
    )
    db.commit()
    db.refresh(sub)
    return {
        "message": "Subscription cancelled.",
        "subscription": serialize_subscription(db, sub),
    }


@router.post("/support", status_code=status.HTTP_201_CREATED)
@alias_router.post("/support", status_code=status.HTTP_201_CREATED)
def contact_platform_support(
    payload: TenantSupportRequest,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """
    PART 7 – Allows tenant to contact Platform Support even when their trial or subscription has expired.
    """
    tenant_id, user_id = _get_tenant_and_user_ids(current_user)
    user = db.query(User).filter(User.id == user_id).first()
    ticket_number = f"SUP-{utc_now():%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"
    ticket = SupportTicket(
        tenant_id=tenant_id,
        ticket_number=ticket_number,
        subject=payload.subject.strip(),
        description=payload.description.strip(),
        category=payload.category or "Billing",
        priority=payload.priority or "High",
        status="Open",
        source="CRM",
        requester_name=payload.requester_name or (user.full_name if user else "Tenant User"),
        requester_email=(payload.requester_email or (user.email if user else "")).strip().lower() or None,
        created_by=user_id,
    )
    db.add(ticket)
    db.flush()
    auto_route_support_ticket(db, ticket, actor_user_id=user_id)
    db.commit()
    db.refresh(ticket)
    return {
        "message": "Support ticket submitted to Platform Support.",
        "ticket_id": str(ticket.id),
        "ticket_number": ticket.ticket_number,
        "status": ticket.status,
    }


@router.get("/events")
@alias_router.get("/events")
def list_my_subscription_events(
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """View subscription lifecycle & billing event history for the authenticated tenant."""
    tenant_id, _ = _get_tenant_and_user_ids(current_user)
    events = (
        db.query(PlatformSubscriptionEvent)
        .filter(PlatformSubscriptionEvent.tenant_id == tenant_id)
        .order_by(PlatformSubscriptionEvent.created_at.desc())
        .limit(100)
        .all()
    )
    return {
        "items": [
            {
                "id": str(ev.id),
                "event_type": ev.event_type,
                "previous_status": ev.previous_status,
                "new_status": ev.new_status,
                "description": ev.description,
                "metadata": ev.metadata_json or {},
                "created_at": ev.created_at.isoformat() if ev.created_at else None,
            }
            for ev in events
        ],
        "total": len(events),
    }
