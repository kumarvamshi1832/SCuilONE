"""API routes for Phases 1–4:
- Phase 1: Real Estate business profile & guarded admin business_type conversion
- Phase 2: Global Agency auth (Free External + Paid unified /me), invitations, existing-agency detection & bi-directional requests
- Phase 3: Company-Agency connections, immutable agreement versions, counterproposals, signing, activation, suspension & termination
- Phase 4: Central shared property access (`all_eligible` vs `selected_properties`), authorized inventory, and agency notifications
"""
from __future__ import annotations

from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.agency_auth import (
    create_free_agency_tokens,
    hash_token,
    require_agency_actor,
    require_real_estate_company,
)
from app.core.dependencies import get_db, require_active_user
from app.core.platform_rbac import require_platform_permission
from app.core.security import verify_password
from app.models.agency import (
    Agency,
    AgencyAgreementVersion,
    AgencyInvitation,
    AgencyMember,
    AgencyNotification,
    AgencyPropertyAccess,
    AgencySession,
    CompanyAgencyConnection,
    RealEstateBusinessProfile,
)
from app.models.tenant import Tenant
from app.schemas.agency import (
    AgencyConnectionRequestIn,
    AgencyInviteCreateIn,
    AgreementCounterproposalIn,
    AgreementSignIn,
    BusinessTypeConversionRequest,
    ConnectionStatusActionIn,
    FreeAgencyLoginIn,
    InvitationOnboardingIn,
    PropertyShareUpdateIn,
    RealEstateBusinessProfileUpdate,
)
from app.services.agency_collaboration import (
    activate_connection,
    complete_invitation_onboarding,
    convert_tenant_business_type,
    counterpropose_agreement_version,
    create_agency_connection_request,
    create_company_agency_invitation,
    find_existing_agency,
    list_agency_authorized_properties,
    resolve_dashboard_type,
    sign_agreement_version,
    transition_connection_status,
    update_connection_property_sharing,
)

router = APIRouter(tags=["Real Estate Agency Collaboration"])


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _serialize_connection(conn: CompanyAgencyConnection, db: Session) -> dict:
    company = db.query(Tenant).filter(Tenant.id == conn.company_tenant_id).first()
    agency = db.query(Agency).filter(Agency.id == conn.agency_id).first()
    return {
        "id": str(conn.id),
        "company_tenant_id": str(conn.company_tenant_id),
        "company_name": company.name if company else None,
        "agency_id": str(conn.agency_id),
        "agency_code": agency.agency_code if agency else None,
        "agency_name": agency.display_name if agency else None,
        "agency_operating_mode": agency.operating_mode if agency else None,
        "initiated_by": conn.initiated_by,
        "status": conn.status,
        "permissions": {"sale": conn.can_sale, "rent": conn.can_rent, "lease": conn.can_lease},
        "sharing_scope": conn.sharing_scope,
        "active_agreement_version_id": str(conn.active_agreement_version_id) if conn.active_agreement_version_id else None,
        "starts_at": conn.starts_at.isoformat() if conn.starts_at else None,
        "expires_at": conn.expires_at.isoformat() if conn.expires_at else None,
        "termination_notice_days": conn.termination_notice_days,
        "post_termination_policy": conn.post_termination_policy,
        "activated_at": conn.activated_at.isoformat() if conn.activated_at else None,
        "suspended_at": conn.suspended_at.isoformat() if conn.suspended_at else None,
        "terminated_at": conn.terminated_at.isoformat() if conn.terminated_at else None,
        "created_at": conn.created_at.isoformat() if conn.created_at else None,
    }


def _serialize_agreement_version(ver: AgencyAgreementVersion) -> dict:
    return {
        "id": str(ver.id),
        "connection_id": str(ver.connection_id),
        "version_number": ver.version_number,
        "proposed_by_side": ver.proposed_by_side,
        "status": ver.status,
        "permissions": {"sale": ver.can_sale, "rent": ver.can_rent, "lease": ver.can_lease},
        "sharing_scope": ver.sharing_scope,
        "commission_terms": ver.commission_terms,
        "responsibilities": ver.responsibilities,
        "agreement_text": ver.agreement_text,
        "effective_from": ver.effective_from.isoformat() if ver.effective_from else None,
        "effective_to": ver.effective_to.isoformat() if ver.effective_to else None,
        "termination_notice_days": ver.termination_notice_days,
        "change_summary": ver.change_summary,
        "company_signed": bool(ver.company_accepted_at),
        "company_signature_name": ver.company_signature_name,
        "company_accepted_at": ver.company_accepted_at.isoformat() if ver.company_accepted_at else None,
        "agency_signed": bool(ver.agency_accepted_at),
        "agency_signature_name": ver.agency_signature_name,
        "agency_accepted_at": ver.agency_accepted_at.isoformat() if ver.agency_accepted_at else None,
        "created_at": ver.created_at.isoformat() if ver.created_at else None,
    }


