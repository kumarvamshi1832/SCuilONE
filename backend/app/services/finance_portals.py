
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.agency_auth import hash_token
from app.core.security import create_access_token, hash_password, verify_password
from app.models.agency import (
    Agency,
    AgencyAgreementVersion,
    AgencyMember,
    CompanyAgencyConnection,
    RealEstateBusinessProfile,
)
from app.models.agency_workflow import AgencyLead
from app.models.booking import Booking
from app.models.buyer_requirement import BuyerRequirement
from app.models.finance_portals import (
    AgencyCommissionEntry,
    OwnerAgencyMandate,
    OwnerPayoutLedger,
    OwnerPortalSession,
    OwnerPortalUser,
    PropertyOwner,
)
from app.models.property import Property
from app.models.rental import RentalAgreement, RentalBookingRequest
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_role import UserRole
from app.services.agency_collaboration import (
    broadcast_property_availability_change,
    notify_agency,
)
from app.services.agency_workflow import assert_agency_property_authorized
from app.services.audit_service import log_audit
from app.services.real_estate_lifecycle import has_conflicting_property_commitment

ZERO = Decimal("0.00")
CENT = Decimal("0.01")


def _money(val: Decimal | int | float | str) -> Decimal:
    return Decimal(str(val)).quantize(CENT, rounding=ROUND_HALF_UP)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


# ==============================================================================
# PHASE 11: DISTINCT LEASE ESCALATION POLICY & AGENCY-SOURCED RENT/LEASE REQUESTS
# ==============================================================================

def preview_lease_escalation_schedule(
    base_rent: Decimal,
    duration_months: int,
    escalation_frequency_months: int,
    escalation_percent: Decimal,
) -> list[dict]:
    """Compute Decimal-exact month-by-month lease escalation schedule."""
    schedule: list[dict] = []
    current_rent = _money(base_rent)
    factor = Decimal("1.00") + (Decimal(str(escalation_percent)) / Decimal("100"))
    for month_idx in range(1, duration_months + 1):
        if month_idx > 1 and (month_idx - 1) % escalation_frequency_months == 0:
            current_rent = _money(current_rent * factor)
        schedule.append({"month": month_idx, "lease_amount": str(current_rent)})
    return schedule


