from datetime import datetime, timedelta
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, Field, model_validator
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from pathlib import Path
import io
import cloudinary.uploader
from sqlalchemy import or_, func
from sqlalchemy.orm import Session
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.models.customer_booking_journey import CustomerBookingRequest, CustomerSiteVisitFeedback, CustomerPortalJourneyFile
from app.models.site_visit import SiteVisit
from app.models.property_match import PropertyMatch
from app.models.property import Property
from app.models.buyer_requirement import BuyerRequirement
from app.models.customer_portal import CustomerPortalUser
from app.models.booking import Booking, BookingNominee
from app.models.payment import Payment
from app.models.payment_plan import PaymentPlan, PaymentPlanInstallment
from app.models.payment_refund import PaymentRefund
from app.models.contact import Contact
from app.models.account import Account
from app.models.user import User
from app.models.lead import Lead
from app.services.audit_service import log_audit
from app.services.payment_allocation import IN_FLIGHT_STATUSES, installment_position
from app.routes.customer_portal import require_portal_user, get_db, _notify_staff_user, staff_context
from app.services.customer_portal_notifications import notify_customer
from app.schemas.booking import CustomerBookingDetailsUpdate

router = APIRouter(tags=["Customer Portal - Real Estate Booking Journey"])

class VisitFeedbackIn(BaseModel):
    rating: int | None = Field(default=None, ge=1, le=5)
    feedback: str | None = Field(default=None, max_length=5000)
    decision: str = Field(pattern="^(Interested|Maybe|Not Interested)$")

class BookingRequestIn(BaseModel):
    payment_preference: str = Field(default="Full Payment", pattern="^(Full Payment|Installments)$")
    notes: str | None = Field(default=None, max_length=3000)

class BookingDecisionIn(BaseModel):
    decision: str = Field(pattern="^(Approve|Reject)$")
    agreed_price: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    booking_amount: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    payment_preference: str = Field(default="Full Payment", pattern="^(Full Payment|Installments)$")
    notes: str | None = Field(default=None, max_length=3000)
    customer_message: str | None = Field(default=None, max_length=2000)

class HoldExtensionIn(BaseModel):
    hours: int = Field(default=24, ge=1, le=48)
    reason: str = Field(min_length=5, max_length=1000)

class PaymentInstructionsIn(BaseModel):
    instructions: str = Field(min_length=10, max_length=10000)

class AgreementPrepareIn(BaseModel):
    agreement_text: str = Field(min_length=30, max_length=30000)

class AgreementAcknowledgeIn(BaseModel):
    full_name: str = Field(min_length=2, max_length=200)
    confirm: bool

class AgreementVerifyIn(BaseModel):
    verified: bool
    signed_file_id: UUID | None = None
    notes: str | None = Field(default=None, max_length=2000)

class PaymentSubmitIn(BaseModel):
    installment_id: UUID | None = None
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    payment_method: str = Field(pattern="^(Cash|Bank Transfer|UPI|Cheque|Demand Draft|Card|Other)$")
    transaction_reference: str | None = Field(default=None, max_length=255)
    payment_date: datetime | None = None
    notes: str | None = Field(default=None, max_length=3000)

    @model_validator(mode="after")
    def require_reference_for_traceable_modes(self):
        if self.payment_method in ("UPI", "Bank Transfer", "Cheque", "Demand Draft", "Card") and not (self.transaction_reference or "").strip():
            raise ValueError("Transaction/reference number is required for this payment mode.")
        return self


def _now():
    return datetime.utcnow()


def _customer_request(db: Session, portal: dict, request_id: UUID, lock=False):
    q = db.query(CustomerBookingRequest).filter(
        CustomerBookingRequest.id == request_id,
        CustomerBookingRequest.tenant_id == portal["tenant_id"],
        CustomerBookingRequest.portal_user_id == portal["portal_user_id"],
    )
    if lock:
        q = q.with_for_update()
    row = q.first()
    if not row:
        raise HTTPException(404, "Booking request not found.")
    return row


def _expire_if_needed(db: Session, row: CustomerBookingRequest):
    if row.status == "Approved" and row.hold_expires_at and row.hold_expires_at <= _now():
        if row.booking_id:
            booking = db.query(Booking).filter(Booking.id == row.booking_id, Booking.tenant_id == row.tenant_id, Booking.status == "Pending").with_for_update().first()
            if booking:
                verified = db.query(Payment).filter(Payment.tenant_id == row.tenant_id, Payment.booking_id == booking.id, Payment.status == "Verified").all()
                verified_total = sum((Decimal(str(p.amount)) for p in verified), Decimal("0.00"))
                verified_ids = [p.id for p in verified]
                refunds = db.query(PaymentRefund).filter(PaymentRefund.tenant_id == row.tenant_id, PaymentRefund.booking_id == booking.id, PaymentRefund.payment_id.in_(verified_ids) if verified_ids else PaymentRefund.payment_id == None, PaymentRefund.status == "Processed").all()
                net_verified = verified_total - sum((Decimal(str(r.amount)) for r in refunds), Decimal("0.00"))
                if net_verified > 0:
                    row.status = "Expired - Payment Review"
                    row.hold_expires_at = None
                    match = db.query(PropertyMatch).filter(PropertyMatch.id == row.property_match_id, PropertyMatch.tenant_id == row.tenant_id).first()
                    _notify_staff_user(db, row.tenant_id, match.assigned_to if match else None, "Expired booking hold requires payment review", "The customer hold expired but verified funds remain. Review the booking and refund/reinstatement before releasing the property.", "customer_booking_requests", row.id)
                    log_audit(db, row.tenant_id, None, "AUTO_EXPIRE", "customer_booking_requests", row.id, "Booking hold expired with verified funds remaining; property reservation retained for staff review.", before_data={"status": "Approved"}, after_data={"status": row.status})
                    db.flush()
                    return
                booking.status = "Cancelled"
                booking.cancellation_reason = "Customer booking hold expired before final confirmation."
                prop = db.query(Property).filter(Property.id == booking.property_id, Property.tenant_id == row.tenant_id).with_for_update().first()
                if prop and prop.status == "Reserved":
                    prop.status = "Available"
                active_plan = db.query(PaymentPlan).filter(PaymentPlan.tenant_id == row.tenant_id, PaymentPlan.booking_id == booking.id, PaymentPlan.status == "Active").with_for_update().first()
                if active_plan:
                    active_plan.status = "Cancelled"
                pending_payments = db.query(Payment).filter(Payment.tenant_id == row.tenant_id, Payment.booking_id == booking.id, Payment.status.in_(IN_FLIGHT_STATUSES)).with_for_update().all()
                for payment in pending_payments:
                    payment.status = "Rejected"
                    payment.notes = ((payment.notes or "") + "\nAutomatically rejected because the booking hold expired without verified funds.").strip()
        row.status = "Expired"
        row.hold_expires_at = None
        log_audit(db, row.tenant_id, None, "AUTO_EXPIRE", "customer_booking_requests", row.id, "Customer booking request hold expired and the unverified reservation was released.", before_data={"status": "Approved"}, after_data={"status": "Expired"})
        db.flush()


