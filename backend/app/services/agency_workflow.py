
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.agency import (
    Agency,
    AgencyMember,
    AgencyPropertyAccess,
    CompanyAgencyConnection,
)
from app.models.agency_workflow import (
    AgencyLead,
    AgencyRequirement,
    AgencySaleBookingRequest,
    AgencyShortlist,
)
from app.models.booking import Booking
from app.models.customer_portal_lifecycle import CustomerPropertyServiceRequest, PropertyHandover
from app.models.notification import Notification
from app.models.payment import Payment
from app.models.payment_plan import PaymentPlan, PaymentPlanInstallment
from app.models.property import Property
from app.models.property_offer import PropertyOffer
from app.models.site_visit import SiteVisit
from app.models.site_visit_history import SiteVisitHistory
from app.models.tenant import Tenant
from app.models.user import User
from app.services.agency_collaboration import (
    broadcast_property_availability_change,
    list_agency_authorized_properties,
    notify_agency,
)
from app.services.audit_service import log_audit
from app.services.real_estate_lifecycle import (
    has_conflicting_property_commitment,
    sale_booking_net_verified,
)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _notify_company_users(db: Session, company_tenant_id: UUID, title: str, message: str, module: str, record_id: UUID) -> None:
    users = db.query(User.id).filter(User.tenant_id == company_tenant_id, User.status == "Active").limit(10).all()
    for (uid,) in users:
        db.add(
            Notification(
                tenant_id=company_tenant_id,
                recipient_user_id=uid,
                title=title,
                message=message,
                related_module=module,
                related_record_id=record_id,
            )
        )


def assert_agency_property_authorized(
    db: Session,
    agency_id: UUID,
    connection_id: UUID,
    property_id: UUID,
    *,
    required_transaction_type: str | None = None,
) -> tuple[CompanyAgencyConnection, Property]:
    """Central authorization guard verifying an agency has Active access to a company's central Property."""
    conn = (
        db.query(CompanyAgencyConnection)
        .filter(
            CompanyAgencyConnection.id == connection_id,
            CompanyAgencyConnection.agency_id == agency_id,
        )
        .first()
    )
    if not conn or conn.status != "Active":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Active company-agency connection is required for this property.",
        )

    prop = (
        db.query(Property)
        .filter(Property.id == property_id, Property.tenant_id == conn.company_tenant_id)
        .first()
    )
    if not prop:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Authorized property not found.")

    tx_type = (required_transaction_type or prop.listing_type or "").strip().lower()
    if tx_type == "sale" and not conn.can_sale:
        raise HTTPException(status_code=403, detail="Your connection does not include Sale permission.")
    if tx_type == "rent" and not conn.can_rent:
        raise HTTPException(status_code=403, detail="Your connection does not include Rent permission.")
    if tx_type == "lease" and not conn.can_lease:
        raise HTTPException(status_code=403, detail="Your connection does not include Lease permission.")

    grant = (
        db.query(AgencyPropertyAccess)
        .filter(AgencyPropertyAccess.connection_id == conn.id, AgencyPropertyAccess.property_id == prop.id)
        .first()
    )
    if conn.sharing_scope == "selected_properties":
        if not grant or grant.access_status != "Active":
            raise HTTPException(status_code=403, detail="This property is not shared under your connection.")
    else:
        if grant and grant.access_status == "Revoked":
            raise HTTPException(status_code=403, detail="Access to this property has been revoked by the company.")

    return conn, prop


# ==============================================================================
# PHASE 5: AGENCY & COMPANY DASHBOARDS + TEAM CAP
# ==============================================================================

def add_agency_team_member(db: Session, agency_ctx: dict, payload) -> AgencyMember:
    agency = db.query(Agency).filter(Agency.id == agency_ctx["agency_id"]).with_for_update().first()
    if not agency:
        raise HTTPException(status_code=404, detail="Agency not found.")
    if agency_ctx.get("role") != "agency_owner":
        raise HTTPException(status_code=403, detail="Only agency owners can add team members.")

    active_count = (
        db.query(AgencyMember)
        .filter(AgencyMember.agency_id == agency.id, AgencyMember.status == "Active")
        .count()
    )
    if agency.operating_mode == "free_external" and active_count >= agency.max_free_team_members:
        raise HTTPException(
            status_code=403,
            detail=f"Free external agencies are limited to {agency.max_free_team_members} active team members. Upgrade to a paid subscription for unlimited team management.",
        )

    email = payload.email.strip().lower()
    dup = (
        db.query(AgencyMember)
        .filter(AgencyMember.agency_id == agency.id, func.lower(AgencyMember.email) == email)
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="A member with this email already exists in your agency.")

    member = AgencyMember(
        agency_id=agency.id,
        full_name=payload.full_name.strip(),
        email=email,
        phone=payload.phone,
        password_hash=hash_password(payload.password),
        role=payload.role,
        status="Active",
    )
    db.add(member)
    db.flush()
    return member