def agency_submit_rental_or_lease_request(db: Session, agency_ctx: dict, payload) -> RentalBookingRequest:
    """Mode 3: Agency submits a Rent or Lease booking request on a connected company's central Property."""
    agency_id: UUID = agency_ctx["agency_id"]
    lead = (
        db.query(AgencyLead)
        .filter(AgencyLead.id == payload.agency_lead_id, AgencyLead.agency_id == agency_id)
        .first()
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Agency lead not found.")

    conn, prop = assert_agency_property_authorized(
        db,
        agency_id,
        payload.connection_id,
        payload.property_id,
        required_transaction_type=payload.booking_type,
    )
    prop_locked = (
        db.query(Property)
        .filter(Property.id == prop.id, Property.tenant_id == conn.company_tenant_id)
        .with_for_update()
        .first()
    )
    now = _utc_now()
    if not prop_locked or prop_locked.status != "Available":
        raise HTTPException(status_code=409, detail=f"Property is currently '{prop_locked.status if prop_locked else 'Missing'}'.")
    if has_conflicting_property_commitment(db, conn.company_tenant_id, prop_locked.id, now=now):
        raise HTTPException(status_code=409, detail="Property already has an active hold or commitment.")

    hold_expires = now + timedelta(hours=48)
    req = RentalBookingRequest(
        tenant_id=conn.company_tenant_id,
        property_id=prop_locked.id,
        booking_type=payload.booking_type,
        channel="Walk-in",
        source_agency_id=agency_id,
        agency_connection_id=conn.id,
        agency_lead_id=lead.id,
        customer_name=lead.full_name,
        customer_email=lead.email,
        customer_phone=lead.phone,
        proposed_rent_amount=payload.proposed_rent_amount,
        proposed_deposit_amount=payload.proposed_deposit_amount,
        duration_months=payload.duration_months,
        lock_in_months=payload.lock_in_months,
        notice_period_days=payload.notice_period_days,
        desired_start_date=payload.desired_start_date or now.date(),
        status="Requested",
        hold_created_at=now,
        hold_expires_at=hold_expires,
        customer_notes=payload.notes,
    )
    db.add(req)
    prop_locked.status = "Reserved"
    prop_locked.updated_at = now
    db.flush()

    broadcast_property_availability_change(
        db=db,
        company_tenant_id=conn.company_tenant_id,
        property_id=prop_locked.id,
        event_type="property_held",
        title=f"{payload.booking_type} hold placed on '{prop_locked.name}'",
        message=f"'{prop_locked.name}' is Reserved for a {payload.booking_type} request until {hold_expires.isoformat()} UTC.",
        idempotency_prefix=f"rent_hold:{req.id}",
    )
    return req


# ==============================================================================
# PHASE 12: LOSSLESS FREE EXTERNAL AGENCY -> PAID REGISTERED AGENCY UPGRADE
# ==============================================================================

def upgrade_free_agency_to_paid(db: Session, agency_ctx: dict, payload) -> dict:
    """Upgrade a Free External Agency into a full Paid Registered Agency Tenant.

    Preserves global Agency.id, all CompanyAgencyConnection rows, all AgencyAgreementVersion rows,
    all AgencyLead/Requirement/Shortlist rows, all transaction attributions, and all Commission entries!
    """
    if agency_ctx.get("role") != "agency_owner":
        raise HTTPException(status_code=403, detail="Only the agency owner can upgrade to a paid subscription.")

    agency = db.query(Agency).filter(Agency.id == agency_ctx["agency_id"]).with_for_update().first()
    if not agency:
        raise HTTPException(status_code=404, detail="Agency not found.")
    if agency.operating_mode == "paid_tenant" and agency.tenant_id:
        raise HTTPException(status_code=409, detail="Agency is already operating on a paid independent tenant.")

    tenant_name = (payload.company_name or agency.legal_name).strip()
    dup_tenant = db.query(Tenant).filter(func.lower(Tenant.name) == tenant_name.lower()).first()
    if dup_tenant:
        tenant_name = f"{tenant_name} ({agency.agency_code})"

    now = _utc_now()
    new_tenant = Tenant(
        name=tenant_name,
        industry="Real Estate",
        business_type="real_estate_agency",
        billing_email=agency.verified_email,
        billing_phone=agency.verified_phone,
        billing_address=payload.office_address or agency.office_address,
        gst_number=payload.gst_number or agency.gst_number,
        status="Trial",
        is_platform=False,
    )
    db.add(new_tenant)
    db.flush()

    profile = RealEstateBusinessProfile(
        tenant_id=new_tenant.id,
        business_type="real_estate_agency",
        legal_name=tenant_name,
        display_name=agency.display_name,
        rera_registration_number=payload.rera_registration_number or agency.rera_registration_number,
        gst_number=payload.gst_number or agency.gst_number,
        city=payload.city or agency.city,
        state=payload.state or agency.state,
        office_address=payload.office_address or agency.office_address,
        conversion_locked=True,
    )
    db.add(profile)

    owner_role = db.query(Role).filter(Role.name == "Tenant Owner").first()
    agent_role = db.query(Role).filter(Role.name == "Sales Agent").first()

    members = (
        db.query(AgencyMember)
        .filter(AgencyMember.agency_id == agency.id, AgencyMember.status == "Active")
        .all()
    )
    provisioned_users = 0
    for member in members:
        existing_user = db.query(User).filter(func.lower(User.email) == member.email.lower()).first()
        if existing_user:
            user = existing_user
        else:
            user = User(
                tenant_id=new_tenant.id,
                full_name=member.full_name,
                email=member.email,
                phone=member.phone,
                job_title="Agency Owner" if member.role == "agency_owner" else "Sales Agent",
                password=member.password_hash or hash_password(secrets.token_urlsafe(24)),
                status="Active",
                must_change_password=False,
                profile_completed=True,
            )
            db.add(user)
            db.flush()
            target_role = owner_role if member.role == "agency_owner" else (agent_role or owner_role)
            if target_role:
                db.add(UserRole(user_id=user.id, role_id=target_role.id))
            provisioned_users += 1
        member.user_id = user.id

    agency.operating_mode = "paid_tenant"
    agency.tenant_id = new_tenant.id
    agency.upgraded_to_paid_at = now
    if payload.rera_registration_number:
        agency.rera_registration_number = payload.rera_registration_number
    if payload.gst_number:
        agency.gst_number = payload.gst_number

    log_audit(
        db,
        new_tenant.id,
        None,
        "CREATE",
        "agencies",
        agency.id,
        f"Lossless Free -> Paid upgrade completed for agency {agency.agency_code}.",
        after_data={"operating_mode": "paid_tenant", "tenant_id": str(new_tenant.id), "provisioned_users": provisioned_users},
    )
    db.flush()
    return {
        "agency_id": str(agency.id),
        "agency_code": agency.agency_code,
        "operating_mode": agency.operating_mode,
        "tenant_id": str(new_tenant.id),
        "business_type": new_tenant.business_type,
        "provisioned_users": provisioned_users,
        "upgraded_at": now.isoformat(),
    }


# ==============================================================================
# PHASE 13: IMMUTABLE COMMISSION LEDGER (SURVIVES CONNECTION TERMINATION)
# ==============================================================================

def create_commission_entry_from_agreement(
    db: Session, company_tenant_id: UUID, user_id: UUID, payload
) -> AgencyCommissionEntry:
    """Calculate and record an immutable commission obligation from the signed AgencyAgreementVersion."""
    conn = (
        db.query(CompanyAgencyConnection)
        .filter(
            CompanyAgencyConnection.id == payload.connection_id,
            CompanyAgencyConnection.company_tenant_id == company_tenant_id,
        )
        .first()
    )
    if not conn or not conn.active_agreement_version_id:
        raise HTTPException(status_code=404, detail="Connection with an accepted agreement version not found.")

    ver = db.query(AgencyAgreementVersion).filter(AgencyAgreementVersion.id == conn.active_agreement_version_id).first()
    if not ver:
        raise HTTPException(status_code=404, detail="Accepted agreement version not found.")

    tx_key = payload.transaction_type.lower()
    rule = (ver.commission_terms or {}).get(tx_key)
    if not rule:
        raise HTTPException(
            status_code=409,
            detail=f"No commission rule configured for '{payload.transaction_type}' in agreement v{ver.version_number}.",
        )

    structure = rule.get("structure", "percentage")
    raw_val = Decimal(str(rule.get("value") or 0))
    tx_value = _money(payload.transaction_value)

    if structure == "percentage":
        gross = _money(tx_value * raw_val / Decimal("100"))
    elif structure == "fixed":
        gross = _money(raw_val)
    elif structure == "one_month_rent":
        gross = tx_value
        raw_val = Decimal("1.00")
    else:
        gross = _money(raw_val)

    tax_ded = _money(payload.tax_deduction)
    other_ded = _money(payload.other_deductions)
    net_payable = max(ZERO, _money(gross - tax_ded - other_ded))

    entry = AgencyCommissionEntry(
        company_tenant_id=company_tenant_id,
        agency_id=conn.agency_id,
        connection_id=conn.id,
        agreement_version_id=ver.id,
        transaction_type=payload.transaction_type,
        booking_id=payload.booking_id,
        rental_agreement_id=payload.rental_agreement_id,
        transaction_value=tx_value,
        commission_structure=structure,
        commission_rate_or_value=raw_val,
        gross_commission=gross,
        tax_deduction=tax_ded,
        other_deductions=other_ded,
        net_payable=net_payable,
        payer=rule.get("payer", "company"),
        trigger_event=rule.get("trigger_event", "booking_confirmed"),
        status="Eligible",
        notes=payload.notes,
    )
    db.add(entry)
    db.flush()

    notify_agency(
        db,
        conn.agency_id,
        "commission_eligible",
        f"Commission eligible ({payload.transaction_type}): {net_payable}",
        f"Calculated from agreement v{ver.version_number} ({structure}).",
        connection_id=conn.id,
        payload={"commission_entry_id": str(entry.id), "net_payable": str(net_payable)},
    )
    log_audit(
        db,
        company_tenant_id,
        user_id,
        "CREATE",
        "agency_commission_entries",
        entry.id,
        f"Created commission entry {entry.id} for agency {conn.agency_id}: gross={gross}, net={net_payable}.",
    )
    return entry


def act_on_commission_entry(
    db: Session, company_tenant_id: UUID, user_id: UUID, entry_id: UUID, payload
) -> AgencyCommissionEntry:
    """Approve, mark Paid, or Reverse a commission entry (works even if connection was later Terminated)."""
    entry = (
        db.query(AgencyCommissionEntry)
        .filter(
            AgencyCommissionEntry.id == entry_id,
            AgencyCommissionEntry.company_tenant_id == company_tenant_id,
        )
        .with_for_update()
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Commission entry not found.")

    now = _utc_now()
    if payload.action == "Approve":
        if entry.status not in ("Pending", "Eligible"):
            raise HTTPException(status_code=409, detail=f"Cannot approve commission from status '{entry.status}'.")
        entry.status = "Approved"
        entry.approved_by = user_id
        entry.approved_at = now
    elif payload.action == "MarkPaid":
        if entry.status != "Approved":
            raise HTTPException(status_code=409, detail="Commission must be Approved before marking Paid.")
        if not payload.payout_reference:
            raise HTTPException(status_code=422, detail="payout_reference is required to mark commission Paid.")
        entry.status = "Paid"
        entry.paid_by = user_id
        entry.paid_at = now
        entry.payout_reference = payload.payout_reference.strip()
    elif payload.action == "Reverse":
        if entry.status == "Paid":
            raise HTTPException(status_code=409, detail="Paid commission requires an adjustment entry rather than direct reversal.")
        entry.status = "Reversed"

    if payload.notes:
        entry.notes = payload.notes
    db.flush()

    notify_agency(
        db,
        entry.agency_id,
        f"commission_{entry.status.lower()}",
        f"Commission {entry.status}: {entry.net_payable}",
        payload.notes or f"Commission status updated to {entry.status}.",
        connection_id=entry.connection_id,
    )
    return entry


# ==============================================================================
# PHASE 13: PROPERTY OWNERS, MANDATES, OPTION A/B PAYOUTS & OWNER PORTAL
# ==============================================================================

def create_property_owner(db: Session, tenant_id: UUID, payload) -> tuple[PropertyOwner, OwnerPortalUser | None]:
    email = payload.email.strip().lower()
    dup = db.query(PropertyOwner).filter(PropertyOwner.tenant_id == tenant_id, func.lower(PropertyOwner.email) == email).first()
    if dup:
        raise HTTPException(status_code=409, detail="A property owner with this email already exists.")
    owner = PropertyOwner(
        tenant_id=tenant_id,
        full_name=payload.full_name.strip(),
        email=email,
        phone=payload.phone,
        pan_number=payload.pan_number,
        payout_details=payload.payout_details,
        status="Active",
    )
    db.add(owner)
    db.flush()

    portal_user = None
    if payload.portal_password:
        portal_user = OwnerPortalUser(
            tenant_id=tenant_id,
            owner_id=owner.id,
            email=email,
            password_hash=hash_password(payload.portal_password),
            status="Active",
        )
        db.add(portal_user)
        db.flush()
    return owner, portal_user


def create_owner_mandate(db: Session, tenant_id: UUID, payload) -> OwnerAgencyMandate:
    owner = db.query(PropertyOwner).filter(PropertyOwner.id == payload.owner_id, PropertyOwner.tenant_id == tenant_id).first()
    if not owner:
        raise HTTPException(status_code=404, detail="Property owner not found.")
    prop = db.query(Property).filter(Property.id == payload.property_id, Property.tenant_id == tenant_id).first()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found in your workspace.")

    mandate = OwnerAgencyMandate(
        tenant_id=tenant_id,
        owner_id=owner.id,
        property_id=prop.id,
        management_fee_type=payload.management_fee_type,
        management_fee_value=payload.management_fee_value,
        collection_authority=payload.collection_authority,
        starts_at=payload.starts_at,
        expires_at=payload.expires_at,
        termination_notice_days=payload.termination_notice_days,
        status="Pending Owner Approval",
        agreement_text=payload.agreement_text,
    )
    db.add(mandate)
    db.flush()
    return mandate


def owner_approve_mandate(db: Session, tenant_id: UUID, owner_id: UUID, mandate_id: UUID) -> OwnerAgencyMandate:
    mandate = (
        db.query(OwnerAgencyMandate)
        .filter(
            OwnerAgencyMandate.id == mandate_id,
            OwnerAgencyMandate.tenant_id == tenant_id,
            OwnerAgencyMandate.owner_id == owner_id,
        )
        .with_for_update()
        .first()
    )
    if not mandate:
        raise HTTPException(status_code=404, detail="Owner mandate not found.")
    if mandate.status != "Pending Owner Approval":
        raise HTTPException(status_code=409, detail=f"Mandate cannot be approved from status '{mandate.status}'.")
    mandate.status = "Active"
    mandate.owner_approved_at = _utc_now()
    db.flush()
    return mandate


def record_owner_payout_from_collection(db: Session, tenant_id: UUID, payload) -> OwnerPayoutLedger:
    """Reconcile a verified rent/lease collection under Option A (authorized_collection) or Option B (direct_to_owner).

    Never treats security deposits as owner payout revenue, and never marks Paid until actual bank_transfer_reference is logged.
    """
    mandate = (
        db.query(OwnerAgencyMandate)
        .filter(OwnerAgencyMandate.id == payload.mandate_id, OwnerAgencyMandate.tenant_id == tenant_id)
        .first()
    )
    if not mandate or mandate.status != "Active":
        raise HTTPException(status_code=409, detail="An Active Owner-Agency Mandate is required for payout reconciliation.")

    agreement = (
        db.query(RentalAgreement)
        .filter(RentalAgreement.id == payload.rental_agreement_id, RentalAgreement.tenant_id == tenant_id)
        .first()
    )
    if not agreement:
        raise HTTPException(status_code=404, detail="Rental/Lease agreement not found.")

    rent_collected = _money(payload.rent_collected)
    if mandate.management_fee_type == "percentage":
        mgmt_fee = _money(rent_collected * Decimal(str(mandate.management_fee_value)) / Decimal("100"))
    else:
        mgmt_fee = _money(mandate.management_fee_value)

    comm_ded = _money(payload.commission_deduction)
    expenses = _money(payload.approved_expenses)

    if mandate.collection_authority == "authorized_collection":
        # Option A: Managing company/agency collects rent -> deducts fee/commission/expenses -> pays net to owner
        net_owner_payout = max(ZERO, _money(rent_collected - mgmt_fee - comm_ded - expenses))
        fee_receivable = ZERO
        initial_status = "Pending"
    else:
        # Option B: Tenant pays owner directly -> managing entity invoices management fee separately
        net_owner_payout = ZERO
        fee_receivable = mgmt_fee
        initial_status = "Reconciled"

    ledger = OwnerPayoutLedger(
        tenant_id=tenant_id,
        owner_id=mandate.owner_id,
        mandate_id=mandate.id,
        rental_agreement_id=agreement.id,
        rental_payment_id=payload.rental_payment_id,
        collection_mode=mandate.collection_authority,
        rent_collected=rent_collected,
        management_fee=mgmt_fee,
        commission_deduction=comm_ded,
        approved_expenses=expenses,
        net_owner_payout=net_owner_payout,
        management_fee_receivable=fee_receivable,
        status=initial_status,
        notes=payload.notes,
    )
    db.add(ledger)
    db.flush()
    return ledger


def mark_owner_payout_paid(db: Session, tenant_id: UUID, ledger_id: UUID, payload) -> OwnerPayoutLedger:
    ledger = (
        db.query(OwnerPayoutLedger)
        .filter(OwnerPayoutLedger.id == ledger_id, OwnerPayoutLedger.tenant_id == tenant_id)
        .with_for_update()
        .first()
    )
    if not ledger:
        raise HTTPException(status_code=404, detail="Owner payout record not found.")
    if ledger.collection_mode != "authorized_collection":
        raise HTTPException(status_code=409, detail="Direct-to-owner collections do not have outgoing bank payouts.")
    if ledger.status not in ("Pending", "Approved"):
        raise HTTPException(status_code=409, detail=f"Payout cannot be marked Paid from status '{ledger.status}'.")
    ledger.status = "Paid"
    ledger.bank_transfer_reference = payload.bank_transfer_reference.strip()
    ledger.paid_at = _utc_now()
    if payload.notes:
        ledger.notes = payload.notes
    db.flush()
    return ledger


def login_owner_portal(db: Session, email: str, password: str) -> dict:
    user = (
        db.query(OwnerPortalUser)
        .filter(func.lower(OwnerPortalUser.email) == email.strip().lower(), OwnerPortalUser.status == "Active")
        .first()
    )
    if not user or not verify_password(password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid owner portal credentials.")

    now = _utc_now()
    raw_refresh = secrets.token_urlsafe(48)
    session = OwnerPortalSession(
        tenant_id=user.tenant_id,
        owner_portal_user_id=user.id,
        token_hash=hash_token(raw_refresh),
        expires_at=now + timedelta(days=7),
        revoked=False,
    )
    db.add(session)
    user.last_login_at = now
    db.flush()

    access_token = create_access_token({
        "portal_type": "owner",
        "token_type": "access",
        "tenant_id": str(user.tenant_id),
        "owner_id": str(user.owner_id),
        "owner_portal_user_id": str(user.id),
        "sid": str(session.id),
    })
    return {"access_token": access_token, "refresh_token": raw_refresh, "token_type": "bearer", "owner_id": str(user.owner_id)}


def is_agency_sourced_post_booking_portal_contact(db: Session, tenant_id: UUID, contact_id: UUID) -> tuple[bool, Agency | None]:
    """Return (True, Agency) when a portal contact is an agency-sourced post-booking customer."""
    from app.models.booking import Booking
    from app.models.contact import Contact

    contact = db.query(Contact).filter(Contact.id == contact_id, Contact.tenant_id == tenant_id).first()
    agency_booking = None
    if contact and contact.email:
        agency_booking = (
            db.query(Booking)
            .filter(
                Booking.tenant_id == tenant_id,
                func.lower(Booking.buyer_email) == contact.email.strip().lower(),
                Booking.source_agency_id.isnot(None),
            )
            .order_by(Booking.created_at.desc())
            .first()
        )
    is_agency_origin = bool(
        agency_booking is not None
        or (contact and (contact.source == "Agency Collaboration" or (contact.custom_fields or {}).get("contact_origin") == "agency_sourced"))
    )
    if not is_agency_origin:
        return False, None

    agency_id = agency_booking.source_agency_id if agency_booking else None
    if not agency_id and contact and (contact.custom_fields or {}).get("source_agency_id"):
        try:
            agency_id = UUID(str(contact.custom_fields["source_agency_id"]))
        except (ValueError, TypeError):
            agency_id = None
    agency = db.query(Agency).filter(Agency.id == agency_id).first() if agency_id else None
    return True, agency


def get_customer_portal_experience_profile(db: Session, portal_ctx: dict) -> dict:
    """Derive Buyer / Tenant / Leaseholder scopes on existing CustomerPortalUser (no duplicate auth)."""
    tenant_id = portal_ctx["tenant_id"]
    contact_id = portal_ctx["contact_id"]

    has_buyer_req = db.query(BuyerRequirement.id).filter(BuyerRequirement.tenant_id == tenant_id, BuyerRequirement.contact_id == contact_id).first() is not None
    rent_agreements = (
        db.query(RentalAgreement)
        .filter(RentalAgreement.tenant_id == tenant_id, RentalAgreement.contact_id == contact_id)
        .all()
    )
    has_rent = any((a.agreement_type or "").lower() == "rent" for a in rent_agreements)
    has_lease = any((a.agreement_type or "").lower() == "lease" for a in rent_agreements)

    scopes = []
    if has_buyer_req or (not has_rent and not has_lease):
        scopes.append("buyer")
    if has_rent:
        scopes.append("tenant")
    if has_lease:
        scopes.append("leaseholder")

    post_booking_only, source_agency = is_agency_sourced_post_booking_portal_contact(db, tenant_id, contact_id)

    return {
        "portal_user_id": str(portal_ctx["portal_user_id"]),
        "tenant_id": str(tenant_id),
        "scopes": scopes,
        "post_booking_only": post_booking_only,
        "can_submit_new_requirements": not post_booking_only,
        "source_agency": (
            {
                "id": str(source_agency.id),
                "display_name": source_agency.display_name,
                "email": source_agency.verified_email,
                "phone": source_agency.verified_phone,
            }
            if source_agency
            else None
        ),
        "active_rent_agreements": sum(1 for a in rent_agreements if (a.agreement_type or "").lower() == "rent" and a.status == "Active"),
        "active_lease_agreements": sum(1 for a in rent_agreements if (a.agreement_type or "").lower() == "lease" and a.status == "Active"),
    }


def record_agency_customer_commission(
    db: Session, agency_ctx: dict, payload
) -> AgencyCommissionEntry:
    """Record buyer/tenant/leaseholder-side brokerage commission for Free OR Paid agencies.

    - Free External Agency: must pass an active/linked `connection_id` (company deal).
    - Paid Agency: may pass `connection_id` (partner company deal) OR omit it for own/owner-mandated deals.
    """
    agency_id: UUID = agency_ctx["agency_id"]
    conn = None
    if payload.connection_id:
        conn = (
            db.query(CompanyAgencyConnection)
            .filter(
                CompanyAgencyConnection.id == payload.connection_id,
                CompanyAgencyConnection.agency_id == agency_id,
            )
            .first()
        )
        if not conn:
            raise HTTPException(status_code=404, detail="Agency connection not found.")
        tenant_scope_id = conn.company_tenant_id
    else:
        if agency_ctx.get("operating_mode") != "paid_tenant" or not agency_ctx.get("tenant_id"):
            raise HTTPException(
                status_code=400,
                detail="connection_id is required for Free External agencies to record customer-side commission.",
            )
        tenant_scope_id = agency_ctx["tenant_id"]

    tx_value = _money(payload.transaction_value)
    structure = payload.commission_structure
    raw_val = _money(payload.commission_rate_or_value)

    if structure == "percentage":
        gross = _money(tx_value * raw_val / Decimal("100"))
    elif structure == "fixed":
        gross = _money(raw_val)
    elif structure == "one_month_rent":
        gross = tx_value
        raw_val = Decimal("1.00")
    else:
        gross = _money(raw_val)

    tax_ded = _money(payload.tax_deduction)
    other_ded = _money(payload.other_deductions)
    net_payable = max(ZERO, _money(gross - tax_ded - other_ded))

    now = _utc_now()
    note_parts = []
    if payload.customer_name:
        note_parts.append(f"Customer: {payload.customer_name.strip()}")
    if payload.notes:
        note_parts.append(payload.notes.strip())

    entry = AgencyCommissionEntry(
        company_tenant_id=tenant_scope_id,
        agency_id=agency_id,
        connection_id=conn.id if conn else None,
        agreement_version_id=conn.active_agreement_version_id if conn else None,
        transaction_type=payload.transaction_type,
        booking_id=payload.booking_id,
        rental_agreement_id=payload.rental_agreement_id,
        transaction_value=tx_value,
        commission_structure=structure,
        commission_rate_or_value=raw_val,
        gross_commission=gross,
        tax_deduction=tax_ded,
        other_deductions=other_ded,
        net_payable=net_payable,
        payer="customer",
        trigger_event="customer_brokerage_agreed",
        status="Paid" if payload.payment_received else "Eligible",
        paid_at=now if payload.payment_received else None,
        payout_reference=payload.payout_reference.strip() if payload.payout_reference else None,
        notes=" | ".join(note_parts) if note_parts else None,
    )
    db.add(entry)
    db.flush()
    return entry


def mark_agency_customer_commission_paid(
    db: Session, agency_ctx: dict, entry_id: UUID, payload
) -> AgencyCommissionEntry:
    """Allow an agency (Free or Paid) to mark its own customer-side brokerage entry as Paid."""
    entry = (
        db.query(AgencyCommissionEntry)
        .filter(
            AgencyCommissionEntry.id == entry_id,
            AgencyCommissionEntry.agency_id == agency_ctx["agency_id"],
        )
        .with_for_update()
        .first()
    )
    if not entry:
        raise HTTPException(status_code=404, detail="Commission entry not found.")
    if entry.payer != "customer":
        raise HTTPException(
            status_code=403,
            detail="Agencies can only mark customer-paid brokerage entries as Paid; company/owner commissions are settled by finance.",
        )
    if entry.status == "Paid":
        raise HTTPException(status_code=409, detail="Customer-side commission entry is already marked Paid.")

    entry.status = "Paid"
    entry.paid_at = _utc_now()
    entry.payout_reference = payload.payout_reference.strip()
    entry.payout_reference = payload.payout_reference.strip()
    if payload.notes:
        entry.notes = (f"{entry.notes}\n{payload.notes.strip()}" if entry.notes else payload.notes.strip())
    db.flush()
    return entry