def _request_payload(row: CustomerBookingRequest):
    return {
        "id": str(row.id), "status": row.status, "property_id": str(row.property_id),
        "site_visit_id": str(row.site_visit_id), "booking_id": str(row.booking_id) if row.booking_id else None,
        "hold_expires_at": row.hold_expires_at, "extension_count": row.extension_count,
        "agreed_price": str(row.agreed_price) if row.agreed_price is not None else None,
        "booking_amount": str(row.booking_amount) if row.booking_amount is not None else None,
        "payment_preference": row.payment_preference, "payment_instructions": row.payment_instructions, "agreement_status": row.agreement_status,
        "agreement_version": row.agreement_version, "agreement_text": row.agreement_text,
        "agreement_acknowledged_at": row.agreement_acknowledged_at,
        "final_confirmed_at": row.final_confirmed_at, "final_confirmed_by": row.final_confirmed_by, "customer_notes": row.customer_notes, "customer_message": row.customer_message,
        "created_at": row.created_at, "updated_at": row.updated_at,
    }


@router.post("/api/v1/customer-portal/site-visits/{site_visit_id}/feedback", status_code=201)
def submit_visit_feedback(site_visit_id: UUID, payload: VisitFeedbackIn, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    visit = db.query(SiteVisit).join(PropertyMatch, PropertyMatch.id == SiteVisit.property_match_id).join(BuyerRequirement, BuyerRequirement.id == PropertyMatch.buyer_requirement_id).filter(
        SiteVisit.id == site_visit_id, SiteVisit.tenant_id == portal["tenant_id"], PropertyMatch.tenant_id == portal["tenant_id"], BuyerRequirement.tenant_id == portal["tenant_id"], BuyerRequirement.contact_id == portal["contact_id"]
    ).with_for_update().first()
    if not visit:
        raise HTTPException(404, "Site visit not found for your portal account.")
    if visit.status != "Completed":
        raise HTTPException(409, "Feedback can be submitted only after the staff marks the visit Completed.")
    row = db.query(CustomerSiteVisitFeedback).filter(CustomerSiteVisitFeedback.tenant_id == portal["tenant_id"], CustomerSiteVisitFeedback.site_visit_id == visit.id).with_for_update().first()
    if row is None:
        row = CustomerSiteVisitFeedback(tenant_id=portal["tenant_id"], portal_user_id=portal["portal_user_id"], site_visit_id=visit.id)
        db.add(row)
    elif row.portal_user_id != portal["portal_user_id"]:
        raise HTTPException(409, "Feedback already belongs to another portal user.")
    row.rating, row.feedback, row.decision, row.updated_at = payload.rating, payload.feedback, payload.decision, _now()
    match = db.query(PropertyMatch).filter(PropertyMatch.id == visit.property_match_id, PropertyMatch.tenant_id == portal["tenant_id"]).first()
    _notify_staff_user(db, portal["tenant_id"], match.assigned_to if match else None, "Customer submitted site-visit feedback", f"A customer submitted feedback with decision {row.decision} for site visit {visit.id}.", "customer_site_visit_feedback", row.id)
    log_audit(db, portal["tenant_id"], None, "UPDATE", "customer_site_visit_feedback", row.id, f"Customer submitted site visit feedback with decision {row.decision}.")
    db.commit()
    return {"message": "Your site-visit feedback has been saved.", "decision": row.decision, "rating": row.rating}


@router.post("/api/v1/customer-portal/site-visits/{site_visit_id}/booking-requests", status_code=201)
def request_booking(site_visit_id: UUID, payload: BookingRequestIn, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    visit = db.query(SiteVisit).join(PropertyMatch, PropertyMatch.id == SiteVisit.property_match_id).join(BuyerRequirement, BuyerRequirement.id == PropertyMatch.buyer_requirement_id).filter(
        SiteVisit.id == site_visit_id, SiteVisit.tenant_id == portal["tenant_id"], PropertyMatch.tenant_id == portal["tenant_id"], BuyerRequirement.tenant_id == portal["tenant_id"], BuyerRequirement.contact_id == portal["contact_id"]
    ).with_for_update().first()
    if not visit or visit.status != "Completed":
        raise HTTPException(409, "A completed site visit linked to your requirement is required before requesting a booking.")
    feedback = db.query(CustomerSiteVisitFeedback).filter(CustomerSiteVisitFeedback.tenant_id == portal["tenant_id"], CustomerSiteVisitFeedback.portal_user_id == portal["portal_user_id"], CustomerSiteVisitFeedback.site_visit_id == visit.id).first()
    if not feedback or feedback.decision != "Interested":
        raise HTTPException(409, "Submit feedback with decision Interested before requesting a booking.")
    existing = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.tenant_id == portal["tenant_id"], CustomerBookingRequest.portal_user_id == portal["portal_user_id"], CustomerBookingRequest.site_visit_id == visit.id).first()
    if existing:
        _expire_if_needed(db, existing)
        if existing.status in ("Expired", "Rejected", "Cancelled"):
            existing.status = "Requested"
            existing.booking_id = None
            existing.hold_expires_at = None
            existing.extension_count = 0
            existing.agreed_price = None
            existing.booking_amount = None
            existing.agreement_text = None
            existing.agreement_status = "Not Prepared"
            existing.agreement_customer_name = None
            existing.agreement_acknowledged_at = None
            existing.agreement_verified_by = None
            existing.agreement_verified_at = None
            existing.final_confirmed_at = None
            existing.payment_preference = payload.payment_preference
            existing.payment_instructions = None
            existing.customer_notes = payload.notes
            existing.customer_message = None
            existing.staff_notes = None
        db.commit()
        return _request_payload(existing)
    match = db.query(PropertyMatch).filter(PropertyMatch.id == visit.property_match_id, PropertyMatch.tenant_id == portal["tenant_id"]).first()
    prop = db.query(Property).filter(Property.id == match.property_id, Property.tenant_id == portal["tenant_id"]).with_for_update().first()
    if not prop or prop.status != "Available" or prop.listing_type != "Sale":
        raise HTTPException(409, "This property is no longer available for sale.")
    active = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.tenant_id == portal["tenant_id"], CustomerBookingRequest.property_id == prop.id, CustomerBookingRequest.status == "Approved", CustomerBookingRequest.hold_expires_at > _now()).with_for_update().first()
    if active:
        raise HTTPException(409, "This property is temporarily held for another customer.")
    row = CustomerBookingRequest(tenant_id=portal["tenant_id"], portal_user_id=portal["portal_user_id"], buyer_requirement_id=match.buyer_requirement_id, property_match_id=match.id, property_id=prop.id, site_visit_id=visit.id, status="Requested", payment_preference=payload.payment_preference, customer_notes=payload.notes)
    db.add(row)
    requirement = db.query(BuyerRequirement).filter(BuyerRequirement.id == match.buyer_requirement_id, BuyerRequirement.tenant_id == portal["tenant_id"]).first()
    recipient_id = match.assigned_to or (requirement.assigned_to if requirement else None)
    _notify_staff_user(db, portal["tenant_id"], recipient_id, "Customer requested booking", f"A customer requested booking for {prop.name}. Review the request.", "customer_booking_requests", row.id)
    log_audit(db, portal["tenant_id"], None, "CREATE", "customer_booking_requests", row.id, "Customer submitted a booking request after completing a site visit.")
    db.commit(); db.refresh(row)
    return _request_payload(row)


