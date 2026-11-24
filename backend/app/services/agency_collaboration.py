"""Business logic service for Phases 1–4:
- Phase 1: Real Estate business type validation, profile provisioning, and guarded conversion
- Phase 2: Global Agency identity, existing-agency detection, expiring invitations, bi-directional requests
- Phase 3: Company-Agency connections, immutable agreement versions, counterproposals, signing & lifecycle
- Phase 4: Central shared property access (`all_eligible` vs `selected_properties`) & multi-agency broadcasts
"""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.core.agency_auth import hash_token
from app.core.industry_registry import normalize_industry_key
from app.core.security import hash_password
from app.models.agency import (
    Agency,
    AgencyAgreementVersion,
    AgencyInvitation,
    AgencyMember,
    AgencyNotification,
    AgencyPropertyAccess,
    CompanyAgencyConnection,
    RealEstateBusinessProfile,
)
from app.models.notification import Notification
from app.models.property import Property
from app.models.tenant import REAL_ESTATE_BUSINESS_TYPES, Tenant
from app.models.user import User
from app.services.audit_service import log_audit

NON_TERMINAL_CONNECTION_STATUSES = (
    "Draft",
    "Sent",
    "Pending",
    "Counterproposed",
    "Agreement Pending",
    "Active",
    "Suspended",
)

ALLOWED_CONNECTION_TRANSITIONS: dict[str, set[str]] = {
    "Draft": {"Sent", "Cancelled"},
    "Sent": {"Pending", "Counterproposed", "Agreement Pending", "Rejected", "Expired", "Cancelled"},
    "Pending": {"Counterproposed", "Agreement Pending", "Rejected", "Expired", "Cancelled"},
    "Counterproposed": {"Counterproposed", "Agreement Pending", "Rejected", "Expired", "Cancelled"},
    "Agreement Pending": {"Active", "Counterproposed", "Rejected", "Expired", "Cancelled"},
    "Active": {"Suspended", "Terminated", "Expired"},
    "Suspended": {"Active", "Terminated"},
    "Rejected": set(),
    "Expired": set(),
    "Cancelled": set(),
    "Terminated": set(),
}


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _norm_email(email: str) -> str:
    return email.strip().lower()


def _norm_phone(phone: str) -> str:
    return "".join(ch for ch in (phone or "") if ch.isdigit() or ch == "+").strip()


def _generate_agency_code() -> str:
    return f"AGN-{_utc_now().strftime('%Y%m%d')}-{secrets.token_hex(4).upper()}"


def normalize_business_type(industry_key: str, business_type: str | None) -> str | None:
    """Validate and normalize business_type according to selected industry."""
    if industry_key == "real_estate":
        if not business_type:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="For Real Estate registration, select business_type: 'real_estate_company' or 'real_estate_agency'.",
            )
        cleaned = business_type.strip().lower().replace(" ", "_").replace("-", "_")
        aliases = {
            "company": "real_estate_company",
            "real_estate_company": "real_estate_company",
            "agency": "real_estate_agency",
            "real_estate_agency": "real_estate_agency",
        }
        canonical = aliases.get(cleaned)
        if canonical not in REAL_ESTATE_BUSINESS_TYPES:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail="Invalid business_type for Real Estate. Use 'real_estate_company' or 'real_estate_agency'.",
            )
        return canonical
    return None


def resolve_dashboard_type(tenant: Tenant | None) -> str:
    if not tenant:
        return "standard_crm"
    if normalize_industry_key(tenant.industry) == "real_estate":
        if tenant.business_type == "real_estate_agency":
            return "real_estate_agency"
        return "real_estate_company"
    return "standard_crm"


def provision_real_estate_business_entities(
    db: Session,
    tenant: Tenant,
    owner_user: User,
    *,
    rera_registration_number: str | None = None,
    city: str | None = None,
    state: str | None = None,
    office_address: str | None = None,
) -> tuple[RealEstateBusinessProfile | None, Agency | None]:
    """Provision RealEstateBusinessProfile (and global Agency if paid agency) inside tenant creation tx."""
    if normalize_industry_key(tenant.industry) != "real_estate":
        return None, None

    btype = tenant.business_type or "real_estate_company"
    tenant.business_type = btype

    profile = db.query(RealEstateBusinessProfile).filter(RealEstateBusinessProfile.tenant_id == tenant.id).first()
    if not profile:
        profile = RealEstateBusinessProfile(
            tenant_id=tenant.id,
            business_type=btype,
            legal_name=tenant.name,
            display_name=tenant.name,
            rera_registration_number=rera_registration_number,
            gst_number=tenant.gst_number,
            city=city,
            state=state,
            office_address=office_address or tenant.billing_address,
            conversion_locked=True,
        )
        db.add(profile)
        db.flush()

    agency = None
    if btype == "real_estate_agency":
        email = _norm_email(tenant.billing_email or owner_user.email)
        phone = _norm_phone(tenant.billing_phone or owner_user.phone or "+0000000000")
        # Reuse existing global free agency identity if this email was previously invited as free!
        agency = db.query(Agency).filter(func.lower(Agency.verified_email) == email).with_for_update().first()
        if agency:
            if agency.tenant_id and agency.tenant_id != tenant.id:
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="An independent paid agency with this email already exists.",
                )
            agency.operating_mode = "paid_tenant"
            agency.tenant_id = tenant.id
            agency.legal_name = tenant.name
            agency.display_name = tenant.name
            agency.upgraded_to_paid_at = _utc_now()
            if rera_registration_number:
                agency.rera_registration_number = rera_registration_number
            if city:
                agency.city = city
            if state:
                agency.state = state
            if office_address:
                agency.office_address = office_address
        else:
            agency = Agency(
                agency_code=_generate_agency_code(),
                legal_name=tenant.name,
                display_name=tenant.name,
                primary_contact_name=owner_user.full_name,
                verified_email=email,
                verified_phone=phone,
                rera_registration_number=rera_registration_number,
                gst_number=tenant.gst_number,
                city=city,
                state=state,
                office_address=office_address or tenant.billing_address,
                operating_mode="paid_tenant",
                tenant_id=tenant.id,
                status="Active",
            )
            db.add(agency)
            db.flush()

        member = (
            db.query(AgencyMember)
            .filter(AgencyMember.agency_id == agency.id, func.lower(AgencyMember.email) == _norm_email(owner_user.email))
            .first()
        )
        if member:
            member.user_id = owner_user.id
            member.full_name = owner_user.full_name
            member.role = "agency_owner"
            member.status = "Active"
        else:
            db.add(
                AgencyMember(
                    agency_id=agency.id,
                    user_id=owner_user.id,
                    full_name=owner_user.full_name,
                    email=_norm_email(owner_user.email),
                    phone=owner_user.phone,
                    role="agency_owner",
                    status="Active",
                )
            )
        db.flush()

    return profile, agency


