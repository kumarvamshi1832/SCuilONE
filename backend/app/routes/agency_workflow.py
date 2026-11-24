"""API routes for Bundle 2 (Phases 5–10):
- Phase 5: Agency Dashboard, Company Dashboard & Capped Team Management
- Phase 6: Private Agency Leads, Requirements, Cross-Company Matching & Shortlists
- Phase 7: Multi-Party Site Visits & Company-Controlled Offers
- Phase 8 & 9: Agency Sale Booking Requests, Holds, Agreements, Payment Evidence & Company-Finance Verification
- Phase 10: Entity-Aware After-Sales Support Routing
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.core.agency_auth import require_agency_actor, require_real_estate_company
from app.core.dependencies import get_db
from app.models.agency_workflow import AgencyLead, AgencyRequirement, AgencySaleBookingRequest, AgencyShortlist
from app.models.site_visit import SiteVisit
from app.schemas.agency_workflow import (
    AgencyLeadCreateIn,
    AgencyOfferCreateIn,
    AgencyPaymentEvidenceIn,
    AgencyRequirementCreateIn,
    AgencySaleBookingRequestCreateIn,
    AgencyShortlistAddIn,
    AgencySiteVisitRequestIn,
    AgencyTeamMemberCreateIn,
    CompanyOfferDecisionIn,
    CompanyPaymentVerifyIn,
    CompanySaleBookingDecisionIn,
    CompanySiteVisitDecisionIn,
    EntityAwareSupportCreateIn,
    SaleAgreementSignIn,
    SiteVisitFeedbackIn,
)
from app.services.agency_workflow import (
    add_agency_shortlist,
    add_agency_team_member,
    agency_request_site_visit,
    agency_submit_offer,
    agency_submit_sale_booking_request,
    company_confirm_agency_sale_booking,
    company_decide_offer,
    company_decide_sale_booking_request,
    company_decide_site_visit,
    company_verify_booking_payment,
    create_agency_lead,
    create_agency_requirement,
    get_agency_booking_payment_summary,
    get_agency_dashboard_summary,
    get_company_dashboard_summary,
    match_agency_requirement_across_companies,
    record_site_visit_feedback,
    route_after_sales_service_request,
    sign_agency_sale_agreement,
    submit_agency_payment_evidence,
)

router = APIRouter(tags=["Real Estate Collaborative Workflows"])


# --- Phase 5: Dashboards & Team ---

@router.get("/api/v1/agency-dashboard/summary")
def agency_dashboard(agency_ctx: dict = Depends(require_agency_actor), db: Session = Depends(get_db)):
    return get_agency_dashboard_summary(db, agency_ctx)


@router.get("/api/v1/company-dashboard/summary")
def company_dashboard(company_ctx: dict = Depends(require_real_estate_company), db: Session = Depends(get_db)):
    return get_company_dashboard_summary(db, company_ctx["tenant_uuid"])


@router.post("/api/v1/agency/team-members", status_code=201)
def create_agency_member(
    payload: AgencyTeamMemberCreateIn,
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    member = add_agency_team_member(db, agency_ctx, payload)
    db.commit()
    return {"id": str(member.id), "full_name": member.full_name, "email": member.email, "role": member.role, "status": member.status}


# --- Phase 6: Leads, Requirements, Matching & Shortlists ---

@router.post("/api/v1/agency/leads", status_code=201)
def post_agency_lead(payload: AgencyLeadCreateIn, agency_ctx: dict = Depends(require_agency_actor), db: Session = Depends(get_db)):
    lead = create_agency_lead(db, agency_ctx, payload)
    db.commit()
    return {"id": str(lead.id), "full_name": lead.full_name, "status": lead.status}


@router.get("/api/v1/agency/leads")
def list_agency_leads(agency_ctx: dict = Depends(require_agency_actor), db: Session = Depends(get_db)):
    rows = db.query(AgencyLead).filter(AgencyLead.agency_id == agency_ctx["agency_id"]).order_by(AgencyLead.created_at.desc()).all()
    return {"items": [{"id": str(r.id), "full_name": r.full_name, "email": r.email, "phone": r.phone, "status": r.status} for r in rows]}


@router.post("/api/v1/agency/requirements", status_code=201)
def post_agency_requirement(payload: AgencyRequirementCreateIn, agency_ctx: dict = Depends(require_agency_actor), db: Session = Depends(get_db)):
    req = create_agency_requirement(db, agency_ctx, payload)
    db.commit()
    return {"id": str(req.id), "transaction_type": req.transaction_type, "revision_number": req.revision_number}


@router.get("/api/v1/agency/requirements/{requirement_id}/matches")
def get_cross_company_matches(requirement_id: UUID, agency_ctx: dict = Depends(require_agency_actor), db: Session = Depends(get_db)):
    items = match_agency_requirement_across_companies(db, agency_ctx["agency_id"], requirement_id)
    return {"items": items, "total": len(items)}


@router.post("/api/v1/agency/shortlists", status_code=201)
def post_agency_shortlist(payload: AgencyShortlistAddIn, agency_ctx: dict = Depends(require_agency_actor), db: Session = Depends(get_db)):
    row = add_agency_shortlist(db, agency_ctx, payload)
    db.commit()
    return {"id": str(row.id), "property_id": str(row.property_id), "status": row.status}


# --- Phase 7: Multi-Party Site Visits & Company-Controlled Offers ---

@router.post("/api/v1/agency/site-visits/request", status_code=201)
def post_agency_site_visit(payload: AgencySiteVisitRequestIn, agency_ctx: dict = Depends(require_agency_actor), db: Session = Depends(get_db)):
    visit = agency_request_site_visit(db, agency_ctx, payload)
    db.commit()
    return {"id": str(visit.id), "company_approval_status": visit.company_approval_status, "status": visit.status}


@router.post("/api/v1/company/site-visits/{visit_id}/decision")
def post_company_site_visit_decision(
    visit_id: UUID,
    payload: CompanySiteVisitDecisionIn,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    visit = company_decide_site_visit(db, company_ctx["tenant_uuid"], company_ctx["user_uuid"], visit_id, payload)
    db.commit()
    return {"id": str(visit.id), "company_approval_status": visit.company_approval_status, "status": visit.status}


@router.post("/api/v1/agency/site-visits/{visit_id}/feedback")
def post_agency_visit_feedback(
    visit_id: UUID,
    payload: SiteVisitFeedbackIn,
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    visit = db.query(SiteVisit).filter(SiteVisit.id == visit_id, SiteVisit.source_agency_id == agency_ctx["agency_id"]).first()
    if not visit:
        raise HTTPException(status_code=404, detail="Site visit not found.")
    record_site_visit_feedback(db, visit, "agency", agency_ctx["actor_id"], payload)
    db.commit()
    return {"id": str(visit.id), "status": visit.status, "agency_feedback": visit.agency_feedback}


@router.post("/api/v1/company/site-visits/{visit_id}/feedback")
def post_company_visit_feedback(
    visit_id: UUID,
    payload: SiteVisitFeedbackIn,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    visit = db.query(SiteVisit).filter(SiteVisit.id == visit_id, SiteVisit.tenant_id == company_ctx["tenant_uuid"]).first()
    if not visit:
        raise HTTPException(status_code=404, detail="Site visit not found.")
    record_site_visit_feedback(db, visit, "company", company_ctx["user_uuid"], payload)
    db.commit()
    return {"id": str(visit.id), "status": visit.status, "company_feedback": visit.company_feedback}


@router.post("/api/v1/agency/offers", status_code=201)
def post_agency_offer(payload: AgencyOfferCreateIn, agency_ctx: dict = Depends(require_agency_actor), db: Session = Depends(get_db)):
    offer = agency_submit_offer(db, agency_ctx, payload)
    db.commit()
    return {"id": str(offer.id), "offered_price": str(offer.offered_price), "status": offer.status, "version_number": offer.version_number}


@router.post("/api/v1/company/offers/{offer_id}/decision")
def post_company_offer_decision(
    offer_id: UUID,
    payload: CompanyOfferDecisionIn,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    offer = company_decide_offer(db, company_ctx["tenant_uuid"], company_ctx["user_uuid"], offer_id, payload)
    db.commit()
    return {"id": str(offer.id), "offered_price": str(offer.offered_price), "status": offer.status, "offer_type": offer.offer_type, "version_number": offer.version_number}


# --- Phase 8 & 9: Agency Sale Booking Requests, Agreements & Finance-Only Payment Verification ---

@router.post("/api/v1/agency/sale-booking-requests", status_code=201)
def post_agency_sale_booking_request(
    payload: AgencySaleBookingRequestCreateIn,
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    req = agency_submit_sale_booking_request(db, agency_ctx, payload)
    db.commit()
    return {"id": str(req.id), "status": req.status, "property_id": str(req.property_id)}


@router.post("/api/v1/company/agency-booking-requests/{request_id}/decision")
def post_company_sale_booking_decision(
    request_id: UUID,
    payload: CompanySaleBookingDecisionIn,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    req = company_decide_sale_booking_request(db, company_ctx["tenant_uuid"], company_ctx["user_uuid"], request_id, payload)
    db.commit()
    return {
        "id": str(req.id),
        "status": req.status,
        "booking_id": str(req.booking_id) if req.booking_id else None,
        "hold_expires_at": req.hold_expires_at.isoformat() if req.hold_expires_at else None,
        "agreement_status": req.agreement_status,
    }


@router.post("/api/v1/agency/sale-booking-requests/{request_id}/sign-agreement")
def post_agency_sign_sale_agreement(
    request_id: UUID,
    payload: SaleAgreementSignIn,
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    req = sign_agency_sale_agreement(db, agency_ctx["agency_id"], request_id, payload.customer_signed_name)
    db.commit()
    return {"id": str(req.id), "agreement_status": req.agreement_status, "customer_signed_name": req.customer_signed_name}


@router.post("/api/v1/agency/sale-booking-requests/{request_id}/payment-evidence", status_code=201)
def post_agency_payment_evidence(
    request_id: UUID,
    payload: AgencyPaymentEvidenceIn,
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    payment = submit_agency_payment_evidence(db, agency_ctx["agency_id"], request_id, payload)
    db.commit()
    return {"payment_id": str(payment.id), "status": payment.status, "amount": str(payment.amount)}


@router.post("/api/v1/company/payments/{payment_id}/verify")
def post_company_verify_payment(
    payment_id: UUID,
    payload: CompanyPaymentVerifyIn,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    payment = company_verify_booking_payment(db, company_ctx["tenant_uuid"], company_ctx["user_uuid"], payment_id, payload)
    db.commit()
    return {"payment_id": str(payment.id), "status": payment.status}


@router.post("/api/v1/company/agency-booking-requests/{request_id}/confirm")
def post_company_confirm_sale_booking(
    request_id: UUID,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    booking = company_confirm_agency_sale_booking(db, company_ctx["tenant_uuid"], company_ctx["user_uuid"], request_id)
    db.commit()
    auto_cid = getattr(booking, "_auto_contact_id", None)
    return {"booking_id": str(booking.id), "status": booking.status, "contact_id": str(auto_cid) if auto_cid else None}


@router.get("/api/v1/agency/bookings/{booking_id}/payment-summary")
def get_agency_booking_payments(
    booking_id: UUID,
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    return get_agency_booking_payment_summary(db, agency_ctx["agency_id"], booking_id)


# --- Phase 10: Entity-Aware After-Sales Support Routing ---

@router.post("/api/v1/company/after-sales/support-requests", status_code=201)
def post_routed_support_request(
    payload: EntityAwareSupportCreateIn,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    req = route_after_sales_service_request(db, company_ctx["tenant_uuid"], None, payload)
    db.commit()
    return {
        "id": str(req.id),
        "category": req.category,
        "responsible_entity_type": req.responsible_entity_type,
        "responsible_agency_id": str(req.responsible_agency_id) if req.responsible_agency_id else None,
        "agency_assist_allowed": req.agency_assist_allowed,
        "status": req.status,
    }