def get_agency_dashboard_summary(db: Session, agency_ctx: dict) -> dict:
    agency_id = agency_ctx["agency_id"]
    conns = db.query(CompanyAgencyConnection).filter(CompanyAgencyConnection.agency_id == agency_id).all()
    shared_props = list_agency_authorized_properties(db, agency_id)
    leads_count = db.query(AgencyLead).filter(AgencyLead.agency_id == agency_id).count()
    reqs_count = db.query(AgencyRequirement).filter(AgencyRequirement.agency_id == agency_id, AgencyRequirement.status == "Active").count()
    shortlists_count = db.query(AgencyShortlist).filter(AgencyShortlist.agency_id == agency_id, AgencyShortlist.status != "Removed").count()
    visits_count = db.query(SiteVisit).filter(SiteVisit.source_agency_id == agency_id).count()
    offers_count = db.query(PropertyOffer).filter(PropertyOffer.source_agency_id == agency_id).count()
    booking_reqs_count = db.query(AgencySaleBookingRequest).filter(AgencySaleBookingRequest.source_agency_id == agency_id).count()
    bookings_count = db.query(Booking).filter(Booking.source_agency_id == agency_id).count()
    members_count = db.query(AgencyMember).filter(AgencyMember.agency_id == agency_id, AgencyMember.status == "Active").count()

    return {
        "agency_id": str(agency_id),
        "operating_mode": agency_ctx["operating_mode"],
        "can_manage_independent_crm": agency_ctx["operating_mode"] == "paid_tenant",
        "connections": {
            "total": len(conns),
            "active": sum(1 for c in conns if c.status == "Active"),
            "pending": sum(1 for c in conns if c.status in ("Sent", "Pending", "Counterproposed", "Agreement Pending")),
            "suspended": sum(1 for c in conns if c.status == "Suspended"),
            "terminated": sum(1 for c in conns if c.status == "Terminated"),
        },
        "authorized_inventory_count": len(shared_props),
        "pipeline": {
            "leads": leads_count,
            "active_requirements": reqs_count,
            "shortlists": shortlists_count,
            "site_visits": visits_count,
            "offers": offers_count,
            "sale_booking_requests": booking_reqs_count,
            "confirmed_or_pending_bookings": bookings_count,
        },
        "team_members_active": members_count,
    }


def get_company_dashboard_summary(db: Session, company_tenant_id: UUID) -> dict:
    props = db.query(Property).filter(Property.tenant_id == company_tenant_id).all()
    conns = db.query(CompanyAgencyConnection).filter(CompanyAgencyConnection.company_tenant_id == company_tenant_id).all()
    bookings = db.query(Booking).filter(Booking.tenant_id == company_tenant_id).all()
    pending_visits = (
        db.query(SiteVisit)
        .filter(SiteVisit.tenant_id == company_tenant_id, SiteVisit.company_approval_status == "Pending")
        .count()
    )
    pending_offers = (
        db.query(PropertyOffer)
        .filter(PropertyOffer.tenant_id == company_tenant_id, PropertyOffer.status == "Pending")
        .count()
    )
    pending_agency_reqs = (
        db.query(AgencySaleBookingRequest)
        .filter(AgencySaleBookingRequest.company_tenant_id == company_tenant_id, AgencySaleBookingRequest.status == "Requested")
        .count()
    )
    pending_payments = (
        db.query(Payment)
        .filter(Payment.tenant_id == company_tenant_id, Payment.status == "Under Verification")
        .count()
    )
    open_support = (
        db.query(CustomerPropertyServiceRequest)
        .filter(
            CustomerPropertyServiceRequest.tenant_id == company_tenant_id,
            CustomerPropertyServiceRequest.responsible_entity_type == "company",
            CustomerPropertyServiceRequest.status.in_(("Open", "In Progress")),
        )
        .count()
    )
    return {
        "company_tenant_id": str(company_tenant_id),
        "inventory": {
            "total": len(props),
            "available": sum(1 for p in props if p.status == "Available"),
            "reserved": sum(1 for p in props if p.status == "Reserved"),
            "booked_or_sold": sum(1 for p in props if p.status in ("Booked", "Sold")),
            "rented_or_leased": sum(1 for p in props if p.status in ("Rented", "Leased")),
        },
        "agencies": {
            "active": sum(1 for c in conns if c.status == "Active"),
            "pending": sum(1 for c in conns if c.status in ("Sent", "Pending", "Counterproposed", "Agreement Pending")),
            "suspended": sum(1 for c in conns if c.status == "Suspended"),
            "terminated": sum(1 for c in conns if c.status == "Terminated"),
        },
        "bookings": {
            "total": len(bookings),
            "direct": sum(1 for b in bookings if b.source_agency_id is None),
            "agency_sourced": sum(1 for b in bookings if b.source_agency_id is not None),
        },
        "operations_queue": {
            "pending_site_visit_approvals": pending_visits,
            "pending_offers": pending_offers,
            "pending_agency_booking_requests": pending_agency_reqs,
            "pending_payment_verifications": pending_payments,
            "open_company_support_requests": open_support,
        },
    }