def convert_tenant_business_type(
    db: Session,
    tenant_id: UUID,
    target_business_type: str,
    reason: str,
    admin_user_id: UUID,
) -> Tenant:
    """Controlled platform-administrator business type conversion (never self-service)."""
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).with_for_update().first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    if normalize_industry_key(tenant.industry) != "real_estate":
        raise HTTPException(status_code=409, detail="Business type conversion applies only to Real Estate tenants.")
    if tenant.business_type == target_business_type:
        raise HTTPException(status_code=409, detail=f"Tenant is already a {target_business_type}.")

    old_type = tenant.business_type
    tenant.business_type = target_business_type
    profile = db.query(RealEstateBusinessProfile).filter(RealEstateBusinessProfile.tenant_id == tenant.id).first()
    if profile:
        profile.business_type = target_business_type
        profile.last_converted_at = _utc_now()
        profile.last_converted_by = admin_user_id

    if target_business_type == "real_estate_agency":
        owner = db.query(User).filter(User.tenant_id == tenant.id, User.status == "Active").first()
        if owner:
            provision_real_estate_business_entities(db, tenant, owner)

    log_audit(
        db,
        tenant.id,
        admin_user_id,
        "UPDATE",
        "tenants",
        tenant.id,
        f"Controlled business type conversion: {old_type} -> {target_business_type}. Reason: {reason}",
        before_data={"business_type": old_type},
        after_data={"business_type": target_business_type, "reason": reason},
    )
    return tenant


# --- Phase 2: Global Agency Detection & Invitations ---

def find_existing_agency(db: Session, email: str, phone: str | None = None) -> Agency | None:
    """Detect an existing global Agency by verified email or verified phone without duplicating."""
    norm_email = _norm_email(email)
    filters = [func.lower(Agency.verified_email) == norm_email]
    norm_ph = _norm_phone(phone or "")
    if len(norm_ph) >= 7:
        filters.append(Agency.verified_phone == norm_ph)
    return db.query(Agency).filter(or_(*filters)).first()


def notify_agency(
    db: Session,
    agency_id: UUID,
    event_type: str,
    title: str,
    message: str,
    *,
    connection_id: UUID | None = None,
    property_id: UUID | None = None,
    payload: dict | None = None,
    idempotency_key: str | None = None,
) -> AgencyNotification | None:
    if idempotency_key:
        existing = db.query(AgencyNotification).filter(AgencyNotification.idempotency_key == idempotency_key).first()
        if existing:
            return existing
    row = AgencyNotification(
        agency_id=agency_id,
        connection_id=connection_id,
        property_id=property_id,
        event_type=event_type,
        title=title,
        message=message,
        payload=payload or {},
        idempotency_key=idempotency_key,
    )
    db.add(row)
    return row


def _notify_company_admins(db: Session, company_tenant_id: UUID, title: str, message: str, entity_type: str, entity_id: UUID) -> None:
    users = db.query(User.id).filter(User.tenant_id == company_tenant_id, User.status == "Active").limit(10).all()
    for (uid,) in users:
        db.add(
            Notification(
                tenant_id=company_tenant_id,
                recipient_user_id=uid,
                title=title,
                message=message,
                related_module=entity_type,
                related_record_id=entity_id,
            )
        )


def _assert_no_active_connection(db: Session, company_tenant_id: UUID, agency_id: UUID) -> None:
    existing = (
        db.query(CompanyAgencyConnection)
        .filter(
            CompanyAgencyConnection.company_tenant_id == company_tenant_id,
            CompanyAgencyConnection.agency_id == agency_id,
            CompanyAgencyConnection.status.in_(NON_TERMINAL_CONNECTION_STATUSES),
        )
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An active or in-progress connection already exists with this agency (status: {existing.status}).",
        )