@router.get("/api/v1/customer-portal/booking-requests")
def list_customer_booking_requests(portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    rows = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.tenant_id == portal["tenant_id"], CustomerBookingRequest.portal_user_id == portal["portal_user_id"]).order_by(CustomerBookingRequest.created_at.desc()).all()
    for row in rows: _expire_if_needed(db, row)
    db.commit()
    return [_request_payload(r) for r in rows]


@router.get("/api/v1/customer-portal/booking-requests/{request_id}")
def get_customer_booking_request(request_id: UUID, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    row = _customer_request(db, portal, request_id); _expire_if_needed(db, row); db.commit()
    data = _request_payload(row)
    files = db.query(CustomerPortalJourneyFile).filter(CustomerPortalJourneyFile.tenant_id == row.tenant_id, CustomerPortalJourneyFile.booking_request_id == row.id).order_by(CustomerPortalJourneyFile.uploaded_at.desc()).all()
    data["files"] = [{"id": str(f.id), "purpose": f.purpose, "filename": f.filename, "content_type": f.content_type, "file_size": f.file_size, "file_url": f.file_url, "payment_id": str(f.payment_id) if f.payment_id else None, "agreement_version": f.agreement_version, "uploaded_at": f.uploaded_at} for f in files]
    if row.booking_id:
        booking = db.query(Booking).filter(Booking.id == row.booking_id, Booking.tenant_id == row.tenant_id).first()
        if booking:
            data["booking"] = {"id": str(booking.id), "status": booking.status, "buyer_name": booking.buyer_name, "buyer_email": booking.buyer_email, "buyer_phone": booking.buyer_phone, "buyer_address": booking.buyer_address, "buyer_details_submitted_at": booking.buyer_details_submitted_at, "nominees": [{"id": str(n.id), "nominee_name": n.nominee_name, "relationship": n.relationship, "phone": n.phone, "email": n.email, "date_of_birth": n.date_of_birth, "address": n.address, "allocation_percentage": str(n.allocation_percentage) if n.allocation_percentage is not None else None, "remarks": n.remarks} for n in db.query(BookingNominee).filter(BookingNominee.tenant_id == row.tenant_id, BookingNominee.booking_id == booking.id).order_by(BookingNominee.created_at).all()], "booking_amount": str(booking.booking_amount), "agreed_price": str(booking.agreed_price)}
            payments = db.query(Payment).filter(Payment.booking_id == booking.id, Payment.tenant_id == row.tenant_id).order_by(Payment.created_at.desc()).all()
            data["payments"] = [{"id": str(p.id), "installment_id": str(p.installment_id) if p.installment_id else None, "amount": str(p.amount), "method": p.payment_method, "reference": p.transaction_reference, "status": p.status, "payment_date": p.payment_date, "verified_at": p.verified_at} for p in payments]
    return data


@router.get("/api/v1/customer-booking-workflow/requests", dependencies=[Depends(require_permission("booking.view"))])
def staff_list_customer_booking_requests(current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, _ = staff_context(current_user)
    rows = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.tenant_id == tenant_id).order_by(CustomerBookingRequest.created_at.asc()).all()
    for row in rows: _expire_if_needed(db, row)
    db.commit()
    return [_request_payload(r) for r in rows]


@router.get("/api/v1/customer-booking-workflow/requests/{request_id}", dependencies=[Depends(require_permission("booking.view"))])
def staff_get_customer_booking_request(request_id: UUID, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, _ = staff_context(current_user)
    row = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == request_id, CustomerBookingRequest.tenant_id == tenant_id).first()
    if not row:
        raise HTTPException(404, "Customer booking request not found.")
    data = _request_payload(row)
    data["staff_notes"] = row.staff_notes
    files = db.query(CustomerPortalJourneyFile).filter(CustomerPortalJourneyFile.tenant_id == tenant_id, CustomerPortalJourneyFile.booking_request_id == row.id).order_by(CustomerPortalJourneyFile.uploaded_at.desc()).all()
    data["files"] = [{"id": str(f.id), "purpose": f.purpose, "filename": f.filename, "file_url": f.file_url, "content_type": f.content_type, "file_size": f.file_size, "payment_id": str(f.payment_id) if f.payment_id else None, "agreement_version": f.agreement_version, "uploaded_at": f.uploaded_at} for f in files]
    if row.booking_id:
        booking = db.query(Booking).filter(Booking.id == row.booking_id, Booking.tenant_id == tenant_id).first()
        if booking:
            data["booking"] = {"id": str(booking.id), "status": booking.status, "buyer_name": booking.buyer_name, "buyer_email": booking.buyer_email, "buyer_phone": booking.buyer_phone, "buyer_address": booking.buyer_address, "buyer_details_submitted_at": booking.buyer_details_submitted_at, "booking_amount": str(booking.booking_amount), "agreed_price": str(booking.agreed_price), "nominees": [{"id": str(n.id), "nominee_name": n.nominee_name, "relationship": n.relationship, "phone": n.phone, "email": n.email, "date_of_birth": n.date_of_birth, "address": n.address, "allocation_percentage": str(n.allocation_percentage) if n.allocation_percentage is not None else None, "remarks": n.remarks} for n in db.query(BookingNominee).filter(BookingNominee.tenant_id == tenant_id, BookingNominee.booking_id == booking.id).all()]}
        payments = db.query(Payment).filter(Payment.tenant_id == tenant_id, Payment.booking_id == row.booking_id).order_by(Payment.created_at.desc()).all()
        data["payments"] = [{"id": str(p.id), "installment_id": str(p.installment_id) if p.installment_id else None, "amount": str(p.amount), "status": p.status, "payment_method": p.payment_method, "transaction_reference": p.transaction_reference, "payment_date": p.payment_date, "verified_at": p.verified_at} for p in payments]
    return data


@router.post("/api/v1/customer-booking-workflow/requests/{request_id}/decision", dependencies=[Depends(require_permission("booking.create"))])
def staff_decide_booking_request(request_id: UUID, payload: BookingDecisionIn, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = staff_context(current_user)
    row = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == request_id, CustomerBookingRequest.tenant_id == tenant_id).with_for_update().first()
    if not row: raise HTTPException(404, "Customer booking request not found.")
    _expire_if_needed(db, row)
    if row.status != "Requested": raise HTTPException(409, f"Request cannot be decided from status {row.status}.")
    if payload.decision == "Reject":
        row.status, row.staff_notes, row.customer_message = "Rejected", payload.notes, payload.customer_message
        notify_customer(db, tenant_id, row.portal_user_id, "Booking request declined",
                        payload.customer_message or "Your booking request was declined by the sales team.",
                        "booking_request", "customer_booking_requests", row.id)
        log_audit(db, tenant_id, user_id, "UPDATE", "customer_booking_requests", row.id, "Customer booking request rejected.")
        db.commit(); return _request_payload(row)
    if payload.agreed_price is None or payload.booking_amount is None or payload.booking_amount > payload.agreed_price:
        raise HTTPException(422, "Provide agreed_price and booking_amount; booking amount cannot exceed agreed price.")
    prop = db.query(Property).filter(Property.id == row.property_id, Property.tenant_id == tenant_id).with_for_update().first()
    if not prop or prop.status != "Available": raise HTTPException(409, "Property is no longer available.")
    active_booking = db.query(Booking).filter(Booking.tenant_id == tenant_id, Booking.property_id == prop.id, Booking.status.in_(["Pending", "Confirmed"])).first()
    active_hold = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.tenant_id == tenant_id, CustomerBookingRequest.property_id == prop.id, CustomerBookingRequest.id != row.id, CustomerBookingRequest.status == "Approved", CustomerBookingRequest.hold_expires_at > _now()).first()
    if active_booking or active_hold: raise HTTPException(409, "Property already has an active booking or hold.")
    portal_user = db.query(CustomerPortalUser).filter(CustomerPortalUser.id == row.portal_user_id, CustomerPortalUser.tenant_id == tenant_id).first()
    contact = db.query(Contact).filter(Contact.id == portal_user.contact_id, Contact.tenant_id == tenant_id).first() if portal_user else None
    account = db.query(Account).filter(Account.id == portal_user.account_id, Account.tenant_id == tenant_id).first() if portal_user else None
    requirement = db.query(BuyerRequirement).filter(BuyerRequirement.id == row.buyer_requirement_id, BuyerRequirement.tenant_id == tenant_id, BuyerRequirement.contact_id == (portal_user.contact_id if portal_user else None)).first()
    if not requirement:
        raise HTTPException(409, "The linked buyer requirement is no longer valid for this customer.")
    if requirement.lead_id and not db.query(Lead.id).filter(Lead.id == requirement.lead_id, Lead.tenant_id == tenant_id).first():
        raise HTTPException(409, "The buyer requirement's linked lead is not in this tenant.")
    property_before = {"id": str(prop.id), "status": prop.status}
    booking = Booking(tenant_id=tenant_id, property_id=prop.id, lead_id=requirement.lead_id, buyer_requirement_id=row.buyer_requirement_id, buyer_name=contact.full_name if contact else (account.name if account else "Customer"), buyer_email=portal_user.email if portal_user else None, buyer_phone=contact.phone if contact else None, payment_preference=payload.payment_preference, installment_request_notes=payload.notes, booking_amount=payload.booking_amount, agreed_price=payload.agreed_price, status="Pending", created_by=user_id)
    db.add(booking); db.flush()
    prop.status = "Reserved"
    prop.updated_at = _now()
    row.booking_id, row.status, row.agreed_price, row.booking_amount = booking.id, "Approved", payload.agreed_price, payload.booking_amount
    row.payment_preference, row.hold_expires_at, row.staff_notes, row.customer_message = payload.payment_preference, _now() + timedelta(hours=48), payload.notes, payload.customer_message
    notify_customer(db, tenant_id, row.portal_user_id, "Booking request approved",
                    row.customer_message or f"Your booking request was approved. Booking amount: {payload.booking_amount:,.2f}. Please complete your buyer and nominee details, review the agreement, and submit payment details in your Customer Portal. Payment is subject to staff verification.",
                    "booking_request", "bookings", booking.id)
    log_audit(db, tenant_id, user_id, "CREATE", "bookings", booking.id, "Booking created from approved customer portal request.")
    log_audit(db, tenant_id, user_id, "UPDATE", "properties", prop.id, f"Property reserved for booking {booking.id}.", before_data=property_before, after_data={"id": str(prop.id), "status": prop.status})
    db.commit(); db.refresh(row)
    return _request_payload(row)