# ==============================================================================
# PHASE 1: REAL ESTATE BUSINESS PROFILE & CONTROLLED CONVERSION
# ==============================================================================

@router.get("/api/v1/real-estate/business-profile")
def get_business_profile(
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    profile = db.query(RealEstateBusinessProfile).filter(RealEstateBusinessProfile.tenant_id == tenant.id).first()
    agency = db.query(Agency).filter(Agency.tenant_id == tenant.id).first()
    return {
        "tenant_id": str(tenant.id),
        "tenant_name": tenant.name,
        "industry": tenant.industry,
        "business_type": tenant.business_type,
        "dashboard_type": resolve_dashboard_type(tenant),
        "agency_id": str(agency.id) if agency else None,
        "agency_code": agency.agency_code if agency else None,
        "profile": {
            "id": str(profile.id),
            "legal_name": profile.legal_name,
            "display_name": profile.display_name,
            "rera_registration_number": profile.rera_registration_number,
            "gst_number": profile.gst_number,
            "pan_number": profile.pan_number,
            "website": profile.website,
            "city": profile.city,
            "state": profile.state,
            "country": profile.country,
            "office_address": profile.office_address,
            "operating_cities": profile.operating_cities or [],
            "specializations": profile.specializations or [],
            "verification_status": profile.verification_status,
            "conversion_locked": profile.conversion_locked,
        }
        if profile
        else None,
    }


@router.patch("/api/v1/real-estate/business-profile")
def update_business_profile(
    payload: RealEstateBusinessProfileUpdate,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant or not tenant.business_type:
        raise HTTPException(status_code=404, detail="Real Estate business profile not found.")
    profile = db.query(RealEstateBusinessProfile).filter(RealEstateBusinessProfile.tenant_id == tenant.id).first()
    if not profile:
        profile = RealEstateBusinessProfile(
            tenant_id=tenant.id,
            business_type=tenant.business_type,
            legal_name=tenant.name,
            display_name=tenant.name,
        )
        db.add(profile)
        db.flush()

    for field, val in payload.model_dump(exclude_unset=True).items():
        setattr(profile, field, val)
    db.commit()
    db.refresh(profile)
    return {"message": "Business profile updated.", "business_type": tenant.business_type, "display_name": profile.display_name}


@router.post(
    "/api/v1/platform/tenants/{tenant_id}/convert-business-type",
    dependencies=[Depends(require_platform_permission("platform.tenants.manage"))],
)
def platform_convert_business_type(
    tenant_id: UUID,
    payload: BusinessTypeConversionRequest,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    tenant = convert_tenant_business_type(
        db=db,
        tenant_id=tenant_id,
        target_business_type=payload.target_business_type,
        reason=payload.reason,
        admin_user_id=UUID(str(current_user["user_id"])),
    )
    db.commit()
    return {
        "message": "Tenant business type converted successfully.",
        "tenant_id": str(tenant.id),
        "business_type": tenant.business_type,
        "dashboard_type": resolve_dashboard_type(tenant),
    }


# ==============================================================================
# PHASE 2: FREE AGENCY AUTH, INVITATIONS & BI-DIRECTIONAL REQUESTS
# ==============================================================================

@router.post("/api/v1/agency-auth/login")
def free_agency_login(payload: FreeAgencyLoginIn, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    member = (
        db.query(AgencyMember)
        .filter(func.lower(AgencyMember.email) == email, AgencyMember.status == "Active")
        .first()
    )
    if not member or not member.password_hash or not verify_password(payload.password, member.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")
    agency = db.query(Agency).filter(Agency.id == member.agency_id, Agency.status == "Active").first()
    if not agency:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Agency account is not active.")
    if agency.operating_mode == "paid_tenant":
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="This agency is a paid SCuilONE workspace. Sign in via /api/v1/auth/login.",
        )

    member.last_login_at = _utc_now()
    tokens = create_free_agency_tokens(db, agency, member)
    db.commit()
    return {
        **tokens,
        "agency": {
            "id": str(agency.id),
            "agency_code": agency.agency_code,
            "display_name": agency.display_name,
            "operating_mode": agency.operating_mode,
        },
        "member": {"id": str(member.id), "full_name": member.full_name, "email": member.email, "role": member.role},
    }


@router.get("/api/v1/agency-auth/me")
def agency_actor_me(agency_ctx: dict = Depends(require_agency_actor), db: Session = Depends(get_db)):
    agency = db.query(Agency).filter(Agency.id == agency_ctx["agency_id"]).first()
    return {
        "agency_id": str(agency_ctx["agency_id"]),
        "agency_code": agency_ctx["agency_code"],
        "display_name": agency.display_name if agency else None,
        "operating_mode": agency_ctx["operating_mode"],
        "tenant_id": str(agency_ctx["tenant_id"]) if agency_ctx.get("tenant_id") else None,
        "email": agency_ctx["email"],
        "role": agency_ctx["role"],
        "can_manage_independent_crm": agency_ctx["operating_mode"] == "paid_tenant",
    }


@router.get("/api/v1/company/agencies/lookup")
def company_lookup_existing_agency(
    email: str = Query(..., min_length=3),
    phone: str | None = Query(default=None),
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    agency = find_existing_agency(db, email, phone)
    if not agency:
        return {"found": False, "message": "No existing global agency found for this contact."}
    return {
        "found": True,
        "message": "Agency already registered or invited. You can connect the existing agency.",
        "agency": {
            "id": str(agency.id),
            "agency_code": agency.agency_code,
            "display_name": agency.display_name,
            "operating_mode": agency.operating_mode,
            "city": agency.city,
        },
    }


@router.post("/api/v1/company/agencies/invitations", status_code=201)
def company_invite_agency(
    payload: AgencyInviteCreateIn,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    inv, raw_token, conn, existing_detected = create_company_agency_invitation(
        db=db,
        company_tenant_id=company_ctx["tenant_uuid"],
        invited_by_user_id=company_ctx["user_uuid"],
        payload=payload,
    )
    company = db.query(Tenant).filter(Tenant.id == company_ctx["tenant_uuid"]).first()
    company_name = company.name if company else "A Real Estate Company"
    db.commit()

    email_sent = False
    email_error = None
    try:
        from app.services.email_service import send_agency_invitation_email

        send_agency_invitation_email(
            recipient_email=inv.invited_email,
            contact_name=inv.invited_contact_name or payload.contact_name,
            agency_name=inv.invited_agency_name,
            company_name=company_name,
            invitation_token=raw_token,
            existing_agency_detected=existing_detected,
            permissions={"sale": inv.can_sale, "rent": inv.can_rent, "lease": inv.can_lease},
            sharing_scope=inv.proposed_sharing_scope,
            expires_at_iso=inv.expires_at.isoformat(),
        )
        email_sent = True
    except Exception as exc:
        email_error = str(exc)[:300]
        try:
            from app.services.outbox_service import enqueue_outbox_event

            enqueue_outbox_event(
                db,
                channel="email",
                event_type="agency_invitation",
                tenant_id=company_ctx["tenant_uuid"],
                agency_id=inv.existing_agency_id,
                connection_id=conn.id if conn else None,
                recipient_email=inv.invited_email,
                title=f"{company_name} invited {inv.invited_agency_name} to collaborate",
                message=f"Invitation token: {raw_token or 'Sign in to Agency Dashboard'} (expires {inv.expires_at.isoformat()} UTC).",
                idempotency_key=f"agency_invite_email:{inv.id}",
            )
            db.commit()
        except Exception:
            db.rollback()

    return {
        "invitation_id": str(inv.id),
        "status": inv.status,
        "existing_agency_detected": existing_detected,
        "email_sent": email_sent,
        "email_error": email_error,
        "message": (
            "Agency already registered or invited. Independent connection request created for the existing agency."
            if existing_detected
            else "Invitation created with a secure expiring link."
        ),
        "existing_agency_id": str(inv.existing_agency_id) if inv.existing_agency_id else None,
        "connection_id": str(conn.id) if conn else None,
        "invitation_token": raw_token,
        "expires_at": inv.expires_at.isoformat(),
    }


@router.get("/api/v1/company/agencies/invitations")
def company_list_invitations(
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(AgencyInvitation)
        .filter(AgencyInvitation.company_tenant_id == company_ctx["tenant_uuid"])
        .order_by(AgencyInvitation.created_at.desc())
        .all()
    )
    return {
        "items": [
            {
                "id": str(r.id),
                "invited_agency_name": r.invited_agency_name,
                "invited_email": r.invited_email,
                "existing_agency_id": str(r.existing_agency_id) if r.existing_agency_id else None,
                "status": r.status,
                "onboarding_choice": r.onboarding_choice,
                "permissions": {"sale": r.can_sale, "rent": r.can_rent, "lease": r.can_lease},
                "sharing_scope": r.proposed_sharing_scope,
                "expires_at": r.expires_at.isoformat(),
            }
            for r in rows
        ]
    }


@router.get("/api/v1/agency-invitations/preview/{token}")
def preview_invitation(token: str, db: Session = Depends(get_db)):
    now = _utc_now()
    inv = db.query(AgencyInvitation).filter(AgencyInvitation.token_hash == hash_token(token)).first()
    if not inv:
        raise HTTPException(status_code=404, detail="Invitation link is invalid.")
    if inv.expires_at <= now or inv.status == "Expired":
        raise HTTPException(status_code=410, detail="Invitation link has expired.")
    if inv.revoked_at or inv.status in ("Cancelled", "Rejected"):
        raise HTTPException(status_code=409, detail=f"Invitation is {inv.status}.")

    company = db.query(Tenant).filter(Tenant.id == inv.company_tenant_id).first()
    inv.opened_at = inv.opened_at or now
    if inv.status == "Sent":
        inv.status = "Opened"
    db.commit()
    return {
        "invitation_id": str(inv.id),
        "company_name": company.name if company else None,
        "invited_agency_name": inv.invited_agency_name,
        "existing_agency_detected": bool(inv.existing_agency_id),
        "options": [
            {"choice": "paid_tenant", "label": "Full SCuilONE Agency Subscription"},
            {"choice": "free_external", "label": "Free Collaboration Access"},
        ],
        "proposed_permissions": {"sale": inv.can_sale, "rent": inv.can_rent, "lease": inv.can_lease},
        "proposed_sharing_scope": inv.proposed_sharing_scope,
        "proposed_commission_terms": inv.proposed_commission_terms or {},
        "proposed_responsibilities": inv.proposed_responsibilities or {},
        "expires_at": inv.expires_at.isoformat(),
    }


@router.post("/api/v1/agency-invitations/onboard")
def onboard_from_invitation(payload: InvitationOnboardingIn, db: Session = Depends(get_db)):
    result = complete_invitation_onboarding(db, payload)
    tokens = None
    if result.get("member") and result.get("agency") and result["agency"].operating_mode == "free_external":
        tokens = create_free_agency_tokens(db, result["agency"], result["member"])
    db.commit()
    response = {k: v for k, v in result.items() if k not in ("member", "agency")}
    if tokens:
        response["auth"] = tokens
    return response


@router.get("/api/v1/agency/companies/search")
def agency_search_companies(
    q: str | None = Query(default=None),
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    query = db.query(Tenant).filter(
        Tenant.business_type == "real_estate_company",
        Tenant.status.in_(("Active", "Trial")),
    )
    if q:
        query = query.filter(Tenant.name.ilike(f"%{q.strip()}%"))
    companies = query.order_by(Tenant.name.asc()).limit(50).all()
    return {"items": [{"tenant_id": str(c.id), "name": c.name, "industry": c.industry} for c in companies]}


@router.post("/api/v1/agency/connections/request", status_code=201)
def agency_request_company_connection(
    payload: AgencyConnectionRequestIn,
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    conn = create_agency_connection_request(db, agency_ctx, payload)
    db.commit()
    return _serialize_connection(conn, db)


# ==============================================================================
# PHASE 3: CONNECTIONS, AGREEMENT VERSIONS, SIGNING & LIFECYCLE
# ==============================================================================

def _get_company_connection(db: Session, company_tenant_id: UUID, connection_id: UUID) -> CompanyAgencyConnection:
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
    return conn


def _get_agency_connection(db: Session, agency_id: UUID, connection_id: UUID) -> CompanyAgencyConnection:
    conn = (
        db.query(CompanyAgencyConnection)
        .filter(
            CompanyAgencyConnection.id == connection_id,
            CompanyAgencyConnection.agency_id == agency_id,
        )
        .with_for_update()
        .first()
    )
    if not conn:
        raise HTTPException(status_code=404, detail="Connection not found.")
    return conn


@router.get("/api/v1/company/agency-connections")
def company_list_connections(
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    conns = (
        db.query(CompanyAgencyConnection)
        .filter(CompanyAgencyConnection.company_tenant_id == company_ctx["tenant_uuid"])
        .order_by(CompanyAgencyConnection.created_at.desc())
        .all()
    )
    return {"items": [_serialize_connection(c, db) for c in conns]}


@router.get("/api/v1/agency/connections")
def agency_list_connections(
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    conns = (
        db.query(CompanyAgencyConnection)
        .filter(CompanyAgencyConnection.agency_id == agency_ctx["agency_id"])
        .order_by(CompanyAgencyConnection.created_at.desc())
        .all()
    )
    return {"items": [_serialize_connection(c, db) for c in conns]}


@router.get("/api/v1/company/agency-connections/{connection_id}/agreements")
def company_list_agreement_versions(
    connection_id: UUID,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    conn = _get_company_connection(db, company_ctx["tenant_uuid"], connection_id)
    versions = (
        db.query(AgencyAgreementVersion)
        .filter(AgencyAgreementVersion.connection_id == conn.id)
        .order_by(AgencyAgreementVersion.version_number.asc())
        .all()
    )
    return {"items": [_serialize_agreement_version(v) for v in versions]}


@router.get("/api/v1/agency/connections/{connection_id}/agreements")
def agency_list_agreement_versions(
    connection_id: UUID,
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    conn = _get_agency_connection(db, agency_ctx["agency_id"], connection_id)
    versions = (
        db.query(AgencyAgreementVersion)
        .filter(AgencyAgreementVersion.connection_id == conn.id)
        .order_by(AgencyAgreementVersion.version_number.asc())
        .all()
    )
    return {"items": [_serialize_agreement_version(v) for v in versions]}


@router.post("/api/v1/company/agency-connections/{connection_id}/counterpropose", status_code=201)
def company_counterpropose(
    connection_id: UUID,
    payload: AgreementCounterproposalIn,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    conn = _get_company_connection(db, company_ctx["tenant_uuid"], connection_id)
    ver = counterpropose_agreement_version(db, conn, "company", company_ctx["user_uuid"], payload)
    db.commit()
    return _serialize_agreement_version(ver)


@router.post("/api/v1/agency/connections/{connection_id}/counterpropose", status_code=201)
def agency_counterpropose(
    connection_id: UUID,
    payload: AgreementCounterproposalIn,
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    conn = _get_agency_connection(db, agency_ctx["agency_id"], connection_id)
    ver = counterpropose_agreement_version(db, conn, "agency", agency_ctx["actor_id"], payload)
    db.commit()
    return _serialize_agreement_version(ver)


@router.post("/api/v1/company/agency-connections/{connection_id}/sign")
def company_sign_agreement(
    connection_id: UUID,
    payload: AgreementSignIn,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    if not payload.accepted_terms:
        raise HTTPException(status_code=422, detail="Terms must be accepted to sign.")
    conn = _get_company_connection(db, company_ctx["tenant_uuid"], connection_id)
    ver = sign_agreement_version(db, conn, "company", company_ctx["user_uuid"], payload.signature_name)
    db.commit()
    return {"connection": _serialize_connection(conn, db), "agreement_version": _serialize_agreement_version(ver)}


@router.post("/api/v1/agency/connections/{connection_id}/sign")
def agency_sign_agreement(
    connection_id: UUID,
    payload: AgreementSignIn,
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    if not payload.accepted_terms:
        raise HTTPException(status_code=422, detail="Terms must be accepted to sign.")
    conn = _get_agency_connection(db, agency_ctx["agency_id"], connection_id)
    ver = sign_agreement_version(db, conn, "agency", agency_ctx["actor_id"], payload.signature_name)
    db.commit()
    return {"connection": _serialize_connection(conn, db), "agreement_version": _serialize_agreement_version(ver)}


@router.post("/api/v1/company/agency-connections/{connection_id}/activate")
def company_activate_connection(
    connection_id: UUID,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    conn = activate_connection(db, company_ctx["tenant_uuid"], company_ctx["user_uuid"], connection_id)
    db.commit()
    return _serialize_connection(conn, db)


@router.post("/api/v1/company/agency-connections/{connection_id}/suspend")
def company_suspend_connection(
    connection_id: UUID,
    payload: ConnectionStatusActionIn,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    conn = _get_company_connection(db, company_ctx["tenant_uuid"], connection_id)
    transition_connection_status(db, conn, "Suspended", "company", company_ctx["user_uuid"], payload.reason)
    db.commit()
    return _serialize_connection(conn, db)


@router.post("/api/v1/company/agency-connections/{connection_id}/resume")
def company_resume_connection(
    connection_id: UUID,
    payload: ConnectionStatusActionIn,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    conn = _get_company_connection(db, company_ctx["tenant_uuid"], connection_id)
    transition_connection_status(db, conn, "Active", "company", company_ctx["user_uuid"], payload.reason)
    db.commit()
    return _serialize_connection(conn, db)


@router.post("/api/v1/company/agency-connections/{connection_id}/terminate")
def company_terminate_connection(
    connection_id: UUID,
    payload: ConnectionStatusActionIn,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    conn = _get_company_connection(db, company_ctx["tenant_uuid"], connection_id)
    transition_connection_status(
        db,
        conn,
        "Terminated",
        "company",
        company_ctx["user_uuid"],
        payload.reason,
        post_termination_policy=payload.post_termination_policy,
    )
    db.commit()
    return _serialize_connection(conn, db)


@router.post("/api/v1/company/agency-connections/{connection_id}/reject")
def company_reject_connection(
    connection_id: UUID,
    payload: ConnectionStatusActionIn,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    conn = _get_company_connection(db, company_ctx["tenant_uuid"], connection_id)
    transition_connection_status(db, conn, "Rejected", "company", company_ctx["user_uuid"], payload.reason)
    db.commit()
    return _serialize_connection(conn, db)


@router.post("/api/v1/agency/connections/{connection_id}/reject")
def agency_reject_connection(
    connection_id: UUID,
    payload: ConnectionStatusActionIn,
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    conn = _get_agency_connection(db, agency_ctx["agency_id"], connection_id)
    transition_connection_status(db, conn, "Rejected", "agency", agency_ctx["actor_id"], payload.reason)
    db.commit()
    return _serialize_connection(conn, db)


# ==============================================================================
# PHASE 4: CENTRAL SHARED PROPERTY ACCESS & AGENCY NOTIFICATIONS
# ==============================================================================

@router.put("/api/v1/company/agency-connections/{connection_id}/property-access")
def company_update_property_access(
    connection_id: UUID,
    payload: PropertyShareUpdateIn,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    result = update_connection_property_sharing(
        db=db,
        company_tenant_id=company_ctx["tenant_uuid"],
        user_id=company_ctx["user_uuid"],
        connection_id=connection_id,
        payload=payload,
    )
    db.commit()
    return result


@router.get("/api/v1/agency/shared-properties")
def agency_list_shared_properties(
    company_tenant_id: UUID | None = Query(default=None),
    listing_type: str | None = Query(default=None),
    city: str | None = Query(default=None),
    status_filter: str | None = Query(default=None, alias="status"),
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    items = list_agency_authorized_properties(
        db=db,
        agency_id=agency_ctx["agency_id"],
        company_tenant_id=company_tenant_id,
        listing_type=listing_type,
        city=city,
        status_filter=status_filter,
    )
    return {"items": items, "total": len(items)}


@router.get("/api/v1/agency/notifications")
def agency_list_notifications(
    unread_only: bool = Query(default=False),
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    q = db.query(AgencyNotification).filter(AgencyNotification.agency_id == agency_ctx["agency_id"])
    if unread_only:
        q = q.filter(AgencyNotification.is_read.is_(False))
    rows = q.order_by(AgencyNotification.created_at.desc()).limit(100).all()
    return {
        "items": [
            {
                "id": str(n.id),
                "connection_id": str(n.connection_id) if n.connection_id else None,
                "property_id": str(n.property_id) if n.property_id else None,
                "event_type": n.event_type,
                "title": n.title,
                "message": n.message,
                "payload": n.payload or {},
                "is_read": n.is_read,
                "created_at": n.created_at.isoformat() if n.created_at else None,
            }
            for n in rows
        ]
    }


@router.post("/api/v1/agency/notifications/{notification_id}/read")
def agency_mark_notification_read(
    notification_id: UUID,
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    row = (
        db.query(AgencyNotification)
        .filter(AgencyNotification.id == notification_id, AgencyNotification.agency_id == agency_ctx["agency_id"])
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Notification not found.")
    row.is_read = True
    row.read_at = _utc_now()
    db.commit()
    return {"message": "Notification marked as read.", "id": str(row.id)}