def _validate_company_properties(db: Session, company_tenant_id: UUID, property_ids: list[UUID]) -> list[UUID]:
    if not property_ids:
        return []
    unique_ids = list(dict.fromkeys(property_ids))
    found = (
        db.query(Property.id)
        .filter(Property.tenant_id == company_tenant_id, Property.id.in_(unique_ids))
        .all()
    )
    found_set = {row[0] for row in found}
    missing = [str(pid) for pid in unique_ids if pid not in found_set]
    if missing:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Properties not found in your company inventory: {', '.join(missing)}",
        )
    return unique_ids


def create_company_agency_invitation(
    db: Session,
    company_tenant_id: UUID,
    invited_by_user_id: UUID,
    payload,
) -> tuple[AgencyInvitation, str, CompanyAgencyConnection | None, bool]:
    """Company invites a new OR already-registered global agency.

    If the agency already exists globally, no duplicate agency is created; an independent
    CompanyAgencyConnection (Pending) + AgencyAgreementVersion v1 is created immediately and
    the agency is notified in-app while also receiving the secure invitation link.
    """
    norm_email = _norm_email(payload.email)
    norm_phone = _norm_phone(payload.phone)
    valid_prop_ids = _validate_company_properties(db, company_tenant_id, payload.property_ids)
    existing_agency = find_existing_agency(db, norm_email, norm_phone)

    if existing_agency:
        if existing_agency.tenant_id == company_tenant_id:
            raise HTTPException(status_code=409, detail="A company cannot invite itself as an agency.")
        _assert_no_active_connection(db, company_tenant_id, existing_agency.id)

    raw_token = secrets.token_urlsafe(36)
    now = _utc_now()
    comm_dict = payload.commission_terms.model_dump(mode="json") if payload.commission_terms else {}

    invitation = AgencyInvitation(
        company_tenant_id=company_tenant_id,
        invited_by_user_id=invited_by_user_id,
        existing_agency_id=existing_agency.id if existing_agency else None,
        invited_agency_name=payload.agency_name.strip(),
        invited_contact_name=payload.contact_name.strip(),
        invited_email=norm_email,
        invited_phone=norm_phone,
        business_details=payload.business_details,
        token_hash=hash_token(raw_token),
        expires_at=now + timedelta(hours=payload.expires_in_hours),
        onboarding_choice=existing_agency.operating_mode if existing_agency else "pending",
        can_sale=payload.can_sale,
        can_rent=payload.can_rent,
        can_lease=payload.can_lease,
        proposed_sharing_scope=payload.sharing_scope,
        proposed_property_ids=[str(pid) for pid in valid_prop_ids],
        proposed_commission_terms=comm_dict,
        proposed_responsibilities=payload.responsibilities or {},
        proposed_agreement_text=payload.agreement_text,
        proposed_start_date=payload.start_date,
        proposed_expiry_date=payload.expiry_date,
        termination_notice_days=payload.termination_notice_days,
        status="Sent",
    )
    db.add(invitation)
    db.flush()

    connection = None
    if existing_agency:
        connection = _create_connection_with_v1(
            db=db,
            company_tenant_id=company_tenant_id,
            agency_id=existing_agency.id,
            initiated_by="company",
            actor_id=invited_by_user_id,
            invitation_id=invitation.id,
            can_sale=payload.can_sale,
            can_rent=payload.can_rent,
            can_lease=payload.can_lease,
            sharing_scope=payload.sharing_scope,
            commission_terms=comm_dict,
            responsibilities=payload.responsibilities or {},
            agreement_text=payload.agreement_text,
            starts_at=payload.start_date,
            expires_at=payload.expiry_date,
            termination_notice_days=payload.termination_notice_days,
            initial_status="Sent",
        )
        company = db.query(Tenant).filter(Tenant.id == company_tenant_id).first()
        notify_agency(
            db,
            existing_agency.id,
            "agency_invitation_received",
            f"New company connection invitation from {company.name if company else 'a company'}",
            "Review the proposed transaction permissions, property scope, and commission terms before accepting.",
            connection_id=connection.id,
            payload={"invitation_id": str(invitation.id), "company_tenant_id": str(company_tenant_id)},
            idempotency_key=f"invite:{invitation.id}",
        )

    log_audit(
        db,
        company_tenant_id,
        invited_by_user_id,
        "CREATE",
        "agency_invitations",
        invitation.id,
        f"Invited agency '{invitation.invited_agency_name}' ({'existing global agency' if existing_agency else 'new agency'}).",
        after_data={"existing_agency_id": str(existing_agency.id) if existing_agency else None, "status": invitation.status},
    )
    return invitation, raw_token, connection, existing_agency is not None