@router.post("/api/v1/customer-booking-workflow/requests/{request_id}/extend-hold", dependencies=[Depends(require_permission("booking.update"))])
def staff_extend_booking_hold(request_id: UUID, payload: HoldExtensionIn, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = staff_context(current_user)
    row = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == request_id, CustomerBookingRequest.tenant_id == tenant_id).with_for_update().first()
    if not row: raise HTTPException(404, "Customer booking request not found.")
    _expire_if_needed(db, row)
    if row.status != "Approved" or not row.hold_expires_at: raise HTTPException(409, "Only an active approved booking hold can be extended.")
    if row.extension_count >= 2: raise HTTPException(409, "The maximum of two staff-authorized hold extensions has been reached.")
    row.hold_expires_at = max(row.hold_expires_at, _now()) + timedelta(hours=payload.hours)
    row.extension_count += 1
    row.staff_notes = ((row.staff_notes or "") + f"\nHold extension {row.extension_count}: {payload.reason}").strip()
    log_audit(db, tenant_id, user_id, "UPDATE", "customer_booking_requests", row.id, f"Booking hold extended by {payload.hours} hours. Reason: {payload.reason}")
    db.commit(); return _request_payload(row)


@router.put("/api/v1/customer-booking-workflow/requests/{request_id}/payment-instructions", dependencies=[Depends(require_permission("booking.update"))])
def staff_set_payment_instructions(request_id: UUID, payload: PaymentInstructionsIn, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = staff_context(current_user)
    row = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == request_id, CustomerBookingRequest.tenant_id == tenant_id).with_for_update().first()
    if not row:
        raise HTTPException(404, "Customer booking request not found.")
    if row.status not in ("Approved", "Confirmed"):
        raise HTTPException(409, "Payment instructions can be set only for an approved or confirmed booking.")
    row.payment_instructions = payload.instructions.strip()
    notify_customer(db, tenant_id, row.portal_user_id, "Payment instructions updated",
                    "Your booking payment instructions are available in the Customer Portal.",
                    "payment_instructions", "customer_booking_requests", row.id)
    log_audit(db, tenant_id, user_id, "UPDATE", "customer_booking_requests", row.id, "Customer payment instructions updated.")
    db.commit()
    return {"message": "Payment instructions saved.", "payment_instructions": row.payment_instructions}