# ==============================================================================
# PHASE 6: PRIVATE AGENCY LEADS, REQUIREMENTS, CROSS-COMPANY MATCHING & SHORTLISTS
# ==============================================================================

def create_agency_lead(db: Session, agency_ctx: dict, payload) -> AgencyLead:
    now = _utc_now()
    lead = AgencyLead(
        agency_id=agency_ctx["agency_id"],
        assigned_actor_id=agency_ctx["actor_id"],
        full_name=payload.full_name.strip(),
        email=payload.email.strip().lower() if payload.email else None,
        phone=payload.phone,
        source=payload.source,
        status="Qualified" if payload.customer_consent_given else "New",
        notes=payload.notes,
        customer_consent_given_at=now if payload.customer_consent_given else None,
    )
    db.add(lead)
    db.flush()
    return lead


def create_agency_requirement(db: Session, agency_ctx: dict, payload) -> AgencyRequirement:
    lead = (
        db.query(AgencyLead)
        .filter(AgencyLead.id == payload.agency_lead_id, AgencyLead.agency_id == agency_ctx["agency_id"])
        .first()
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Agency lead not found.")
    req = AgencyRequirement(
        agency_id=agency_ctx["agency_id"],
        agency_lead_id=lead.id,
        transaction_type=payload.transaction_type,
        property_type=payload.property_type,
        city=payload.city,
        preferred_locality=payload.preferred_locality,
        bedrooms=payload.bedrooms,
        min_budget=payload.min_budget,
        max_budget=payload.max_budget,
        min_area=payload.min_area,
        max_area=payload.max_area,
        preferred_amenities=payload.preferred_amenities,
        lease_duration_months=payload.lease_duration_months,
        lock_in_months=payload.lock_in_months,
        revision_number=1,
        revision_history=[{"revision": 1, "created_at": _utc_now().isoformat(), "transaction_type": payload.transaction_type}],
        notes=payload.notes,
    )
    db.add(req)
    db.flush()
    return req


def match_agency_requirement_across_companies(db: Session, agency_id: UUID, requirement_id: UUID) -> list[dict]:
    req = (
        db.query(AgencyRequirement)
        .filter(AgencyRequirement.id == requirement_id, AgencyRequirement.agency_id == agency_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Agency requirement not found.")

    candidates = list_agency_authorized_properties(
        db=db,
        agency_id=agency_id,
        listing_type=req.transaction_type,
        city=req.city,
        status_filter="Available",
    )
    matched: list[dict] = []
    for item in candidates:
        if req.property_type and (item.get("property_type") or "").lower() != req.property_type.lower():
            continue
        if req.bedrooms is not None and item.get("bedrooms") is not None and int(item["bedrooms"]) != req.bedrooms:
            continue
        price = Decimal(item["price"]) if item.get("price") is not None else None
        if price is not None:
            if req.min_budget is not None and price < req.min_budget:
                continue
            if req.max_budget is not None and price > req.max_budget:
                continue
        matched.append(item)
    return matched


def add_agency_shortlist(db: Session, agency_ctx: dict, payload) -> AgencyShortlist:
    agency_id = agency_ctx["agency_id"]
    req = (
        db.query(AgencyRequirement)
        .filter(AgencyRequirement.id == payload.agency_requirement_id, AgencyRequirement.agency_id == agency_id)
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Agency requirement not found.")
    conn, prop = assert_agency_property_authorized(
        db, agency_id, payload.connection_id, payload.property_id, required_transaction_type=req.transaction_type
    )
    existing = (
        db.query(AgencyShortlist)
        .filter(AgencyShortlist.agency_requirement_id == req.id, AgencyShortlist.property_id == prop.id)
        .first()
    )
    if existing:
        existing.status = "Shortlisted"
        existing.notes = payload.notes
        db.flush()
        return existing

    row = AgencyShortlist(
        agency_id=agency_id,
        agency_lead_id=req.agency_lead_id,
        agency_requirement_id=req.id,
        connection_id=conn.id,
        company_tenant_id=conn.company_tenant_id,
        property_id=prop.id,
        status="Shortlisted",
        notes=payload.notes,
    )
    db.add(row)
    db.flush()
    return row


# ==============================================================================
# PHASE 7: MULTI-PARTY SITE VISITS & COMPANY-CONTROLLED OFFERS
# ==============================================================================

def agency_request_site_visit(db: Session, agency_ctx: dict, payload) -> SiteVisit:
    agency_id = agency_ctx["agency_id"]
    lead = (
        db.query(AgencyLead)
        .filter(AgencyLead.id == payload.agency_lead_id, AgencyLead.agency_id == agency_id)
        .first()
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Agency lead not found.")
    conn, prop = assert_agency_property_authorized(db, agency_id, payload.connection_id, payload.property_id)

    visit = SiteVisit(
        tenant_id=conn.company_tenant_id,
        property_match_id=None,
        property_id=prop.id,
        source_agency_id=agency_id,
        agency_connection_id=conn.id,
        agency_lead_id=lead.id,
        scheduled_start=payload.scheduled_start,
        scheduled_end=payload.scheduled_end,
        status="Scheduled",
        company_approval_status="Pending",
        customer_name=lead.full_name,
        customer_phone=lead.phone,
        buyer_feedback=payload.notes,
    )
    db.add(visit)
    db.flush()
    db.add(
        SiteVisitHistory(
            tenant_id=conn.company_tenant_id,
            site_visit_id=visit.id,
            event_type="agency_visit_requested",
            before_data=None,
            after_data={"status": "Scheduled", "scheduled_start": payload.scheduled_start.isoformat(), "scheduled_end": payload.scheduled_end.isoformat()},
            reason=f"Agency {agency_id} requested site visit for customer {lead.full_name}.",
        )
    )
    _notify_company_users(
        db,
        conn.company_tenant_id,
        f"Site visit request for {prop.name}",
        f"Agency requested a site visit for {lead.full_name} on {payload.scheduled_start.isoformat()}.",
        "site_visits",
        visit.id,
    )
    db.flush()
    return visit


def company_decide_site_visit(db: Session, company_tenant_id: UUID, user_id: UUID, visit_id: UUID, payload) -> SiteVisit:
    visit = (
        db.query(SiteVisit)
        .filter(SiteVisit.id == visit_id, SiteVisit.tenant_id == company_tenant_id)
        .with_for_update()
        .first()
    )
    if not visit:
        raise HTTPException(status_code=404, detail="Site visit not found.")

    old_status = visit.company_approval_status
    if payload.decision == "Approve":
        visit.company_approval_status = "Approved"
        visit.assigned_to = payload.assigned_to or user_id
        visit.visit_instructions = payload.visit_instructions
    elif payload.decision == "Reschedule":
        if not payload.scheduled_start or not payload.scheduled_end:
            raise HTTPException(status_code=422, detail="Provide scheduled_start and scheduled_end to reschedule.")
        visit.company_approval_status = "Rescheduled"
        visit.scheduled_start = payload.scheduled_start
        visit.scheduled_end = payload.scheduled_end
        visit.assigned_to = payload.assigned_to or visit.assigned_to or user_id
        visit.visit_instructions = payload.visit_instructions
    else:
        visit.company_approval_status = "Rejected"
        visit.status = "Cancelled"
        visit.cancellation_reason = payload.reason

    db.add(
        SiteVisitHistory(
            tenant_id=company_tenant_id,
            site_visit_id=visit.id,
            event_type=f"company_visit_{payload.decision.lower()}",
            before_data={"company_approval_status": old_status},
            after_data={"company_approval_status": visit.company_approval_status, "status": visit.status},
            reason=payload.visit_instructions or payload.reason,
            changed_by=user_id,
        )
    )
    if visit.source_agency_id:
        notify_agency(
            db,
            visit.source_agency_id,
            f"site_visit_{payload.decision.lower()}",
            f"Company {payload.decision.lower()}d site visit",
            payload.visit_instructions or payload.reason or f"Site visit status is now {visit.company_approval_status}.",
            connection_id=visit.agency_connection_id,
            property_id=visit.property_id,
        )
    db.flush()
    return visit


def record_site_visit_feedback(
    db: Session, visit: SiteVisit, side: str, actor_id: UUID | None, payload
) -> SiteVisit:
    if side == "agency":
        visit.agency_feedback = payload.feedback
    else:
        visit.company_feedback = payload.feedback
    if payload.interest_level:
        visit.interest_level = payload.interest_level
    if payload.mark_completed:
        visit.status = "Completed"
    db.add(
        SiteVisitHistory(
            tenant_id=visit.tenant_id,
            site_visit_id=visit.id,
            event_type=f"{side}_feedback_recorded",
            before_data=None,
            after_data={"status": visit.status, "side": side, "interest_level": visit.interest_level},
            reason=payload.feedback,
            changed_by=actor_id if side == "company" else None,
        )
    )
    db.flush()
    return visit


def agency_submit_offer(db: Session, agency_ctx: dict, payload) -> PropertyOffer:
    agency_id = agency_ctx["agency_id"]
    lead = (
        db.query(AgencyLead)
        .filter(AgencyLead.id == payload.agency_lead_id, AgencyLead.agency_id == agency_id)
        .first()
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Agency lead not found.")
    conn, prop = assert_agency_property_authorized(db, agency_id, payload.connection_id, payload.property_id)

    now = _utc_now()
    offer = PropertyOffer(
        tenant_id=conn.company_tenant_id,
        property_match_id=None,
        property_id=prop.id,
        source_agency_id=agency_id,
        agency_connection_id=conn.id,
        agency_lead_id=lead.id,
        offered_price=payload.offered_price,
        price_frequency=payload.price_frequency,
        status="Pending",
        offer_type="Buyer",
        submitted_by_side="agency",
        version_number=1,
        customer_name=lead.full_name,
        terms=payload.terms,
        expires_at=now + timedelta(hours=payload.expires_in_hours),
    )
    db.add(offer)
    db.flush()
    _notify_company_users(
        db,
        conn.company_tenant_id,
        f"New customer offer on {prop.name}",
        f"Agency submitted an offer of {payload.offered_price} for {lead.full_name}.",
        "property_offers",
        offer.id,
    )
    return offer


def company_decide_offer(db: Session, company_tenant_id: UUID, user_id: UUID, offer_id: UUID, payload) -> PropertyOffer:
    """Only the property-owning company can Accept, Reject, or Counteroffer (immutable version chain)."""
    offer = (
        db.query(PropertyOffer)
        .filter(PropertyOffer.id == offer_id, PropertyOffer.tenant_id == company_tenant_id)
        .with_for_update()
        .first()
    )
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found.")
    if offer.status != "Pending":
        raise HTTPException(status_code=409, detail=f"Offer cannot be decided from status '{offer.status}'.")

    now = _utc_now()
    offer.responded_by = user_id
    offer.responded_at = now
    offer.response_notes = payload.response_notes

    result_offer = offer
    if payload.decision == "Accept":
        offer.status = "Accepted"
    elif payload.decision == "Reject":
        offer.status = "Rejected"
    else:
        if not payload.counter_price:
            raise HTTPException(status_code=422, detail="counter_price is required for a Counteroffer.")
        offer.status = "Countered"
        counter = PropertyOffer(
            tenant_id=company_tenant_id,
            property_match_id=offer.property_match_id,
            property_id=offer.property_id,
            source_agency_id=offer.source_agency_id,
            agency_connection_id=offer.agency_connection_id,
            agency_lead_id=offer.agency_lead_id,
            parent_offer_id=offer.id,
            offered_price=payload.counter_price,
            price_frequency=offer.price_frequency,
            status="Pending",
            offer_type="Seller",
            submitted_by_side="company",
            version_number=(offer.version_number or 1) + 1,
            customer_name=offer.customer_name,
            terms=payload.response_notes,
            created_by=user_id,
            expires_at=now + timedelta(hours=72),
        )
        db.add(counter)
        db.flush()
        result_offer = counter

    if offer.source_agency_id:
        notify_agency(
            db,
            offer.source_agency_id,
            f"offer_{payload.decision.lower()}",
            f"Company {payload.decision.lower()}ed offer on property",
            payload.response_notes or f"Offer status is now {result_offer.status}.",
            connection_id=offer.agency_connection_id,
            property_id=offer.property_id,
            payload={"offer_id": str(result_offer.id), "price": str(result_offer.offered_price)},
        )
    db.flush()
    return result_offer


# ==============================================================================
# PHASE 8 & 9: AGENCY SALE BOOKING, CENTRAL HOLD, AGREEMENT & FINANCE-ONLY PAYMENT
# ==============================================================================

def agency_submit_sale_booking_request(db: Session, agency_ctx: dict, payload) -> AgencySaleBookingRequest:
    agency_id = agency_ctx["agency_id"]
    lead = (
        db.query(AgencyLead)
        .filter(AgencyLead.id == payload.agency_lead_id, AgencyLead.agency_id == agency_id)
        .first()
    )
    if not lead:
        raise HTTPException(status_code=404, detail="Agency lead not found.")

    conn, prop = assert_agency_property_authorized(
        db, agency_id, payload.connection_id, payload.property_id, required_transaction_type="Sale"
    )
    if prop.status != "Available":
        raise HTTPException(status_code=409, detail=f"Property '{prop.name}' is currently '{prop.status}' and unavailable for booking.")

    now = _utc_now()
    if not lead.customer_consent_given_at:
        lead.customer_consent_given_at = now

    req = AgencySaleBookingRequest(
        company_tenant_id=conn.company_tenant_id,
        property_id=prop.id,
        source_agency_id=agency_id,
        agency_connection_id=conn.id,
        agreement_version_id=conn.active_agreement_version_id,
        agency_lead_id=lead.id,
        agency_requirement_id=payload.agency_requirement_id,
        accepted_offer_id=payload.accepted_offer_id,
        agency_assigned_actor_id=agency_ctx["actor_id"],
        customer_name=lead.full_name,
        customer_email=lead.email,
        customer_phone=lead.phone,
        customer_consent_at=lead.customer_consent_given_at,
        proposed_price=payload.proposed_price,
        booking_amount=payload.booking_amount,
        payment_preference=payload.payment_preference,
        status="Requested",
        agency_notes=payload.agency_notes,
    )
    db.add(req)
    db.flush()
    _notify_company_users(
        db,
        conn.company_tenant_id,
        f"Agency booking request for {prop.name}",
        f"Agency submitted a Sale booking request for {lead.full_name} (Price: {payload.proposed_price}, Token: {payload.booking_amount}).",
        "agency_sale_booking_requests",
        req.id,
    )
    return req


def company_decide_sale_booking_request(
    db: Session, company_tenant_id: UUID, user_id: UUID, request_id: UUID, payload
) -> AgencySaleBookingRequest:
    """Company approves (with row-locked central Property hold + multi-agency broadcast) or rejects."""
    req = (
        db.query(AgencySaleBookingRequest)
        .filter(
            AgencySaleBookingRequest.id == request_id,
            AgencySaleBookingRequest.company_tenant_id == company_tenant_id,
        )
        .with_for_update()
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Agency booking request not found.")
    if req.status != "Requested":
        raise HTTPException(status_code=409, detail=f"Booking request cannot be decided from status '{req.status}'.")

    now = _utc_now()
    req.company_reviewed_by = user_id
    req.company_reviewed_at = now
    req.company_notes = payload.company_notes

    if payload.decision == "Reject":
        req.status = "Rejected"
        req.rejection_reason = payload.rejection_reason
        notify_agency(
            db,
            req.source_agency_id,
            "booking_request_rejected",
            "Sale booking request declined",
            payload.rejection_reason or "The company declined this booking request.",
            connection_id=req.agency_connection_id,
            property_id=req.property_id,
        )
        db.flush()
        return req

    # Lock central Property row first to prevent concurrent multi-agency double-booking!
    prop = (
        db.query(Property)
        .filter(Property.id == req.property_id, Property.tenant_id == company_tenant_id)
        .with_for_update()
        .first()
    )
    if not prop or prop.status != "Available":
        raise HTTPException(
            status_code=409,
            detail=f"Property is no longer available (current status: {prop.status if prop else 'Missing'}).",
        )
    if has_conflicting_property_commitment(db, company_tenant_id, prop.id, now=now):
        raise HTTPException(
            status_code=409,
            detail="Property already has an active hold, booking, or rental commitment.",
        )

    agreed_price = payload.agreed_price or req.proposed_price
    booking_amount = payload.booking_amount or req.booking_amount
    hold_expires_at = now + timedelta(hours=payload.hold_hours)

    booking = Booking(
        tenant_id=company_tenant_id,
        property_id=prop.id,
        accepted_offer_id=req.accepted_offer_id,
        buyer_name=req.customer_name,
        buyer_email=req.customer_email,
        buyer_phone=req.customer_phone,
        payment_preference=req.payment_preference,
        agreed_price=agreed_price,
        booking_amount=booking_amount,
        status="Pending",
        hold_created_at=now,
        hold_expires_at=hold_expires_at,
        booking_date=now,
        created_by=user_id,
        source_agency_id=req.source_agency_id,
        agency_connection_id=req.agency_connection_id,
        agency_agreement_version_id=req.agreement_version_id,
        agency_lead_id=req.agency_lead_id,
        agency_assigned_actor_id=req.agency_assigned_actor_id,
    )
    db.add(booking)
    db.flush()

    prop.status = "Reserved"
    prop.updated_at = now

    req.booking_id = booking.id
    req.status = "Approved"
    req.hold_expires_at = hold_expires_at
    req.payment_instructions = payload.payment_instructions
    if payload.agreement_text:
        req.agreement_text = payload.agreement_text
        req.agreement_version = 1
        req.agreement_status = "Prepared"

    # Broadcast central hold to ALL connected agencies (including competing agencies!)
    broadcast_property_availability_change(
        db=db,
        company_tenant_id=company_tenant_id,
        property_id=prop.id,
        event_type="property_held",
        title=f"Property '{prop.name}' is now Reserved (Hold)",
        message=f"'{prop.name}' was placed on temporary hold until {hold_expires_at.isoformat()} UTC.",
        payload={"booking_id": str(booking.id), "hold_expires_at": hold_expires_at.isoformat()},
        idempotency_prefix=f"hold:{booking.id}",
    )
    log_audit(
        db,
        company_tenant_id,
        user_id,
        "CREATE",
        "bookings",
        booking.id,
        f"Company approved agency booking request {req.id} and placed central hold on property {prop.id}.",
        after_data={"source_agency_id": str(req.source_agency_id), "status": "Pending"},
    )
    db.flush()
    return req


def sign_agency_sale_agreement(db: Session, agency_id: UUID, request_id: UUID, customer_signed_name: str) -> AgencySaleBookingRequest:
    req = (
        db.query(AgencySaleBookingRequest)
        .filter(AgencySaleBookingRequest.id == request_id, AgencySaleBookingRequest.source_agency_id == agency_id)
        .with_for_update()
        .first()
    )
    if not req:
        raise HTTPException(status_code=404, detail="Booking request not found.")
    if req.status != "Approved" or req.agreement_status != "Prepared":
        raise HTTPException(status_code=409, detail="Agreement must be prepared by the company before signing.")
    req.customer_signed_name = customer_signed_name.strip()
    req.customer_signed_at = _utc_now()
    req.agreement_status = "Signed"
    db.flush()
    return req


def submit_agency_payment_evidence(db: Session, agency_id: UUID, request_id: UUID, payload) -> Payment:
    """Agency assists customer by submitting payment evidence -> ALWAYS 'Under Verification'."""
    req = (
        db.query(AgencySaleBookingRequest)
        .filter(AgencySaleBookingRequest.id == request_id, AgencySaleBookingRequest.source_agency_id == agency_id)
        .first()
    )
    if not req or not req.booking_id:
        raise HTTPException(status_code=404, detail="Approved booking not found.")

    dup = (
        db.query(Payment)
        .filter(
            Payment.tenant_id == req.company_tenant_id,
            Payment.booking_id == req.booking_id,
            func.lower(Payment.transaction_reference) == payload.transaction_reference.strip().lower(),
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="Duplicate transaction reference for this booking.")

    payment = Payment(
        tenant_id=req.company_tenant_id,
        booking_id=req.booking_id,
        installment_id=payload.installment_id,
        amount=payload.amount,
        payment_method=payload.payment_method,
        transaction_reference=payload.transaction_reference.strip(),
        status="Under Verification",
        payment_date=_utc_now(),
        notes=payload.notes,
    )
    db.add(payment)
    db.flush()
    _notify_company_users(
        db,
        req.company_tenant_id,
        "Payment evidence submitted via agency",
        f"Payment of {payload.amount} (Ref: {payment.transaction_reference}) awaits company finance verification.",
        "payments",
        payment.id,
    )
    return payment


def company_verify_booking_payment(
    db: Session, company_tenant_id: UUID, user_id: UUID, payment_id: UUID, payload
) -> Payment:
    """Strict company-finance-only payment verification (agencies cannot invoke this)."""
    payment = (
        db.query(Payment)
        .filter(Payment.id == payment_id, Payment.tenant_id == company_tenant_id)
        .with_for_update()
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found.")
    if payment.status not in ("Pending", "Under Verification"):
        raise HTTPException(status_code=409, detail=f"Payment cannot be decided from status '{payment.status}'.")

    now = _utc_now()
    if payload.decision == "Verify":
        payment.status = "Verified"
        payment.verified_by = user_id
        payment.verified_at = now
    else:
        payment.status = "Rejected"
    if payload.notes:
        payment.notes = payload.notes
    db.flush()

    booking = db.query(Booking).filter(Booking.id == payment.booking_id).first()
    if booking and booking.source_agency_id:
        notify_agency(
            db,
            booking.source_agency_id,
            f"payment_{payment.status.lower()}",
            f"Booking payment {payment.status}",
            f"Payment {payment.transaction_reference} ({payment.amount}) was marked {payment.status} by company finance.",
            connection_id=booking.agency_connection_id,
            property_id=booking.property_id,
        )
    return payment


def company_confirm_agency_sale_booking(
    db: Session, company_tenant_id: UUID, user_id: UUID, request_id: UUID
) -> Booking:
    """Confirm Sale booking only after signed agreement + verified booking token payment."""
    req = (
        db.query(AgencySaleBookingRequest)
        .filter(
            AgencySaleBookingRequest.id == request_id,
            AgencySaleBookingRequest.company_tenant_id == company_tenant_id,
        )
        .with_for_update()
        .first()
    )
    if not req or not req.booking_id:
        raise HTTPException(status_code=404, detail="Approved booking request not found.")
    if req.agreement_status != "Signed":
        raise HTTPException(status_code=409, detail="Booking agreement must be signed before confirmation.")

    booking = (
        db.query(Booking)
        .filter(Booking.id == req.booking_id, Booking.tenant_id == company_tenant_id)
        .with_for_update()
        .first()
    )
    if not booking or booking.status != "Pending":
        raise HTTPException(status_code=409, detail="Booking is not in Pending status.")

    net_verified = sale_booking_net_verified(db, company_tenant_id, booking.id)
    if net_verified < Decimal(str(booking.booking_amount)):
        raise HTTPException(
            status_code=409,
            detail=f"Verified payment ({net_verified}) is less than required booking amount ({booking.booking_amount}).",
        )

    prop = (
        db.query(Property)
        .filter(Property.id == booking.property_id, Property.tenant_id == company_tenant_id)
        .with_for_update()
        .first()
    )
    now = _utc_now()
    booking.status = "Confirmed"
    booking.hold_expires_at = None
    req.status = "Confirmed"

    # Auto-create/match Agency-sourced Contact on verified booking confirmation (staff still invites to portal manually)
    from app.models.contact import Contact

    agency = db.query(Agency).filter(Agency.id == req.source_agency_id).first()
    contact = None
    if req.customer_email:
        contact = (
            db.query(Contact)
            .filter(
                Contact.tenant_id == company_tenant_id,
                func.lower(Contact.email) == req.customer_email.strip().lower(),
            )
            .first()
        )
    if not contact:
        contact = Contact(
            tenant_id=company_tenant_id,
            created_by=user_id,
            full_name=req.customer_name,
            email=req.customer_email,
            phone=req.customer_phone,
            source="Agency Collaboration",
            notes=f"Auto-created on verified booking confirmation via agency {agency.display_name if agency else req.source_agency_id}.",
            custom_fields={
                "contact_origin": "agency_sourced",
                "source_agency_id": str(req.source_agency_id),
                "source_agency_name": agency.display_name if agency else None,
                "agency_connection_id": str(req.agency_connection_id),
                "booking_id": str(booking.id),
            },
        )
        db.add(contact)
        db.flush()
    booking._auto_contact_id = contact.id
    if prop:
        prop.status = "Booked"
        prop.updated_at = now
        broadcast_property_availability_change(
            db=db,
            company_tenant_id=company_tenant_id,
            property_id=prop.id,
            event_type="property_booked",
            title=f"Property '{prop.name}' is now Booked",
            message=f"'{prop.name}' has been confirmed as Booked and removed from available inventory.",
            payload={"booking_id": str(booking.id)},
            idempotency_prefix=f"booked:{booking.id}",
        )
    db.flush()
    return booking


def get_agency_booking_payment_summary(db: Session, agency_id: UUID, booking_id: UUID) -> dict:
    booking = (
        db.query(Booking)
        .filter(Booking.id == booking_id, Booking.source_agency_id == agency_id)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Authorized booking not found.")
    payments = db.query(Payment).filter(Payment.booking_id == booking.id, Payment.tenant_id == booking.tenant_id).all()
    net_verified = sale_booking_net_verified(db, booking.tenant_id, booking.id)
    pending_amt = sum((Decimal(str(p.amount)) for p in payments if p.status in ("Pending", "Under Verification")), Decimal("0.00"))
    agreed = Decimal(str(booking.agreed_price or booking.booking_amount))
    return {
        "booking_id": str(booking.id),
        "booking_status": booking.status,
        "agreed_price": str(agreed),
        "booking_amount": str(booking.booking_amount),
        "net_verified_paid": str(net_verified),
        "under_verification_amount": str(pending_amt),
        "outstanding_balance": str(max(Decimal("0.00"), agreed - net_verified)),
        "payments": [
            {
                "id": str(p.id),
                "amount": str(p.amount),
                "status": p.status,
                "payment_method": p.payment_method,
                "transaction_reference": p.transaction_reference,
                "verified_at": p.verified_at.isoformat() if p.verified_at else None,
            }
            for p in payments
        ],
    }


# ==============================================================================
# PHASE 10: ENTITY-AWARE AFTER-SALES SUPPORT ROUTING
# ==============================================================================

def route_after_sales_service_request(
    db: Session,
    company_tenant_id: UUID,
    portal_user_id: UUID | None,
    payload,
) -> CustomerPropertyServiceRequest:
    """Route customer after-sales support to the legally responsible party (never Platform Support)."""
    booking = (
        db.query(Booking)
        .filter(Booking.id == payload.booking_id, Booking.tenant_id == company_tenant_id)
        .first()
    )
    if not booking:
        raise HTTPException(status_code=404, detail="Booking not found.")

    if payload.issue_type == "agency_complaint":
        if not booking.source_agency_id:
            raise HTTPException(status_code=409, detail="This booking has no associated agency.")
        responsible_type = "agency"
        responsible_agency_id = booking.source_agency_id
        agency_assist = True
    else:
        responsible_type = "company"
        responsible_agency_id = None
        agency_assist = bool(booking.source_agency_id)

    req = CustomerPropertyServiceRequest(
        tenant_id=company_tenant_id,
        portal_user_id=portal_user_id,
        booking_id=booking.id,
        property_id=booking.property_id,
        category=payload.issue_type,
        subject=payload.subject.strip(),
        description=payload.description.strip(),
        priority=payload.priority,
        status="Open",
        responsible_entity_type=responsible_type,
        responsible_agency_id=responsible_agency_id,
        source_agency_id=booking.source_agency_id,
        agency_assist_allowed=agency_assist,
    )
    db.add(req)
    db.flush()

    if responsible_type == "agency" and responsible_agency_id:
        notify_agency(
            db,
            responsible_agency_id,
            "agency_support_ticket",
            f"Customer service request: {req.subject}",
            req.description,
            connection_id=booking.agency_connection_id,
            property_id=booking.property_id,
        )
    else:
        _notify_company_users(
            db,
            company_tenant_id,
            f"After-sales support ({req.category}): {req.subject}",
            req.description,
            "customer_property_service_requests",
            req.id,
        )
    return req