def _create_connection_with_v1(
    *,
    db: Session,
    company_tenant_id: UUID,
    agency_id: UUID,
    initiated_by: str,
    actor_id: UUID | None,
    invitation_id: UUID | None,
    can_sale: bool,
    can_rent: bool,
    can_lease: bool,
    sharing_scope: str,
    commission_terms: dict,
    responsibilities: dict,
    agreement_text: str | None,
    starts_at,
    expires_at,
    termination_notice_days: int,
    initial_status: str,
    notes: str | None = None,
) -> CompanyAgencyConnection:
    conn = CompanyAgencyConnection(
        company_tenant_id=company_tenant_id,
        agency_id=agency_id,
        initiated_by=initiated_by,
        invitation_id=invitation_id,
        status=initial_status,
        can_sale=can_sale,
        can_rent=can_rent,
        can_lease=can_lease,
        sharing_scope=sharing_scope,
        starts_at=starts_at,
        expires_at=expires_at,
        termination_notice_days=termination_notice_days,
        notes=notes,
    )
    db.add(conn)
    db.flush()

    v1 = AgencyAgreementVersion(
        connection_id=conn.id,
        version_number=1,
        proposed_by_side=initiated_by,
        proposed_by_actor_id=actor_id,
        status="Proposed",
        can_sale=can_sale,
        can_rent=can_rent,
        can_lease=can_lease,
        sharing_scope=sharing_scope,
        commission_terms=commission_terms or {},
        responsibilities=responsibilities or {},
        agreement_text=agreement_text,
        effective_from=starts_at,
        effective_to=expires_at,
        termination_notice_days=termination_notice_days,
        change_summary="Initial commercial proposal",
    )
    db.add(v1)
    db.flush()
    return conn


def complete_invitation_onboarding(db: Session, payload) -> dict:
    """Handle agency opening an invitation link and choosing Free Collaboration or Paid Subscription.

    Never auto-activates the connection or grants property access—creates/links global Agency
    and moves connection to Agreement Pending so both sides must review/sign the agreement first.
    """
    now = _utc_now()
    inv = (
        db.query(AgencyInvitation)
        .filter(AgencyInvitation.token_hash == hash_token(payload.token))
        .with_for_update()
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation link is invalid.")
    if inv.revoked_at or inv.status in ("Cancelled", "Rejected"):
        raise HTTPException(status_code=409, detail=f"Invitation is no longer active ({inv.status}).")
    if inv.expires_at <= now:
        inv.status = "Expired"
        db.flush()
        raise HTTPException(status_code=410, detail="Invitation link has expired.")
    if inv.used_at is not None:
        raise HTTPException(status_code=409, detail="Invitation link has already been used.")

    agency = None
    if inv.existing_agency_id:
        agency = db.query(Agency).filter(Agency.id == inv.existing_agency_id).first()
    if not agency:
        agency = find_existing_agency(db, inv.invited_email, inv.invited_phone)

    member = None
    if not agency:
        if payload.onboarding_choice == "free_external":
            if not payload.password:
                raise HTTPException(status_code=422, detail="Password is required to create a Free Collaboration account.")
            agency = Agency(
                agency_code=_generate_agency_code(),
                legal_name=inv.invited_agency_name,
                display_name=inv.invited_agency_name,
                primary_contact_name=payload.full_name or inv.invited_contact_name,
                verified_email=_norm_email(inv.invited_email),
                verified_phone=_norm_phone(inv.invited_phone),
                rera_registration_number=payload.rera_registration_number,
                city=payload.city,
                state=payload.state,
                office_address=payload.office_address,
                operating_mode="free_external",
                tenant_id=None,
                status="Active",
            )
            db.add(agency)
            db.flush()
            member = AgencyMember(
                agency_id=agency.id,
                full_name=payload.full_name or inv.invited_contact_name,
                email=_norm_email(inv.invited_email),
                phone=_norm_phone(inv.invited_phone),
                password_hash=hash_password(payload.password),
                role="agency_owner",
                status="Active",
            )
            db.add(member)
            db.flush()
        else:
            # Paid choice selected for a brand-new agency: record intent & direct to standard /auth/register
            inv.onboarding_choice = "paid_tenant"
            inv.opened_at = inv.opened_at or now
            inv.status = "Opened"
            db.flush()
            return {
                "next_step": "complete_paid_registration",
                "message": "Complete Real Estate Agency registration at /api/v1/auth/register with business_type='real_estate_agency', then review and sign the connection agreement.",
                "invitation_id": str(inv.id),
                "onboarding_choice": "paid_tenant",
                "connection_activated": False,
            }

    # Ensure connection exists (existing agency invite may already have created one)
    conn = (
        db.query(CompanyAgencyConnection)
        .filter(
            CompanyAgencyConnection.company_tenant_id == inv.company_tenant_id,
            CompanyAgencyConnection.agency_id == agency.id,
            CompanyAgencyConnection.status.in_(NON_TERMINAL_CONNECTION_STATUSES),
        )
        .first()
    )
    if not conn:
        conn = _create_connection_with_v1(
            db=db,
            company_tenant_id=inv.company_tenant_id,
            agency_id=agency.id,
            initiated_by="company",
            actor_id=inv.invited_by_user_id,
            invitation_id=inv.id,
            can_sale=inv.can_sale,
            can_rent=inv.can_rent,
            can_lease=inv.can_lease,
            sharing_scope=inv.proposed_sharing_scope,
            commission_terms=inv.proposed_commission_terms or {},
            responsibilities=inv.proposed_responsibilities or {},
            agreement_text=inv.proposed_agreement_text,
            starts_at=inv.proposed_start_date,
            expires_at=inv.proposed_expiry_date,
            termination_notice_days=inv.termination_notice_days,
            initial_status="Agreement Pending",
        )
    elif conn.status == "Sent":
        conn.status = "Agreement Pending"

    inv.existing_agency_id = agency.id
    inv.onboarding_choice = agency.operating_mode
    inv.opened_at = inv.opened_at or now
    inv.used_at = now
    inv.status = "Accepted"
    db.flush()

    return {
        "next_step": "review_and_sign_agreement",
        "agency_id": str(agency.id),
        "agency_code": agency.agency_code,
        "operating_mode": agency.operating_mode,
        "connection_id": str(conn.id),
        "connection_status": conn.status,
        "connection_activated": False,
        "member": member,
        "agency": agency,
    }


def create_agency_connection_request(db: Session, agency_ctx: dict, payload) -> CompanyAgencyConnection:
    """Agency initiates a connection request to a Real Estate Company."""
    agency_id: UUID = agency_ctx["agency_id"]
    company = db.query(Tenant).filter(Tenant.id == payload.company_tenant_id).first()
    if not company or company.status not in ("Active", "Trial"):
        raise HTTPException(status_code=404, detail="Target Real Estate Company not found.")
    if company.business_type != "real_estate_company":
        raise HTTPException(status_code=409, detail="Target tenant is not a Real Estate Company.")
    if agency_ctx.get("tenant_id") == company.id:
        raise HTTPException(status_code=409, detail="Cannot connect an agency to its own tenant.")

    _assert_no_active_connection(db, company.id, agency_id)

    conn = _create_connection_with_v1(
        db=db,
        company_tenant_id=company.id,
        agency_id=agency_id,
        initiated_by="agency",
        actor_id=agency_ctx["actor_id"],
        invitation_id=None,
        can_sale=payload.can_sale,
        can_rent=payload.can_rent,
        can_lease=payload.can_lease,
        sharing_scope=payload.sharing_scope,
        commission_terms=payload.commission_terms.model_dump(mode="json") if payload.commission_terms else {},
        responsibilities=payload.responsibilities or {},
        agreement_text=payload.agreement_text,
        starts_at=payload.start_date,
        expires_at=payload.expiry_date,
        termination_notice_days=payload.termination_notice_days,
        initial_status="Pending",
        notes=payload.notes,
    )

    agency = db.query(Agency).filter(Agency.id == agency_id).first()
    _notify_company_admins(
        db,
        company.id,
        f"New agency connection request from {agency.display_name if agency else 'an agency'}",
        "Review requested transaction permissions, property scope, and proposed commission terms.",
        "company_agency_connections",
        conn.id,
    )
    log_audit(
        db,
        company.id,
        None,
        "CREATE",
        "company_agency_connections",
        conn.id,
        f"Agency {agency_id} requested a connection with company {company.id}.",
        after_data={"status": conn.status, "initiated_by": "agency"},
    )
    return conn


# --- Phase 3: Agreement Versioning, Counterproposals, Signing & Lifecycle ---

def _assert_transition(conn: CompanyAgencyConnection, target_status: str) -> None:
    allowed = ALLOWED_CONNECTION_TRANSITIONS.get(conn.status, set())
    if target_status not in allowed:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Invalid connection status transition: '{conn.status}' -> '{target_status}'.",
        )