@router.post("/api/v1/customer-booking-workflow/requests/{request_id}/agreement", dependencies=[Depends(require_permission("booking.update"))])
def staff_prepare_agreement(request_id: UUID, payload: AgreementPrepareIn, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = staff_context(current_user)
    row = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == request_id, CustomerBookingRequest.tenant_id == tenant_id).with_for_update().first()
    if not row: raise HTTPException(404, "Customer booking request not found.")
    if row.status != "Approved" or not row.booking_id: raise HTTPException(409, "Approve the booking request first.")
    row.agreement_text, row.agreement_version, row.agreement_status = payload.agreement_text, row.agreement_version + 1, "Prepared"
    row.agreement_customer_name, row.agreement_acknowledged_at, row.agreement_verified_by, row.agreement_verified_at = None, None, None, None
    notify_customer(db, tenant_id, row.portal_user_id, "Booking agreement ready",
                    "Your booking agreement is ready for review and acknowledgement.",
                    "agreement", "customer_booking_requests", row.id)
    log_audit(db, tenant_id, user_id, "UPDATE", "customer_booking_requests", row.id, f"Agreement version {row.agreement_version} prepared for customer review.")
    db.commit(); return _request_payload(row)


@router.post("/api/v1/customer-portal/booking-requests/{request_id}/agreement/acknowledge")
def customer_acknowledge_agreement(request_id: UUID, payload: AgreementAcknowledgeIn, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    row = _customer_request(db, portal, request_id, lock=True)
    if row.status != "Approved" or row.agreement_status != "Prepared": raise HTTPException(409, "There is no prepared agreement available to acknowledge.")
    if payload.confirm is not True: raise HTTPException(422, "You must confirm the agreement acknowledgement.")
    contact = db.query(Contact).filter(Contact.id == portal["contact_id"], Contact.tenant_id == portal["tenant_id"]).first()
    if not contact or (contact.full_name or "").strip().casefold() != payload.full_name.strip().casefold():
        raise HTTPException(422, "The acknowledgement name must match the full name on your customer portal contact.")
    row.agreement_customer_name, row.agreement_acknowledged_at, row.agreement_status = payload.full_name.strip(), _now(), "Customer Acknowledged"
    match = db.query(PropertyMatch).filter(PropertyMatch.id == row.property_match_id, PropertyMatch.tenant_id == row.tenant_id).first()
    _notify_staff_user(db, row.tenant_id, match.assigned_to if match else None, "Customer acknowledged agreement", "The customer acknowledged the prepared agreement and uploaded/signed copy may now be reviewed.", "customer_booking_requests", row.id)
    log_audit(db, row.tenant_id, None, "UPDATE", "customer_booking_requests", row.id, "Customer acknowledged agreement text; this is not a legally certified e-signature.")
    db.commit(); return {"agreement_status": row.agreement_status, "acknowledged_at": row.agreement_acknowledged_at, "message": "Acknowledgement recorded. Provide the physically/digitally signed agreement to staff for verification; this portal acknowledgement is not an e-signature."}


@router.post("/api/v1/customer-booking-workflow/requests/{request_id}/agreement/verify", dependencies=[Depends(require_permission("booking.update"))])
def staff_verify_agreement(request_id: UUID, payload: AgreementVerifyIn, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = staff_context(current_user)
    row = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == request_id, CustomerBookingRequest.tenant_id == tenant_id).with_for_update().first()
    if not row: raise HTTPException(404, "Customer booking request not found.")
    if row.agreement_status != "Customer Acknowledged": raise HTTPException(409, "Customer must acknowledge the current agreement version first.")
    if payload.verified:
        if not payload.signed_file_id:
            raise HTTPException(422, "Upload the signed agreement through the customer portal and provide signed_file_id.")
        signed_file = db.query(CustomerPortalJourneyFile).filter(CustomerPortalJourneyFile.id == payload.signed_file_id, CustomerPortalJourneyFile.tenant_id == tenant_id, CustomerPortalJourneyFile.portal_user_id == row.portal_user_id, CustomerPortalJourneyFile.booking_request_id == row.id, CustomerPortalJourneyFile.purpose == "Signed Agreement").first()
        if not signed_file or signed_file.agreement_version != row.agreement_version:
            raise HTTPException(404, "A signed agreement upload for the current agreement version was not found.")
        row.agreement_status, row.agreement_verified_by, row.agreement_verified_at = "Verified", user_id, _now()
    else:
        row.agreement_status, row.agreement_verified_by, row.agreement_verified_at = "Rejected", None, None
    row.staff_notes = ((row.staff_notes or "") + ("\n" + payload.notes if payload.notes else "")).strip()
    notify_customer(db, tenant_id, row.portal_user_id,
                    "Booking agreement verified" if payload.verified else "Booking agreement needs changes",
                    "Your signed agreement was verified by staff." if payload.verified else (payload.notes or "Please contact the sales team about your agreement."),
                    "agreement", "customer_booking_requests", row.id)
    log_audit(db, tenant_id, user_id, "UPDATE", "customer_booking_requests", row.id, f"Agreement verification decision: {row.agreement_status}.")
    db.commit(); return _request_payload(row)


@router.put("/api/v1/customer-portal/booking-requests/{request_id}/buyer-details")
def customer_update_booking_buyer_details(request_id: UUID, payload: CustomerBookingDetailsUpdate, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    row = _customer_request(db, portal, request_id, lock=True)
    if row.status != "Approved" or not row.booking_id:
        raise HTTPException(409, "Buyer details can be submitted only after staff approves the booking request and before final confirmation.")
    _expire_if_needed(db, row)
    if row.status != "Approved" or (row.hold_expires_at and row.hold_expires_at <= _now()):
        raise HTTPException(409, "The booking hold has expired. Contact staff before updating buyer details.")
    booking = db.query(Booking).filter(Booking.id == row.booking_id, Booking.tenant_id == row.tenant_id).with_for_update().first()
    if not booking or booking.status != "Pending":
        raise HTTPException(409, "The booking is no longer accepting customer details.")
    existing_submitted_payments = db.query(Payment.id).filter(
        Payment.tenant_id == row.tenant_id,
        Payment.booking_id == booking.id,
        Payment.status.in_(("Verified", *IN_FLIGHT_STATUSES)),
    ).first()
    if existing_submitted_payments:
        raise HTTPException(409, "Buyer and nominee details are locked after a payment has been submitted. Contact staff if a correction is required.")
    booking.buyer_name = payload.buyer_name.strip()
    booking.buyer_phone = payload.buyer_phone.strip()
    booking.buyer_email = str(payload.buyer_email) if payload.buyer_email else None
    booking.buyer_address = payload.buyer_address.strip() if payload.buyer_address else None
    booking.buyer_details_submitted_at = _now()
    db.query(BookingNominee).filter(BookingNominee.tenant_id == row.tenant_id, BookingNominee.booking_id == booking.id).delete(synchronize_session=False)
    for nominee in payload.nominees:
        db.add(BookingNominee(tenant_id=row.tenant_id, booking_id=booking.id, nominee_name=nominee.nominee_name.strip(), relationship=nominee.relationship.strip(), phone=nominee.phone.strip() if nominee.phone else None, email=str(nominee.email) if nominee.email else None, date_of_birth=nominee.date_of_birth, address=nominee.address.strip() if nominee.address else None, allocation_percentage=nominee.allocation_percentage, remarks=nominee.remarks.strip() if nominee.remarks else None))
    match = db.query(PropertyMatch).filter(PropertyMatch.id == row.property_match_id, PropertyMatch.tenant_id == row.tenant_id).first()
    _notify_staff_user(db, row.tenant_id, match.assigned_to if match else None, "Customer completed booking details", f"Buyer and nominee details were submitted for booking {booking.id}.", "bookings", booking.id)
    log_audit(db, row.tenant_id, None, "UPDATE", "bookings", booking.id, "Customer submitted or updated buyer and nominee details.")
    db.commit()
    return {"booking_id": str(booking.id), "buyer_name": booking.buyer_name, "buyer_phone": booking.buyer_phone, "buyer_email": booking.buyer_email, "nominee_count": len(payload.nominees), "message": "Buyer and nominee details submitted successfully."}


@router.post("/api/v1/customer-portal/booking-requests/{request_id}/payments", status_code=201)
def customer_submit_booking_payment(request_id: UUID, payload: PaymentSubmitIn, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    row = _customer_request(db, portal, request_id, lock=True)
    if row.status not in ("Approved", "Confirmed") or not row.booking_id:
        raise HTTPException(409, "An approved or confirmed booking is required before submitting payment details.")
    booking = db.query(Booking).filter(Booking.id == row.booking_id, Booking.tenant_id == row.tenant_id).with_for_update().first()
    if not booking or booking.status not in ("Pending", "Confirmed"):
        raise HTTPException(409, "This booking is not accepting payments.")
    if row.status == "Approved" and booking.status != "Pending":
        raise HTTPException(409, "Booking request and booking status are inconsistent. Contact staff.")
    if row.status == "Confirmed" and booking.status != "Confirmed":
        raise HTTPException(409, "Booking request and booking status are inconsistent. Contact staff.")
    if row.status == "Approved" and not booking.buyer_details_submitted_at:
        raise HTTPException(409, "Complete and submit buyer and nominee details before submitting the booking payment.")
    if row.status == "Approved" and row.hold_expires_at and row.hold_expires_at <= _now():
        raise HTTPException(409, "The booking hold has expired. Contact staff before submitting payment.")
    payment_cap = Decimal(str(booking.booking_amount if row.status == "Approved" else booking.agreed_price))
    if payload.amount > payment_cap: raise HTTPException(422, f"Payment amount cannot exceed the current payable limit of {payment_cap:.2f}.")
    active_plan = db.query(PaymentPlan).filter(PaymentPlan.tenant_id == row.tenant_id, PaymentPlan.booking_id == booking.id, PaymentPlan.status == "Active").first()
    installment = None
    if row.status == "Confirmed" and booking.payment_preference == "Installments" and not active_plan:
        raise HTTPException(409, "The staff team must create the installment schedule before you can submit an installment payment.")
    if active_plan and row.status == "Confirmed" and payload.installment_id is None:
        raise HTTPException(422, "Select the instalment this payment is for because this booking has an active payment plan.")
    if payload.installment_id and row.status != "Confirmed":
        raise HTTPException(409, "Installment payments are available after the booking is finally confirmed.")
    if payload.installment_id:
        installment = db.query(PaymentPlanInstallment).join(PaymentPlan, PaymentPlan.id == PaymentPlanInstallment.payment_plan_id).filter(PaymentPlanInstallment.id == payload.installment_id, PaymentPlanInstallment.tenant_id == row.tenant_id, PaymentPlan.booking_id == booking.id, PaymentPlan.status == "Active").first()
        if not installment:
            raise HTTPException(404, "Active payment-plan instalment not found for this booking.")
        booking_payments = db.query(Payment).filter(Payment.tenant_id == row.tenant_id, Payment.booking_id == booking.id).all()
        booking_refunds = db.query(PaymentRefund).filter(PaymentRefund.tenant_id == row.tenant_id, PaymentRefund.booking_id == booking.id, PaymentRefund.status == "Processed").all()
        position = installment_position(installment, booking_payments, booking_refunds)
        if payload.amount > position["payable"]:
            raise HTTPException(409, f"Payment exceeds this instalment's remaining balance of {position['payable']:.2f}.")
    existing_payments = db.query(Payment).filter(Payment.tenant_id == row.tenant_id,
        Payment.booking_id == booking.id, Payment.status.in_(("Verified", *IN_FLIGHT_STATUSES))).all()
    pending_total = sum((Decimal(str(p.amount)) for p in existing_payments if p.status in IN_FLIGHT_STATUSES), Decimal("0.00"))
    verified_gross = sum((Decimal(str(p.amount)) for p in existing_payments if p.status == "Verified"), Decimal("0.00"))
    processed_refunds = db.query(PaymentRefund).filter(PaymentRefund.tenant_id == row.tenant_id,
        PaymentRefund.booking_id == booking.id, PaymentRefund.status == "Processed").all()
    refunded_total = sum((Decimal(str(r.amount)) for r in processed_refunds), Decimal("0.00"))
    net_verified = max(Decimal("0.00"), verified_gross - refunded_total)
    outstanding_after_pending = max(Decimal("0.00"), payment_cap - net_verified - pending_total)
    if payload.amount > outstanding_after_pending:
        raise HTTPException(409, f"This payment exceeds the remaining balance after pending payments. Available balance: {outstanding_after_pending:.2f}.")
    if payload.transaction_reference and payload.transaction_reference.strip():
        duplicate_reference = db.query(Payment.id).filter(Payment.tenant_id == row.tenant_id, func.lower(Payment.transaction_reference) == payload.transaction_reference.strip().lower()).first()
        if duplicate_reference:
            raise HTTPException(409, "This transaction reference has already been submitted for another payment.")
    payment = Payment(tenant_id=row.tenant_id, booking_id=booking.id, installment_id=installment.id if installment else None, amount=payload.amount, payment_method=payload.payment_method, transaction_reference=payload.transaction_reference.strip() if payload.transaction_reference else None, status="Pending", payment_date=payload.payment_date or _now(), notes=payload.notes, created_by=None)
    db.add(payment); db.flush()
    match = db.query(PropertyMatch).filter(PropertyMatch.id == row.property_match_id, PropertyMatch.tenant_id == row.tenant_id).first()
    _notify_staff_user(db, row.tenant_id, match.assigned_to if match else None, "Customer submitted payment", f"Payment {payment.id} was submitted for booking {booking.id} and requires finance verification.", "payments", payment.id)
    log_audit(db, row.tenant_id, None, "CREATE", "payments", payment.id, "Customer submitted payment details; awaiting staff verification.")
    db.commit(); db.refresh(payment)
    return {"id": str(payment.id), "booking_id": str(booking.id), "amount": str(payment.amount), "status": payment.status, "message": "Payment details submitted. The finance team must verify the payment."}


@router.post("/api/v1/customer-portal/booking-requests/{request_id}/files", status_code=201)
async def customer_upload_booking_file(request_id: UUID, file: UploadFile = File(...), purpose: str = Form(..., pattern="^(Signed Agreement|Payment Proof)$"), payment_id: UUID | None = Form(None), portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    row = _customer_request(db, portal, request_id)
    if row.status not in ("Approved", "Confirmed"):
        raise HTTPException(409, "Files can be uploaded only for an approved or confirmed booking request.")
    if row.status == "Approved" and row.hold_expires_at and row.hold_expires_at <= _now():
        raise HTTPException(409, "The booking hold has expired. Contact staff before uploading booking files.")
    if purpose == "Signed Agreement" and row.agreement_status not in ("Prepared", "Customer Acknowledged"):
        raise HTTPException(409, "A prepared agreement is required before uploading the signed copy.")
    if purpose == "Payment Proof":
        payment = db.query(Payment).filter(Payment.id == payment_id, Payment.booking_id == row.booking_id, Payment.tenant_id == row.tenant_id).first() if payment_id else None
        if not payment:
            raise HTTPException(404, "Payment not found for this booking. Submit payment details first.")
        if payment.status not in IN_FLIGHT_STATUSES:
            raise HTTPException(409, "Proof can be attached only to a payment awaiting verification.")
    filename = Path(file.filename or "").name
    if not filename or Path(filename).suffix.lower() not in {".pdf", ".jpg", ".jpeg", ".png"}:
        raise HTTPException(400, "Only PDF, JPG, JPEG and PNG files are accepted.")
    content = await file.read(5 * 1024 * 1024 + 1)
    if not content or len(content) > 5 * 1024 * 1024:
        raise HTTPException(413, "File must be non-empty and 5 MB or smaller.")
    extension = Path(filename).suffix.lower()
    if extension == ".pdf" and not content.startswith(b"%PDF-"):
        raise HTTPException(400, "Invalid PDF file.")
    if extension in (".jpg", ".jpeg") and not content.startswith(b"\xff\xd8\xff"):
        raise HTTPException(400, "Invalid JPEG image.")
    if extension == ".png" and not content.startswith(b"\x89PNG\r\n\x1a\n"):
        raise HTTPException(400, "Invalid PNG image.")
    content_type = "application/pdf" if extension == ".pdf" else ("image/jpeg" if extension in (".jpg", ".jpeg") else "image/png")
    from app.services.subscription_service import enforce_plan_storage_limit
    enforce_plan_storage_limit(db, row.tenant_id, additional_bytes=len(content))
    public_id = f"scuilone/customer-portal/{row.tenant_id}/{UUID(str(row.portal_user_id)).hex}/{UUID(str(row.id)).hex}/{__import__('uuid').uuid4().hex}"
    resource_type = "image" if extension in (".jpg", ".jpeg", ".png") else "raw"
    returned_public_id = None
    try:
        result = cloudinary.uploader.upload(io.BytesIO(content), resource_type=resource_type, type="authenticated", public_id=public_id, overwrite=False, use_filename=False, unique_filename=False)
        returned_public_id = result.get("public_id")
        if not result.get("secure_url") or not result.get("public_id"):
            raise RuntimeError("Cloudinary did not return file metadata")
        journey_file = CustomerPortalJourneyFile(tenant_id=row.tenant_id, portal_user_id=row.portal_user_id, booking_request_id=row.id, payment_id=payment_id if purpose == "Payment Proof" else None, purpose=purpose, agreement_version=row.agreement_version if purpose == "Signed Agreement" else None, filename=filename, content_type=content_type, file_size=len(content), storage_public_id=result["public_id"], file_url=result["secure_url"])
        db.add(journey_file); db.flush()
        match = db.query(PropertyMatch).filter(PropertyMatch.id == row.property_match_id, PropertyMatch.tenant_id == row.tenant_id).first()
        _notify_staff_user(db, row.tenant_id, match.assigned_to if match else None, f"Customer uploaded {purpose.lower()}", f"A customer uploaded {filename} for booking request {row.id}.", "customer_portal_journey_files", journey_file.id)
        log_audit(db, row.tenant_id, None, "CREATE", "customer_portal_journey_files", journey_file.id, f"Customer uploaded {purpose} file.")
        db.commit(); db.refresh(journey_file)
        return {"id": str(journey_file.id), "purpose": journey_file.purpose, "filename": journey_file.filename, "file_url": journey_file.file_url, "message": "File uploaded securely."}
    except HTTPException:
        db.rollback(); raise
    except Exception as exc:
        db.rollback()
        if returned_public_id:
            try:
                cloudinary.uploader.destroy(returned_public_id, resource_type=resource_type, type="authenticated", invalidate=True)
            except Exception:
                pass
        raise HTTPException(502, "File upload failed. Please retry or contact support.") from exc


def _net_verified(db: Session, tenant_id, booking: Booking) -> Decimal:
    verified_payments = db.query(Payment).filter(Payment.tenant_id == tenant_id, Payment.booking_id == booking.id, Payment.status == "Verified").all()
    paid_gross = sum((Decimal(str(p.amount)) for p in verified_payments), Decimal("0.00"))
    payment_ids = [p.id for p in verified_payments]
    processed_refunds = db.query(PaymentRefund).filter(PaymentRefund.tenant_id == tenant_id, PaymentRefund.booking_id == booking.id, PaymentRefund.payment_id.in_(payment_ids) if payment_ids else PaymentRefund.payment_id == None, PaymentRefund.status == "Processed").all()
    refunded = sum((Decimal(str(r.amount)) for r in processed_refunds), Decimal("0.00"))
    return max(Decimal("0.00"), paid_gross - refunded)


def _confirmation_checks(db: Session, tenant_id, row: CustomerBookingRequest, booking: Booking | None) -> tuple[list[dict], Decimal]:
    """The single definition of what must be true before a portal booking can be finally confirmed.

    Used by the staff action, the customer action and the customer's readiness view, so all three always agree.
    Order matters: the first unmet check is the one reported.  Returns (checks, net verified payments).
    """
    paid = _net_verified(db, tenant_id, booking) if booking else Decimal("0.00")
    needed = Decimal(str(booking.booking_amount)) if booking else Decimal("0.00")
    checks = [
        {"key": "approved", "label": "Booking request approved by staff", "met": row.status == "Approved" and bool(row.booking_id),
         "message": "An approved active booking is required."},
        {"key": "hold", "label": "Booking hold is active", "met": not (row.hold_expires_at and row.hold_expires_at <= _now()),
         "message": "The booking hold expired. Extend or reapprove it before confirmation."},
        {"key": "agreement", "label": "Signed agreement verified by staff", "met": row.agreement_status == "Verified" and bool(row.agreement_verified_at),
         "message": "The agreement must be verified before final confirmation."},
        {"key": "booking_pending", "label": "Booking is awaiting confirmation", "met": bool(booking and booking.status == "Pending"),
         "message": "Booking must be Pending to be final-confirmed."},
        {"key": "buyer_details", "label": "Buyer and nominee details submitted", "met": bool(booking and booking.buyer_details_submitted_at),
         "message": "Customer buyer and nominee details must be submitted before final booking confirmation."},
        {"key": "booking_amount", "label": "Booking amount paid and verified by finance", "met": bool(booking) and paid >= needed,
         "message": f"Verified net booking payment is insufficient. Required {booking.booking_amount if booking else '0.00'}; net verified {paid}."},
    ]
    return checks, paid


def _confirm_booking(db: Session, tenant_id, row: CustomerBookingRequest, booking: Booking, paid: Decimal, *, actor: str, user_id=None):
    """Applies the confirmation.  Callers must have locked `row` and `booking` and passed every check."""
    booking.status = "Confirmed"; row.status = "Confirmed"; row.final_confirmed_at = _now(); row.final_confirmed_by = actor; row.hold_expires_at = None
    notify_customer(db, tenant_id, row.portal_user_id, "Booking confirmed",
                    "Your booking is confirmed. You can continue to pay the remaining balance from your Customer Portal.",
                    "booking_confirmed", "bookings", booking.id)
    if actor == "Customer":
        match = db.query(PropertyMatch).filter(PropertyMatch.id == row.property_match_id, PropertyMatch.tenant_id == tenant_id).first()
        _notify_staff_user(db, tenant_id, match.assigned_to if match else None, "Customer confirmed booking",
                           f"The customer confirmed booking {booking.id} in the Customer Portal after all requirements were verified.", "bookings", booking.id)
    log_audit(db, tenant_id, user_id, "UPDATE", "bookings", booking.id,
              f"Booking final-confirmed by the {actor.lower()} after verified agreement and booking amount payment.")
    return {"booking_id": str(booking.id), "booking_status": booking.status, "request_status": row.status,
            "final_confirmed_at": row.final_confirmed_at, "final_confirmed_by": actor, "verified_paid": str(paid)}


def _first_unmet(checks: list[dict]):
    for check in checks:
        if not check["met"]:
            raise HTTPException(409, check["message"])


@router.post("/api/v1/customer-booking-workflow/requests/{request_id}/final-confirm", dependencies=[Depends(require_permission("booking.update"))])
def staff_final_confirm_booking(request_id: UUID, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = staff_context(current_user)
    row = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == request_id, CustomerBookingRequest.tenant_id == tenant_id).with_for_update().first()
    if not row: raise HTTPException(404, "Customer booking request not found.")
    booking = db.query(Booking).filter(Booking.id == row.booking_id, Booking.tenant_id == tenant_id).with_for_update().first() if row.booking_id else None
    checks, paid = _confirmation_checks(db, tenant_id, row, booking)
    _first_unmet(checks)
    result = _confirm_booking(db, tenant_id, row, booking, paid, actor="Staff", user_id=user_id)
    db.commit(); return result


@router.get("/api/v1/customer-portal/booking-requests/{request_id}/confirmation-status")
def customer_confirmation_status(request_id: UUID, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    """What is still missing before the customer can confirm.  Read-only; the confirm endpoint re-checks everything."""
    row = _customer_request(db, portal, request_id)
    _expire_if_needed(db, row)
    booking = db.query(Booking).filter(Booking.id == row.booking_id, Booking.tenant_id == row.tenant_id).first() if row.booking_id else None
    if row.status == "Confirmed":
        db.commit()
        return {"can_confirm": False, "already_confirmed": True, "confirmed_by": row.final_confirmed_by, "final_confirmed_at": row.final_confirmed_at, "checks": []}
    checks, paid = _confirmation_checks(db, row.tenant_id, row, booking)
    db.commit()
    return {"can_confirm": all(c["met"] for c in checks), "already_confirmed": False, "booking_amount": str(booking.booking_amount) if booking else None,
            "verified_paid": str(paid), "checks": [{"key": c["key"], "label": c["label"], "met": c["met"], "message": None if c["met"] else c["message"]} for c in checks]}


@router.post("/api/v1/customer-portal/booking-requests/{request_id}/confirm")
def customer_confirm_booking(request_id: UUID, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    """Customer's final confirmation.  It does not bypass anything: staff must already have approved the request,
    verified the signed agreement and (via finance) verified the booking amount; the customer must have submitted
    their buyer details.  Only the request's own portal user can confirm it."""
    row = _customer_request(db, portal, request_id, lock=True)
    _expire_if_needed(db, row)
    if row.status == "Confirmed":
        db.commit()
        raise HTTPException(409, "Your booking is already confirmed.")
    booking = db.query(Booking).filter(Booking.id == row.booking_id, Booking.tenant_id == row.tenant_id).with_for_update().first() if row.booking_id else None
    checks, paid = _confirmation_checks(db, row.tenant_id, row, booking)
    try:
        _first_unmet(checks)
    except HTTPException:
        db.commit()  # keep a hold expiry that _expire_if_needed may just have recorded
        raise
    result = _confirm_booking(db, row.tenant_id, row, booking, paid, actor="Customer")
    db.commit(); return result