def _latest_agreement_version(db: Session, connection_id: UUID) -> AgencyAgreementVersion:
    ver = (
        db.query(AgencyAgreementVersion)
        .filter(AgencyAgreementVersion.connection_id == connection_id)
        .order_by(AgencyAgreementVersion.version_number.desc())
        .with_for_update()
        .first()
    )
    if not ver:
        raise HTTPException(status_code=404, detail="No agreement version found for this connection.")
    return ver


def counterpropose_agreement_version(
    db: Session,
    conn: CompanyAgencyConnection,
    side: str,
    actor_id: UUID,
    payload,
) -> AgencyAgreementVersion:
    """Create a new immutable agreement version (superseding the previous open version)."""
    _assert_transition(conn, "Counterproposed")
    latest = _latest_agreement_version(db, conn.id)
    if latest.status in ("Proposed", "Counterproposed", "Draft"):
        latest.status = "Superseded"

    new_ver = AgencyAgreementVersion(
        connection_id=conn.id,
        version_number=latest.version_number + 1,
        proposed_by_side=side,
        proposed_by_actor_id=actor_id,
        status="Counterproposed",
        can_sale=payload.can_sale,
        can_rent=payload.can_rent,
        can_lease=payload.can_lease,
        sharing_scope=payload.sharing_scope,
        commission_terms=payload.commission_terms.model_dump(mode="json"),
        responsibilities=payload.responsibilities or {},
        agreement_text=payload.agreement_text,
        effective_from=payload.effective_from,
        effective_to=payload.effective_to,
        termination_notice_days=payload.termination_notice_days,
        change_summary=payload.change_summary,
    )
    db.add(new_ver)
    conn.status = "Counterproposed"
    db.flush()

    if side == "company":
        notify_agency(
            db,
            conn.agency_id,
            "agreement_counterproposed",
            f"Company submitted agreement counterproposal (v{new_ver.version_number})",
            payload.change_summary,
            connection_id=conn.id,
            idempotency_key=f"counter:{new_ver.id}",
        )
    else:
        _notify_company_admins(
            db,
            conn.company_tenant_id,
            f"Agency submitted agreement counterproposal (v{new_ver.version_number})",
            payload.change_summary,
            "agency_agreement_versions",
            new_ver.id,
        )

    log_audit(
        db,
        conn.company_tenant_id,
        actor_id if side == "company" else None,
        "CREATE",
        "agency_agreement_versions",
        new_ver.id,
        f"{side.title()} proposed agreement v{new_ver.version_number}: {payload.change_summary}",
        after_data={"version_number": new_ver.version_number, "side": side},
    )
    return new_ver


def sign_agreement_version(
    db: Session,
    conn: CompanyAgencyConnection,
    side: str,
    actor_id: UUID,
    signature_name: str,
) -> AgencyAgreementVersion:
    """Record company or agency acceptance/signature on the latest agreement version."""
    if conn.status in ("Rejected", "Expired", "Cancelled", "Terminated"):
        raise HTTPException(status_code=409, detail=f"Cannot sign agreement on a '{conn.status}' connection.")

    ver = _latest_agreement_version(db, conn.id)
    if ver.status in ("Superseded", "Rejected"):
        raise HTTPException(status_code=409, detail=f"Agreement version v{ver.version_number} cannot be signed ({ver.status}).")

    now = _utc_now()
    if side == "company":
        ver.company_accepted_by = actor_id
        ver.company_accepted_at = now
        ver.company_signature_name = signature_name.strip()
    else:
        ver.agency_accepted_by = actor_id
        ver.agency_accepted_at = now
        ver.agency_signature_name = signature_name.strip()

    if conn.status in ("Sent", "Pending", "Counterproposed"):
        conn.status = "Agreement Pending"

    if ver.company_accepted_at and ver.agency_accepted_at:
        ver.status = "Accepted"
        conn.active_agreement_version_id = ver.id
        conn.can_sale = ver.can_sale
        conn.can_rent = ver.can_rent
        conn.can_lease = ver.can_lease
        conn.sharing_scope = ver.sharing_scope
        conn.starts_at = ver.effective_from
        conn.expires_at = ver.effective_to
        conn.termination_notice_days = ver.termination_notice_days

    db.flush()
    log_audit(
        db,
        conn.company_tenant_id,
        actor_id if side == "company" else None,
        "UPDATE",
        "agency_agreement_versions",
        ver.id,
        f"{side.title()} signed agreement v{ver.version_number} as '{signature_name}'.",
        after_data={"version_status": ver.status, "connection_status": conn.status},
    )
    return ver


def activate_connection(
    db: Session,
    company_tenant_id: UUID,
    user_id: UUID,
    connection_id: UUID,
) -> CompanyAgencyConnection:
    """Company activates a connection ONLY after both sides have signed the active agreement version."""
    conn = (
        db.query(CompanyAgencyConnection)
        .filter(
            CompanyAgencyConnection.id == connection_id,
            CompanyAgencyConnection.company_tenant_id == company_tenant_id,
        )
        .with_for_update()
        .first()
    )
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found.")

    _assert_transition(conn, "Active")
    if not conn.active_agreement_version_id:
        raise HTTPException(
            status_code=409,
            detail="Both the company and the agency must sign the agreement before activating the connection.",
        )
    ver = db.query(AgencyAgreementVersion).filter(AgencyAgreementVersion.id == conn.active_agreement_version_id).first()
    if not ver or ver.status != "Accepted":
        raise HTTPException(status_code=409, detail="Active agreement version is not fully accepted by both parties.")

    now = _utc_now()
    conn.status = "Active"
    conn.activated_at = conn.activated_at or now
    conn.activated_by_user_id = user_id

    # Materialize initial proposed_property_ids if invitation specified selected properties
    if conn.sharing_scope == "selected_properties" and conn.invitation_id:
        inv = db.query(AgencyInvitation).filter(AgencyInvitation.id == conn.invitation_id).first()
        if inv and inv.proposed_property_ids:
            prop_uuids = [UUID(str(pid)) for pid in inv.proposed_property_ids]
            valid_ids = _validate_company_properties(db, company_tenant_id, prop_uuids)
            for pid in valid_ids:
                existing_grant = (
                    db.query(AgencyPropertyAccess)
                    .filter(AgencyPropertyAccess.connection_id == conn.id, AgencyPropertyAccess.property_id == pid)
                    .first()
                )
                if not existing_grant:
                    db.add(
                        AgencyPropertyAccess(
                            connection_id=conn.id,
                            company_tenant_id=company_tenant_id,
                            agency_id=conn.agency_id,
                            property_id=pid,
                            access_status="Active",
                            granted_by_user_id=user_id,
                            granted_at=now,
                        )
                    )

    db.flush()
    notify_agency(
        db,
        conn.agency_id,
        "connection_activated",
        "Company connection is now Active",
        "You can now view authorized shared properties according to your signed agreement.",
        connection_id=conn.id,
        idempotency_key=f"conn_active:{conn.id}:{int(now.timestamp())}",
    )
    log_audit(
        db,
        company_tenant_id,
        user_id,
        "UPDATE",
        "company_agency_connections",
        conn.id,
        f"Activated connection with agency {conn.agency_id}.",
        after_data={"status": "Active", "sharing_scope": conn.sharing_scope},
    )
    return conn


def transition_connection_status(
    db: Session,
    conn: CompanyAgencyConnection,
    target_status: str,
    actor_side: str,
    actor_id: UUID,
    reason: str,
    post_termination_policy: str | None = None,
) -> CompanyAgencyConnection:
    """Validated lifecycle transition for Reject, Cancel, Suspend, Resume (Active), or Terminate."""
    _assert_transition(conn, target_status)
    now = _utc_now()
    old_status = conn.status
    conn.status = target_status

    if target_status == "Suspended":
        conn.suspended_at = now
        conn.suspended_reason = reason
    elif target_status == "Active" and old_status == "Suspended":
        conn.suspended_at = None
        conn.suspended_reason = None
    elif target_status == "Terminated":
        conn.terminated_at = now
        conn.termination_reason = reason
        if post_termination_policy:
            conn.post_termination_policy = post_termination_policy
        # Immediately revoke active property grants while preserving all historical connection/agreement rows!
        db.query(AgencyPropertyAccess).filter(
            AgencyPropertyAccess.connection_id == conn.id,
            AgencyPropertyAccess.access_status == "Active",
        ).update(
            {
                AgencyPropertyAccess.access_status: "Revoked",
                AgencyPropertyAccess.revoked_at: now,
                AgencyPropertyAccess.revoked_by_user_id: actor_id if actor_side == "company" else None,
            },
            synchronize_session=False,
        )

    db.flush()
    notify_agency(
        db,
        conn.agency_id,
        f"connection_{target_status.lower()}",
        f"Connection status updated to {target_status}",
        reason,
        connection_id=conn.id,
        idempotency_key=f"conn_status:{conn.id}:{target_status}:{int(now.timestamp())}",
    )
    log_audit(
        db,
        conn.company_tenant_id,
        actor_id if actor_side == "company" else None,
        "UPDATE",
        "company_agency_connections",
        conn.id,
        f"Connection transitioned {old_status} -> {target_status} by {actor_side}. Reason: {reason}",
        before_data={"status": old_status},
        after_data={"status": target_status, "reason": reason},
    )
    return conn


# --- Phase 4: Central Shared Property Access & Multi-Agency Broadcasts ---

def update_connection_property_sharing(
    db: Session,
    company_tenant_id: UUID,
    user_id: UUID,
    connection_id: UUID,
    payload,
) -> dict:
    """Company updates sharing_scope and/or grants/revokes specific properties for an active connection."""
    conn = (
        db.query(CompanyAgencyConnection)
        .filter(
            CompanyAgencyConnection.id == connection_id,
            CompanyAgencyConnection.company_tenant_id == company_tenant_id,
        )
        .with_for_update()
        .first()
    )
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found.")
    if conn.status != "Active":
        raise HTTPException(status_code=409, detail="Property sharing can only be modified on an Active connection.")

    now = _utc_now()
    if payload.sharing_scope:
        conn.sharing_scope = payload.sharing_scope

    granted_ids = _validate_company_properties(db, company_tenant_id, payload.grant_property_ids)
    revoked_ids = _validate_company_properties(db, company_tenant_id, payload.revoke_property_ids)

    for pid in granted_ids:
        grant = (
            db.query(AgencyPropertyAccess)
            .filter(AgencyPropertyAccess.connection_id == conn.id, AgencyPropertyAccess.property_id == pid)
            .first()
        )
        if grant:
            grant.access_status = "Active"
            grant.granted_by_user_id = user_id
            grant.granted_at = now
            grant.revoked_at = None
            grant.revoked_by_user_id = None
            grant.notes = payload.notes
        else:
            db.add(
                AgencyPropertyAccess(
                    connection_id=conn.id,
                    company_tenant_id=company_tenant_id,
                    agency_id=conn.agency_id,
                    property_id=pid,
                    access_status="Active",
                    granted_by_user_id=user_id,
                    granted_at=now,
                    notes=payload.notes,
                )
            )

    db.flush()

    if revoked_ids:
        db.query(AgencyPropertyAccess).filter(
            AgencyPropertyAccess.connection_id == conn.id,
            AgencyPropertyAccess.property_id.in_(revoked_ids),
        ).update(
            {
                AgencyPropertyAccess.access_status: "Revoked",
                AgencyPropertyAccess.revoked_by_user_id: user_id,
                AgencyPropertyAccess.revoked_at: now,
            },
            synchronize_session="fetch",
        )

    db.flush()
    notify_agency(
        db,
        conn.agency_id,
        "property_sharing_updated",
        "Shared property access updated",
        f"Scope: {conn.sharing_scope}. Granted: {len(granted_ids)}, Revoked: {len(revoked_ids)}.",
        connection_id=conn.id,
    )
    log_audit(
        db,
        company_tenant_id,
        user_id,
        "UPDATE",
        "agency_property_access",
        conn.id,
        f"Updated property sharing for agency {conn.agency_id} (scope={conn.sharing_scope}).",
        after_data={"granted": [str(i) for i in granted_ids], "revoked": [str(i) for i in revoked_ids]},
    )
    return {
        "connection_id": str(conn.id),
        "sharing_scope": conn.sharing_scope,
        "granted_count": len(granted_ids),
        "revoked_count": len(revoked_ids),
    }


def _connection_permits_listing_type(conn: CompanyAgencyConnection, listing_type: str | None) -> bool:
    lt = (listing_type or "").strip().lower()
    if lt == "sale":
        return bool(conn.can_sale)
    if lt == "rent":
        return bool(conn.can_rent)
    if lt == "lease":
        return bool(conn.can_lease)
    return False


def list_agency_authorized_properties(
    db: Session,
    agency_id: UUID,
    *,
    company_tenant_id: UUID | None = None,
    listing_type: str | None = None,
    city: str | None = None,
    status_filter: str | None = None,
) -> list[dict]:
    """Return central company-owned properties authorized for this global agency across active connections."""
    conn_q = db.query(CompanyAgencyConnection).filter(
        CompanyAgencyConnection.agency_id == agency_id,
        CompanyAgencyConnection.status == "Active",
    )
    if company_tenant_id:
        conn_q = conn_q.filter(CompanyAgencyConnection.company_tenant_id == company_tenant_id)
    active_conns = conn_q.all()
    if not active_conns:
        return []

    company_ids = [c.company_tenant_id for c in active_conns]
    companies = {t.id: t.name for t in db.query(Tenant.id, Tenant.name).filter(Tenant.id.in_(company_ids)).all()}

    results: list[dict] = []
    for conn in active_conns:
        allowed_types = []
        if conn.can_sale:
            allowed_types.append("Sale")
        if conn.can_rent:
            allowed_types.append("Rent")
        if conn.can_lease:
            allowed_types.append("Lease")
        if not allowed_types:
            continue

        prop_q = db.query(Property).filter(
            Property.tenant_id == conn.company_tenant_id,
            Property.listing_type.in_(allowed_types),
        )
        if conn.sharing_scope == "selected_properties":
            granted_prop_ids = [
                row[0]
                for row in db.query(AgencyPropertyAccess.property_id)
                .filter(
                    AgencyPropertyAccess.connection_id == conn.id,
                    AgencyPropertyAccess.access_status == "Active",
                )
                .all()
            ]
            if not granted_prop_ids:
                continue
            prop_q = prop_q.filter(Property.id.in_(granted_prop_ids))
        else:
            # all_eligible: exclude explicitly revoked properties if any
            revoked_prop_ids = [
                row[0]
                for row in db.query(AgencyPropertyAccess.property_id)
                .filter(
                    AgencyPropertyAccess.connection_id == conn.id,
                    AgencyPropertyAccess.access_status == "Revoked",
                )
                .all()
            ]
            if revoked_prop_ids:
                prop_q = prop_q.filter(~Property.id.in_(revoked_prop_ids))

        if listing_type:
            prop_q = prop_q.filter(func.lower(Property.listing_type) == listing_type.strip().lower())
        if city:
            prop_q = prop_q.filter(func.lower(Property.city) == city.strip().lower())
        if status_filter:
            prop_q = prop_q.filter(func.lower(Property.status) == status_filter.strip().lower())

        for prop in prop_q.order_by(Property.created_at.desc()).all():
            results.append(
                {
                    "property_id": str(prop.id),
                    "connection_id": str(conn.id),
                    "source_company_tenant_id": str(conn.company_tenant_id),
                    "source_company_name": companies.get(conn.company_tenant_id, ""),
                    "name": prop.name,
                    "unit_number": prop.unit_number,
                    "property_type": prop.property_type,
                    "listing_type": prop.listing_type,
                    "status": prop.status,
                    "price": str(prop.price) if prop.price is not None else None,
                    "security_deposit": str(prop.security_deposit) if prop.security_deposit is not None else None,
                    "city": prop.city,
                    "state": prop.state,
                    "bedrooms": prop.bedrooms,
                    "area": str(prop.area) if prop.area is not None else None,
                    "area_unit": prop.area_unit,
                }
            )
    return results


def broadcast_property_availability_change(
    db: Session,
    company_tenant_id: UUID,
    property_id: UUID,
    event_type: str,
    title: str,
    message: str,
    *,
    payload: dict | None = None,
    idempotency_prefix: str | None = None,
) -> int:
    """Notify every agency with active access to a central company property when availability changes."""
    prop = db.query(Property).filter(Property.id == property_id, Property.tenant_id == company_tenant_id).first()
    if not prop:
        return 0

    active_conns = (
        db.query(CompanyAgencyConnection)
        .filter(
            CompanyAgencyConnection.company_tenant_id == company_tenant_id,
            CompanyAgencyConnection.status == "Active",
        )
        .all()
    )
    if not active_conns:
        return 0

    notified = 0
    for conn in active_conns:
        if not _connection_permits_listing_type(conn, prop.listing_type):
            continue
        grant = (
            db.query(AgencyPropertyAccess)
            .filter(AgencyPropertyAccess.connection_id == conn.id, AgencyPropertyAccess.property_id == property_id)
            .first()
        )
        if conn.sharing_scope == "selected_properties":
            if not grant or grant.access_status != "Active":
                continue
        else:
            if grant and grant.access_status == "Revoked":
                continue

        idem_key = f"{idempotency_prefix}:{conn.agency_id}" if idempotency_prefix else None
        notify_agency(
            db,
            conn.agency_id,
            event_type,
            title,
            message,
            connection_id=conn.id,
            property_id=property_id,
            payload={**(payload or {}), "property_status": prop.status, "property_name": prop.name},
            idempotency_key=idem_key,
        )
        notified += 1
    return notified