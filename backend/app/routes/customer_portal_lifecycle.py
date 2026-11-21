from datetime import datetime
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from io import BytesIO
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.models.booking import Booking
from app.models.buyer_requirement import BuyerRequirement
from app.models.customer_booking_journey import CustomerBookingRequest, CustomerPortalJourneyFile
from app.models.customer_portal_lifecycle import (
    CustomerBookingCancellationRequest, CustomerPortalNotification,
    CustomerPropertyServiceRequest, PropertyHandover,
)
from app.models.customer_portal import CustomerPortalUser
from app.models.payment import Payment
from app.models.payment_refund import PaymentRefund
from app.models.payment_plan import PaymentPlan, PaymentPlanInstallment
from app.models.property import Property
from app.models.site_visit import SiteVisit
from app.models.support_ticket import SupportTicket
from app.models.user import User
from app.routes.customer_portal import require_portal_user, get_db, staff_context, _notify_staff_user
from app.services.audit_service import log_audit
from app.services.customer_portal_notifications import notify_customer, notify_booking_customer
from app.services.payment_allocation import IN_FLIGHT_STATUSES
from app.services.real_estate_lifecycle import ensure_utc_naive, sale_booking_net_verified, utcnow

router = APIRouter(tags=["Customer Portal - Lifecycle, Handover and After-sales"])


def now_utc():
    return utcnow()


def customer_booking(db: Session, portal: dict, booking_id: UUID, lock: bool = False):
    request_q = db.query(CustomerBookingRequest).filter(
        CustomerBookingRequest.tenant_id == portal["tenant_id"],
        CustomerBookingRequest.portal_user_id == portal["portal_user_id"],
        CustomerBookingRequest.booking_id == booking_id,
    )
    if lock:
        request_q = request_q.with_for_update()
    journey = request_q.first()
    if not journey:
        raise HTTPException(404, "Booking not found for this customer portal account.")
    booking_q = db.query(Booking).filter(Booking.id == booking_id, Booking.tenant_id == portal["tenant_id"])
    if lock:
        booking_q = booking_q.with_for_update()
    booking = booking_q.first()
    if not booking:
        raise HTTPException(404, "Booking not found.")
    return journey, booking


def cancellation_payload(row):
    return {"id": str(row.id), "booking_id": str(row.booking_id), "reason": row.reason,
            "status": row.status, "staff_notes": row.staff_notes,
            "reviewed_at": row.reviewed_at, "created_at": row.created_at, "updated_at": row.updated_at}


def handover_payload(row: PropertyHandover):
    return {
        "id": str(row.id),
        "booking_id": str(row.booking_id),
        "property_id": str(row.property_id),
        "portal_user_id": str(row.portal_user_id) if row.portal_user_id else None,
        "handover_mode": row.handover_mode,
        "contact_id": str(row.contact_id) if row.contact_id else None,
        "lead_id": str(row.lead_id) if row.lead_id else None,
        "customer_name": row.customer_name,
        "status": row.status,
        "scheduled_at": row.scheduled_at,
        "checklist": row.checklist or [],
        "property_condition": row.property_condition,
        "keys_handed_over": row.keys_handed_over,
        "documents_transferred": row.documents_transferred or [],
        "evidence_urls": row.evidence_urls or [],
        "handover_remarks": row.handover_remarks,
        "customer_notes": row.customer_notes,
        "staff_notes": row.staff_notes,
        "customer_acknowledged_at": row.customer_acknowledged_at,
        "staff_acknowledged_by": str(row.staff_acknowledged_by) if row.staff_acknowledged_by else None,
        "staff_acknowledged_at": row.staff_acknowledged_at,
        "staff_acknowledgement_notes": row.staff_acknowledgement_notes,
        "completed_at": row.completed_at,
        "completed_by": str(row.completed_by) if row.completed_by else None,
        "created_by": str(row.created_by) if row.created_by else None,
        "created_at": row.created_at,
        "updated_at": row.updated_at,
    }


def service_payload(row):
    return {"id": str(row.id), "booking_id": str(row.booking_id), "property_id": str(row.property_id),
            "category": row.category, "subject": row.subject, "description": row.description,
            "priority": row.priority, "status": row.status, "resolution": row.resolution,
            "created_at": row.created_at, "updated_at": row.updated_at, "closed_at": row.closed_at}


class CancellationCreate(BaseModel):
    reason: str = Field(min_length=10, max_length=5000)


class CancellationDecision(BaseModel):
    decision: str = Field(pattern="^(Approve|Reject)$")
    staff_notes: str | None = Field(default=None, max_length=5000)


class HandoverCreate(BaseModel):
    scheduled_at: datetime
    checklist: list[str] = Field(
        default_factory=lambda: [
            "Identity and ownership documents",
            "Keys/access cards",
            "Utility meter readings",
            "Property condition inspection",
            "Customer possession acknowledgement",
        ],
        max_length=40,
    )
    property_condition: str | None = Field(default=None, max_length=50)
    keys_handed_over: str | None = Field(default=None, max_length=2000)
    documents_transferred: list[str] | None = Field(default=None, max_length=50)
    evidence_urls: list[str] | None = Field(default=None, max_length=50)
    handover_remarks: str | None = Field(default=None, max_length=5000)
    staff_notes: str | None = Field(default=None, max_length=5000)


class HandoverUpdate(BaseModel):
    status: str | None = Field(default=None, pattern="^(Scheduled|In Progress|On Hold|Completed)$")
    scheduled_at: datetime | None = None
    checklist: list[dict] | None = Field(default=None, max_length=40)
    property_condition: str | None = Field(default=None, max_length=50)
    keys_handed_over: str | None = Field(default=None, max_length=2000)
    documents_transferred: list[str] | None = Field(default=None, max_length=50)
    evidence_urls: list[str] | None = Field(default=None, max_length=50)
    handover_remarks: str | None = Field(default=None, max_length=5000)
    staff_notes: str | None = Field(default=None, max_length=5000)


class HandoverAcknowledge(BaseModel):
    notes: str | None = Field(default=None, max_length=3000)
    confirm_possession: bool


class WalkInHandoverAcknowledge(BaseModel):
    acknowledged_by_customer_name: str = Field(min_length=2, max_length=200)
    confirm_possession: bool
    notes: str | None = Field(default=None, max_length=3000)
    evidence_urls: list[str] | None = Field(default=None, max_length=50)


class ServiceRequestCreate(BaseModel):
    category: str = Field(min_length=2, max_length=60)
    subject: str = Field(min_length=3, max_length=200)
    description: str = Field(min_length=10, max_length=5000)
    priority: str = Field(default="Medium", pattern="^(Low|Medium|High|Urgent)$")


class ServiceRequestUpdate(BaseModel):
    status: str = Field(pattern="^(Open|In Progress|Waiting on Customer|Resolved|Closed|Rejected)$")
    resolution: str | None = Field(default=None, max_length=5000)
    staff_notes: str | None = Field(default=None, max_length=5000)
    assigned_to: UUID | None = None


class RefundRequestCreate(BaseModel):
    payment_id: UUID
    amount: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    reason: str = Field(min_length=10, max_length=5000)


# Phase 10: Customer cancellation and refund request tracking.
@router.post("/api/v1/customer-portal/bookings/{booking_id}/cancellation-requests", status_code=201)
def customer_create_cancellation_request(booking_id: UUID, payload: CancellationCreate,
                                         portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    journey, booking = customer_booking(db, portal, booking_id, lock=True)
    if booking.status not in ("Pending", "Confirmed"):
        raise HTTPException(409, "Only active bookings can be cancelled.")
    existing = db.query(CustomerBookingCancellationRequest).filter(
        CustomerBookingCancellationRequest.tenant_id == portal["tenant_id"],
        CustomerBookingCancellationRequest.booking_id == booking.id,
        CustomerBookingCancellationRequest.status == "Pending",
    ).first()
    if existing:
        raise HTTPException(409, "A cancellation request is already pending for this booking.")
    row = CustomerBookingCancellationRequest(tenant_id=portal["tenant_id"], portal_user_id=portal["portal_user_id"],
                                             booking_id=booking.id, reason=payload.reason.strip(), status="Pending")
    db.add(row)
    _notify_staff_user(db, portal["tenant_id"], booking.created_by, "Customer requested booking cancellation",
                       f"A cancellation request was submitted for booking {booking.id}.", "customer_booking_cancellations", row.id)
    log_audit(db, portal["tenant_id"], None, "CREATE", "customer_booking_cancellations", row.id,
              "Customer submitted a booking cancellation request.")
    db.commit()
    db.refresh(row)
    return cancellation_payload(row)


@router.get("/api/v1/customer-portal/cancellation-requests")
def customer_list_cancellation_requests(portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    rows = db.query(CustomerBookingCancellationRequest).filter(
        CustomerBookingCancellationRequest.tenant_id == portal["tenant_id"],
        CustomerBookingCancellationRequest.portal_user_id == portal["portal_user_id"],
    ).order_by(CustomerBookingCancellationRequest.created_at.desc()).all()
    return [cancellation_payload(row) for row in rows]


@router.post("/api/v1/customer-portal/bookings/{booking_id}/refund-requests", status_code=201)
def customer_create_refund_request(booking_id: UUID, payload: RefundRequestCreate,
                                   portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    journey, booking = customer_booking(db, portal, booking_id, lock=True)
    if booking.status == "Completed":
        raise HTTPException(409, "Refund requests are not available after sale completion under the current booking policy.")
    payment = db.query(Payment).filter(Payment.id == payload.payment_id, Payment.tenant_id == portal["tenant_id"],
                                       Payment.booking_id == booking.id).with_for_update().first()
    if not payment or payment.status != "Verified":
        raise HTTPException(409, "Refunds can only be requested against a verified payment for your booking.")
    reserved = sum((Decimal(str(r.amount)) for r in db.query(PaymentRefund).filter(
        PaymentRefund.tenant_id == portal["tenant_id"], PaymentRefund.payment_id == payment.id,
        PaymentRefund.status.in_(["Pending", "Processed"])).all()), Decimal("0.00"))
    available = Decimal(str(payment.amount)) - reserved
    amount = payload.amount.quantize(Decimal("0.01"))
    if amount > available:
        raise HTTPException(409, f"Refund exceeds the refundable balance of {available:.2f}.")
    row = PaymentRefund(tenant_id=portal["tenant_id"], booking_id=booking.id, payment_id=payment.id,
                        amount=amount, reason=payload.reason.strip(), status="Pending", created_by=None)
    db.add(row)
    _notify_staff_user(db, portal["tenant_id"], booking.created_by, "Customer refund requested",
                       f"A refund request for {amount:.2f} was submitted for booking {booking.id}.", "payment_refunds", row.id)
    log_audit(db, portal["tenant_id"], None, "CREATE", "payment_refunds", row.id,
              "Customer submitted a refund request; staff review and actual transfer are still required.")
    db.commit()
    db.refresh(row)
    return {"id": str(row.id), "booking_id": str(row.booking_id), "payment_id": str(row.payment_id),
            "amount": str(row.amount), "reason": row.reason, "status": row.status, "created_at": row.created_at}


@router.get("/api/v1/customer-portal/bookings/{booking_id}/refund-requests")
def customer_list_refund_requests(booking_id: UUID, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    customer_booking(db, portal, booking_id)
    rows = db.query(PaymentRefund).filter(PaymentRefund.tenant_id == portal["tenant_id"],
        PaymentRefund.booking_id == booking_id).order_by(PaymentRefund.created_at.desc()).all()
    return [{"id": str(r.id), "payment_id": str(r.payment_id), "amount": str(r.amount), "reason": r.reason,
             "status": r.status, "external_reference": r.external_reference, "processed_at": r.processed_at,
             "created_at": r.created_at} for r in rows]


@router.get("/api/v1/customer-booking-workflow/cancellation-requests", dependencies=[Depends(require_permission("booking.view"))])
def staff_list_cancellation_requests(current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, _ = staff_context(current_user)
    rows = db.query(CustomerBookingCancellationRequest).filter(CustomerBookingCancellationRequest.tenant_id == tenant_id).order_by(CustomerBookingCancellationRequest.created_at.desc()).all()
    return [cancellation_payload(r) for r in rows]


@router.post("/api/v1/customer-booking-workflow/cancellation-requests/{request_id}/decision", dependencies=[Depends(require_permission("booking.update"))])
def staff_decide_cancellation_request(request_id: UUID, payload: CancellationDecision,
                                      current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = staff_context(current_user)
    row = db.query(CustomerBookingCancellationRequest).filter(CustomerBookingCancellationRequest.id == request_id,
        CustomerBookingCancellationRequest.tenant_id == tenant_id).with_for_update().first()
    if not row:
        raise HTTPException(404, "Cancellation request not found.")
    if row.status != "Pending":
        raise HTTPException(409, "Only pending cancellation requests can be decided.")
    booking = db.query(Booking).filter(Booking.id == row.booking_id, Booking.tenant_id == tenant_id).with_for_update().first()
    if not booking:
        raise HTTPException(404, "Booking not found.")
    row.reviewed_by, row.reviewed_at, row.staff_notes = user_id, now_utc(), payload.staff_notes
    if payload.decision == "Reject":
        row.status = "Rejected"
        notify_customer(db, tenant_id, row.portal_user_id, "Cancellation request declined",
                        payload.staff_notes or "Your booking cancellation request was declined.", "cancellation", "cancellation_requests", row.id)
    else:
        if booking.status not in ("Pending", "Confirmed"):
            raise HTTPException(409, "This booking can no longer be cancelled.")
        verified = sum((Decimal(str(p.amount)) for p in db.query(Payment).filter(Payment.tenant_id == tenant_id,
            Payment.booking_id == booking.id, Payment.status == "Verified").all()), Decimal("0.00"))
        processed = sum((Decimal(str(r.amount)) for r in db.query(PaymentRefund).filter(PaymentRefund.tenant_id == tenant_id,
            PaymentRefund.booking_id == booking.id, PaymentRefund.status == "Processed").all()), Decimal("0.00"))
        pending_refunds = db.query(PaymentRefund.id).filter(PaymentRefund.tenant_id == tenant_id,
            PaymentRefund.booking_id == booking.id, PaymentRefund.status == "Pending").first()
        if pending_refunds or processed < verified:
            raise HTTPException(409, "Process and verify refunds for all received funds before approving cancellation.")
        booking.status = "Cancelled"
        booking.hold_expires_at = None
        booking.cancellation_reason = row.reason
        prop = db.query(Property).filter(Property.id == booking.property_id, Property.tenant_id == tenant_id).with_for_update().first()
        if prop and prop.status == "Reserved":
            prop.status = "Available"
        plan = db.query(PaymentPlan).filter(PaymentPlan.tenant_id == tenant_id, PaymentPlan.booking_id == booking.id,
            PaymentPlan.status == "Active").with_for_update().first()
        if plan:
            plan.status = "Cancelled"
        for payment in db.query(Payment).filter(Payment.tenant_id == tenant_id, Payment.booking_id == booking.id,
            Payment.status.in_(IN_FLIGHT_STATUSES)).with_for_update().all():
            payment.status = "Rejected"
        journey = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.tenant_id == tenant_id,
            CustomerBookingRequest.booking_id == booking.id).with_for_update().first()
        if journey:
            journey.status, journey.hold_expires_at = "Cancelled", None
        row.status = "Approved"
        notify_customer(db, tenant_id, row.portal_user_id, "Booking cancellation approved",
                        "Your booking has been cancelled. Any verified payments were required to be refunded before approval.",
                        "cancellation", "bookings", booking.id)
    log_audit(db, tenant_id, user_id, "UPDATE", "customer_booking_cancellations", row.id,
              f"Customer cancellation request {payload.decision.lower()}d.")
    db.commit()
    db.refresh(row)
    return cancellation_payload(row)


# Phase 11: customer-facing notifications (kept separate from staff notifications).
@router.get("/api/v1/customer-portal/notifications")
def customer_notifications(portal: dict = Depends(require_portal_user), db: Session = Depends(get_db),
                           limit: int = Query(30, ge=1, le=100), offset: int = Query(0, ge=0)):
    query = db.query(CustomerPortalNotification).filter(CustomerPortalNotification.tenant_id == portal["tenant_id"],
        CustomerPortalNotification.portal_user_id == portal["portal_user_id"])
    total, unread = query.count(), query.filter(CustomerPortalNotification.is_read.is_(False)).count()
    rows = query.order_by(CustomerPortalNotification.created_at.desc()).offset(offset).limit(limit).all()
    return {"items": [{"id": str(r.id), "title": r.title, "message": r.message, "notification_type": r.notification_type,
        "related_module": r.related_module, "related_record_id": str(r.related_record_id) if r.related_record_id else None,
        "is_read": r.is_read, "created_at": r.created_at} for r in rows], "total": total, "unread_count": unread}


@router.get("/api/v1/customer-portal/notifications/unread-count")
def customer_notification_unread_count(portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    count = db.query(CustomerPortalNotification).filter(CustomerPortalNotification.tenant_id == portal["tenant_id"],
        CustomerPortalNotification.portal_user_id == portal["portal_user_id"], CustomerPortalNotification.is_read.is_(False)).count()
    return {"unread_count": count}


@router.patch("/api/v1/customer-portal/notifications/{notification_id}/read")
def customer_mark_notification_read(notification_id: UUID, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    row = db.query(CustomerPortalNotification).filter(CustomerPortalNotification.id == notification_id,
        CustomerPortalNotification.tenant_id == portal["tenant_id"], CustomerPortalNotification.portal_user_id == portal["portal_user_id"]).first()
    if not row:
        raise HTTPException(404, "Notification not found.")
    row.is_read = True
    db.commit()
    return {"id": str(row.id), "is_read": True}


@router.patch("/api/v1/customer-portal/notifications/read-all")
def customer_mark_all_notifications_read(portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    count = db.query(CustomerPortalNotification).filter(CustomerPortalNotification.tenant_id == portal["tenant_id"],
        CustomerPortalNotification.portal_user_id == portal["portal_user_id"], CustomerPortalNotification.is_read.is_(False)).update(
            {CustomerPortalNotification.is_read: True}, synchronize_session=False)
    db.commit()
    return {"updated_count": count}


# Phase 12: booking-specific agreements/payment proof index and verified receipts.
@router.get("/api/v1/customer-portal/booking-requests/{request_id}/files")
def customer_list_booking_files(request_id: UUID, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    journey = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == request_id,
        CustomerBookingRequest.tenant_id == portal["tenant_id"], CustomerBookingRequest.portal_user_id == portal["portal_user_id"]).first()
    if not journey:
        raise HTTPException(404, "Booking request not found.")
    rows = db.query(CustomerPortalJourneyFile).filter(CustomerPortalJourneyFile.tenant_id == portal["tenant_id"],
        CustomerPortalJourneyFile.portal_user_id == portal["portal_user_id"], CustomerPortalJourneyFile.booking_request_id == journey.id).order_by(CustomerPortalJourneyFile.uploaded_at.desc()).all()
    return [{"id": str(r.id), "purpose": r.purpose, "filename": r.filename, "content_type": r.content_type,
        "file_size": r.file_size, "payment_id": str(r.payment_id) if r.payment_id else None,
        "agreement_version": r.agreement_version, "uploaded_at": r.uploaded_at} for r in rows]


@router.get("/api/v1/customer-portal/booking-requests/{request_id}/files/{file_id}/download")
def customer_download_booking_file(request_id: UUID, file_id: UUID, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    journey = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == request_id,
        CustomerBookingRequest.tenant_id == portal["tenant_id"], CustomerBookingRequest.portal_user_id == portal["portal_user_id"]).first()
    if not journey:
        raise HTTPException(404, "Booking request not found.")
    row = db.query(CustomerPortalJourneyFile).filter(CustomerPortalJourneyFile.id == file_id,
        CustomerPortalJourneyFile.tenant_id == portal["tenant_id"], CustomerPortalJourneyFile.portal_user_id == portal["portal_user_id"],
        CustomerPortalJourneyFile.booking_request_id == journey.id).first()
    if not row:
        raise HTTPException(404, "File not found.")
    return {"filename": row.filename, "content_type": row.content_type, "download_url": row.file_url,
            "expires_or_access": "The stored Cloudinary authenticated URL is returned only to the owning customer portal user."}


@router.get("/api/v1/customer-portal/bookings/{booking_id}/payments/{payment_id}/receipt")
def customer_payment_receipt(booking_id: UUID, payment_id: UUID, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    customer_booking(db, portal, booking_id)
    payment = db.query(Payment).filter(Payment.id == payment_id, Payment.booking_id == booking_id,
        Payment.tenant_id == portal["tenant_id"], Payment.status == "Verified").first()
    if not payment:
        raise HTTPException(404, "Verified payment receipt is not available.")
    return {"receipt_type": "Payment Verification Receipt", "payment_id": str(payment.id), "booking_id": str(booking_id),
        "amount": str(payment.amount), "payment_method": payment.payment_method,
        "transaction_reference": payment.transaction_reference, "payment_date": payment.payment_date,
        "verified_at": payment.verified_at, "status": payment.status,
        "note": "This receipt confirms the CRM payment verification record; it is not a bank-issued receipt."}


@router.get("/api/v1/customer-portal/bookings/{booking_id}/payments/{payment_id}/receipt.pdf")
def customer_payment_receipt_pdf(booking_id: UUID, payment_id: UUID, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    customer_booking(db, portal, booking_id)
    payment = db.query(Payment).filter(Payment.id == payment_id, Payment.booking_id == booking_id,
        Payment.tenant_id == portal["tenant_id"], Payment.status == "Verified").first()
    if not payment:
        raise HTTPException(404, "Verified payment receipt is not available.")
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.pdfgen import canvas
        buffer = BytesIO()
        pdf = canvas.Canvas(buffer, pagesize=A4)
        width, height = A4
        y = height - 70
        pdf.setTitle(f"SCuilONE Payment Receipt {payment.id}")
        pdf.setFont("Helvetica-Bold", 18)
        pdf.drawString(55, y, "SCuilONE - Payment Verification Receipt")
        y -= 45
        pdf.setFont("Helvetica", 11)
        lines = [
            f"Booking ID: {booking_id}",
            f"Payment ID: {payment.id}",
            f"Amount: INR {Decimal(str(payment.amount)):,.2f}",
            f"Payment method: {payment.payment_method}",
            f"Transaction reference: {payment.transaction_reference or 'Not provided'}",
            f"Payment date: {payment.payment_date}",
            f"Verified at: {payment.verified_at}",
            f"Status: {payment.status}",
            "",
            "This receipt confirms the CRM payment verification record only.",
            "It is not a bank-issued receipt or proof of bank settlement.",
        ]
        for line in lines:
            pdf.drawString(55, y, line[:110])
            y -= 24
        pdf.showPage()
        pdf.save()
        buffer.seek(0)
        return StreamingResponse(buffer, media_type="application/pdf", headers={
            "Content-Disposition": f'attachment; filename="SCuilONE-payment-receipt-{payment.id}.pdf"'
        })
    except ImportError as exc:
        raise HTTPException(503, "PDF receipt generation is unavailable because ReportLab is not installed.") from exc


# Phase 13: handover after full sale completion (supports both Portal and Walk-in customers).
@router.get("/api/v1/customer-portal/bookings/{booking_id}/handover")
def customer_get_handover(booking_id: UUID, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    customer_booking(db, portal, booking_id)
    row = db.query(PropertyHandover).filter(PropertyHandover.tenant_id == portal["tenant_id"],
        PropertyHandover.portal_user_id == portal["portal_user_id"], PropertyHandover.booking_id == booking_id).first()
    if not row:
        raise HTTPException(404, "Property handover has not been scheduled yet.")
    return handover_payload(row)


@router.get("/api/v1/customer-booking-workflow/handovers", dependencies=[Depends(require_permission("booking.view"))])
def staff_list_handovers(current_user: dict = Depends(require_active_user), db: Session = Depends(get_db),
                         handover_status: str | None = Query(default=None, alias="status"),
                         handover_mode: str | None = Query(default=None)):
    tenant_id, _ = staff_context(current_user)
    query = db.query(PropertyHandover).filter(PropertyHandover.tenant_id == tenant_id)
    if handover_status:
        query = query.filter(PropertyHandover.status == handover_status)
    if handover_mode:
        query = query.filter(PropertyHandover.handover_mode == handover_mode)
    rows = query.order_by(PropertyHandover.created_at.desc()).all()
    return [handover_payload(row) for row in rows]


@router.get("/api/v1/customer-booking-workflow/handovers/{handover_id}", dependencies=[Depends(require_permission("booking.view"))])
def staff_get_handover(handover_id: UUID, current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, _ = staff_context(current_user)
    row = db.query(PropertyHandover).filter(
        PropertyHandover.id == handover_id,
        PropertyHandover.tenant_id == tenant_id,
    ).first()
    if not row:
        raise HTTPException(404, "Handover not found.")
    return handover_payload(row)


@router.post("/api/v1/customer-booking-workflow/bookings/{booking_id}/handover", status_code=201,
             dependencies=[Depends(require_permission("booking.update"))])
def staff_create_handover(booking_id: UUID, payload: HandoverCreate,
                          current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = staff_context(current_user)
    try:
        booking = db.query(Booking).filter(Booking.id == booking_id, Booking.tenant_id == tenant_id).with_for_update().first()
        if not booking:
            raise HTTPException(404, "Booking not found.")
        if booking.status != "Completed":
            raise HTTPException(409, "Handover can be scheduled only after the sale is completed and fully paid.")
        property_row = db.query(Property).filter(Property.id == booking.property_id, Property.tenant_id == tenant_id).first()
        if not property_row or property_row.status != "Sold":
            raise HTTPException(409, "The property must be marked Sold before handover can be scheduled.")
        net_verified = sale_booking_net_verified(db, tenant_id, booking.id)
        if net_verified < Decimal(str(booking.agreed_price)):
            raise HTTPException(
                409,
                f"Cannot schedule handover until the full agreed sale amount is verified. Required {booking.agreed_price}; verified {net_verified}.",
            )
        if db.query(PropertyHandover).filter(PropertyHandover.tenant_id == tenant_id, PropertyHandover.booking_id == booking.id).first():
            raise HTTPException(409, "A handover record already exists for this booking.")

        scheduled_at = ensure_utc_naive(payload.scheduled_at)
        if scheduled_at <= now_utc():
            raise HTTPException(422, "Handover schedule must be in the future.")

        journey = db.query(CustomerBookingRequest).filter(
            CustomerBookingRequest.tenant_id == tenant_id,
            CustomerBookingRequest.booking_id == booking.id,
        ).first()

        portal_user_id = journey.portal_user_id if journey else None
        handover_mode = "Portal" if portal_user_id else "Walk-in"
        contact_id = None
        if portal_user_id:
            portal_user = db.query(CustomerPortalUser).filter(
                CustomerPortalUser.id == portal_user_id,
                CustomerPortalUser.tenant_id == tenant_id,
            ).first()
            if portal_user:
                contact_id = portal_user.contact_id
        if contact_id is None and booking.buyer_requirement_id:
            req = db.query(BuyerRequirement).filter(
                BuyerRequirement.id == booking.buyer_requirement_id,
                BuyerRequirement.tenant_id == tenant_id,
            ).first()
            if req:
                contact_id = req.contact_id

        checklist = [{"item": item.strip(), "completed": False, "completed_at": None} for item in payload.checklist if item.strip()]
        row = PropertyHandover(
            tenant_id=tenant_id,
            booking_id=booking.id,
            property_id=booking.property_id,
            portal_user_id=portal_user_id,
            handover_mode=handover_mode,
            contact_id=contact_id,
            lead_id=booking.lead_id,
            customer_name=booking.buyer_name,
            status="Scheduled",
            scheduled_at=scheduled_at,
            checklist=checklist,
            property_condition=payload.property_condition,
            keys_handed_over=payload.keys_handed_over,
            documents_transferred=payload.documents_transferred or [],
            evidence_urls=payload.evidence_urls or [],
            handover_remarks=payload.handover_remarks,
            staff_notes=payload.staff_notes,
            created_by=user_id,
        )
        db.add(row)
        db.flush()
        if portal_user_id:
            notify_customer(
                db, tenant_id, portal_user_id, "Property handover scheduled",
                f"Your property handover is scheduled for {scheduled_at.isoformat()}.",
                "handover", "property_handovers", row.id,
            )
        log_audit(
            db, tenant_id, user_id, "CREATE", "property_handovers", row.id,
            f"{handover_mode} property handover scheduled for booking {booking.id}.",
            after_data={
                "handover_mode": handover_mode,
                "booking_id": str(booking.id),
                "customer_name": row.customer_name,
                "status": row.status,
            },
        )
        db.commit()
        db.refresh(row)
        return handover_payload(row)
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


@router.post("/api/v1/customer-booking-workflow/handovers/{handover_id}/walk-in-acknowledge",
             dependencies=[Depends(require_permission("booking.update"))])
def staff_record_walkin_handover_acknowledgement(
    handover_id: UUID,
    payload: WalkInHandoverAcknowledge,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """Record in-person possession acknowledgement for a walk-in Sale customer without a portal account."""
    tenant_id, user_id = staff_context(current_user)
    try:
        row = db.query(PropertyHandover).filter(
            PropertyHandover.id == handover_id,
            PropertyHandover.tenant_id == tenant_id,
        ).with_for_update().first()
        if not row:
            raise HTTPException(404, "Handover not found.")
        if row.handover_mode != "Walk-in":
            raise HTTPException(409, "Portal handovers must be acknowledged by the customer through the Customer Portal.")
        if row.status == "Completed":
            raise HTTPException(409, "This handover has already been completed.")
        if row.status not in ("Scheduled", "In Progress"):
            raise HTTPException(409, "Handover is not ready for possession acknowledgement.")
        if not payload.confirm_possession:
            raise HTTPException(422, "Confirm possession to record walk-in customer acknowledgement.")

        now = now_utc()
        row.staff_acknowledged_by = user_id
        row.staff_acknowledged_at = now
        row.staff_acknowledgement_notes = payload.notes
        row.customer_acknowledged_at = now
        row.customer_notes = f"Walk-in acknowledgement recorded for {payload.acknowledged_by_customer_name.strip()}." + (
            f" {payload.notes.strip()}" if payload.notes else ""
        )
        if payload.evidence_urls:
            existing_evidence = list(row.evidence_urls or [])
            for url in payload.evidence_urls:
                if url not in existing_evidence:
                    existing_evidence.append(url)
            row.evidence_urls = existing_evidence
        row.updated_at = now
        log_audit(
            db, tenant_id, user_id, "UPDATE", "property_handovers", row.id,
            f"Staff recorded walk-in possession acknowledgement for {payload.acknowledged_by_customer_name.strip()}.",
            after_data={
                "handover_mode": row.handover_mode,
                "acknowledged_by_customer_name": payload.acknowledged_by_customer_name.strip(),
                "staff_acknowledged_at": now.isoformat(),
            },
        )
        db.commit()
        db.refresh(row)
        return handover_payload(row)
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


@router.patch("/api/v1/customer-booking-workflow/handovers/{handover_id}", dependencies=[Depends(require_permission("booking.update"))])
def staff_update_handover(handover_id: UUID, payload: HandoverUpdate,
                          current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = staff_context(current_user)
    try:
        row = db.query(PropertyHandover).filter(PropertyHandover.id == handover_id, PropertyHandover.tenant_id == tenant_id).with_for_update().first()
        if not row:
            raise HTTPException(404, "Handover not found.")
        if row.status == "Completed":
            raise HTTPException(409, "A completed property handover cannot be modified.")
        before_status = row.status
        if payload.status:
            row.status = payload.status
        if payload.scheduled_at:
            scheduled_at = ensure_utc_naive(payload.scheduled_at)
            if scheduled_at <= now_utc():
                raise HTTPException(422, "Handover schedule must be in the future.")
            row.scheduled_at = scheduled_at
        if payload.checklist is not None:
            normalized = []
            for item in payload.checklist:
                label = str(item.get("item", "")).strip()
                if not label:
                    raise HTTPException(422, "Each handover checklist item requires a name.")
                normalized.append({"item": label[:200], "completed": bool(item.get("completed", False)),
                                   "completed_at": item.get("completed_at") or (now_utc().isoformat() if item.get("completed") else None)})
            row.checklist = normalized
        if payload.property_condition is not None:
            row.property_condition = payload.property_condition
        if payload.keys_handed_over is not None:
            row.keys_handed_over = payload.keys_handed_over
        if payload.documents_transferred is not None:
            row.documents_transferred = payload.documents_transferred
        if payload.evidence_urls is not None:
            row.evidence_urls = payload.evidence_urls
        if payload.handover_remarks is not None:
            row.handover_remarks = payload.handover_remarks
        if payload.staff_notes is not None:
            row.staff_notes = payload.staff_notes

        if row.status == "Completed":
            booking = db.query(Booking).filter(Booking.id == row.booking_id, Booking.tenant_id == tenant_id).first()
            prop = db.query(Property).filter(Property.id == row.property_id, Property.tenant_id == tenant_id).first()
            if not booking or booking.status != "Completed" or not prop or prop.status != "Sold":
                raise HTTPException(409, "Booking must remain Completed and Property must remain Sold to complete handover.")
            net_verified = sale_booking_net_verified(db, tenant_id, booking.id)
            if net_verified < Decimal(str(booking.agreed_price)):
                raise HTTPException(409, "Full agreed sale amount must remain verified before completing handover.")
            if row.handover_mode == "Portal":
                if not row.customer_acknowledged_at:
                    raise HTTPException(409, "Customer possession acknowledgement is required before completing handover.")
            else:
                if not row.staff_acknowledged_at and not row.customer_acknowledged_at:
                    raise HTTPException(409, "Staff-recorded walk-in possession acknowledgement is required before completing handover.")
            if any(not item.get("completed") for item in (row.checklist or [])):
                raise HTTPException(409, "Complete every handover checklist item before marking handover Completed.")
            row.completed_at = now_utc()
            row.completed_by = user_id

        row.updated_at = now_utc()
        if row.portal_user_id:
            notify_customer(
                db, tenant_id, row.portal_user_id, "Property handover updated",
                f"Your property handover status is now {row.status}.",
                "handover", "property_handovers", row.id,
            )
        log_audit(
            db, tenant_id, user_id, "UPDATE", "property_handovers", row.id,
            f"{row.handover_mode} property handover updated from {before_status} to {row.status}.",
            before_data={"status": before_status},
            after_data={
                "status": row.status,
                "property_condition": row.property_condition,
                "completed_at": row.completed_at.isoformat() if row.completed_at else None,
            },
        )
        db.commit()
        db.refresh(row)
        return handover_payload(row)
    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise


@router.post("/api/v1/customer-portal/handovers/{handover_id}/acknowledge")
def customer_acknowledge_handover(handover_id: UUID, payload: HandoverAcknowledge,
                                  portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    row = db.query(PropertyHandover).filter(PropertyHandover.id == handover_id, PropertyHandover.tenant_id == portal["tenant_id"],
        PropertyHandover.portal_user_id == portal["portal_user_id"]).with_for_update().first()
    if not row:
        raise HTTPException(404, "Handover not found.")
    if row.status not in ("Scheduled", "In Progress"):
        raise HTTPException(409, "Handover is not ready for customer acknowledgement.")
    if not payload.confirm_possession:
        raise HTTPException(422, "Confirm possession to record acknowledgement.")
    row.customer_acknowledged_at = now_utc()
    row.customer_notes = payload.notes
    booking = db.query(Booking).filter(Booking.id == row.booking_id, Booking.tenant_id == portal["tenant_id"]).first()
    _notify_staff_user(db, portal["tenant_id"], booking.created_by if booking else None, "Customer acknowledged property possession", f"Customer acknowledged handover {row.id}.", "property_handovers", row.id)
    log_audit(db, portal["tenant_id"], None, "UPDATE", "property_handovers", row.id, "Customer acknowledged property possession.")
    db.commit()
    return handover_payload(row)


# Phase 14: booking-linked after-sales/maintenance requests.
@router.post("/api/v1/customer-portal/bookings/{booking_id}/service-requests", status_code=201)
def customer_create_service_request(booking_id: UUID, payload: ServiceRequestCreate,
                                    portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    journey, booking = customer_booking(db, portal, booking_id)
    if booking.status != "Completed":
        raise HTTPException(409, "After-sales service requests are available after sale completion.")
    row = CustomerPropertyServiceRequest(tenant_id=portal["tenant_id"], portal_user_id=portal["portal_user_id"],
        booking_id=booking.id, property_id=booking.property_id, category=payload.category.strip(), subject=payload.subject.strip(),
        description=payload.description.strip(), priority=payload.priority, status="Open")
    db.add(row)
    _notify_staff_user(db, portal["tenant_id"], booking.created_by, "New property after-sales request",
        f"{payload.subject.strip()} was submitted for booking {booking.id}.", "customer_property_service_requests", row.id)
    log_audit(db, portal["tenant_id"], None, "CREATE", "customer_property_service_requests", row.id, "Customer submitted a property after-sales service request.")
    db.commit()
    db.refresh(row)
    return service_payload(row)


@router.get("/api/v1/customer-portal/service-requests")
def customer_list_service_requests(portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    rows = db.query(CustomerPropertyServiceRequest).filter(CustomerPropertyServiceRequest.tenant_id == portal["tenant_id"],
        CustomerPropertyServiceRequest.portal_user_id == portal["portal_user_id"]).order_by(CustomerPropertyServiceRequest.created_at.desc()).all()
    return [service_payload(r) for r in rows]


@router.get("/api/v1/customer-portal/service-requests/{request_id}")
def customer_get_service_request(request_id: UUID, portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    row = db.query(CustomerPropertyServiceRequest).filter(CustomerPropertyServiceRequest.id == request_id,
        CustomerPropertyServiceRequest.tenant_id == portal["tenant_id"], CustomerPropertyServiceRequest.portal_user_id == portal["portal_user_id"]).first()
    if not row:
        raise HTTPException(404, "Service request not found.")
    return service_payload(row)


@router.get("/api/v1/customer-booking-workflow/service-requests", dependencies=[Depends(require_permission("support_ticket.view"))])
def staff_list_service_requests(current_user: dict = Depends(require_active_user), db: Session = Depends(get_db),
                                request_status: str | None = Query(default=None, alias="status")):
    tenant_id, _ = staff_context(current_user)
    query = db.query(CustomerPropertyServiceRequest).filter(CustomerPropertyServiceRequest.tenant_id == tenant_id)
    if request_status:
        query = query.filter(CustomerPropertyServiceRequest.status == request_status)
    rows = query.order_by(CustomerPropertyServiceRequest.created_at.desc()).all()
    return [service_payload(row) for row in rows]


@router.patch("/api/v1/customer-booking-workflow/service-requests/{request_id}", dependencies=[Depends(require_permission("support_ticket.update"))])
def staff_update_service_request(request_id: UUID, payload: ServiceRequestUpdate,
                                 current_user: dict = Depends(require_active_user), db: Session = Depends(get_db)):
    tenant_id, user_id = staff_context(current_user)
    row = db.query(CustomerPropertyServiceRequest).filter(CustomerPropertyServiceRequest.id == request_id,
        CustomerPropertyServiceRequest.tenant_id == tenant_id).with_for_update().first()
    if not row:
        raise HTTPException(404, "Service request not found.")
    if payload.assigned_to is not None:
        assignee = db.query(User).filter(User.id == payload.assigned_to, User.tenant_id == tenant_id, User.status == "Active").first()
        if not assignee:
            raise HTTPException(422, "Assignee must be an active user in this tenant.")
        row.assigned_to = payload.assigned_to
    row.status, row.resolution, row.staff_notes = payload.status, payload.resolution, payload.staff_notes
    row.closed_at = now_utc() if payload.status in ("Resolved", "Closed", "Rejected") else None
    notify_customer(db, tenant_id, row.portal_user_id, "After-sales request updated",
        f"Your request '{row.subject}' is now {row.status}." + (f" Resolution: {row.resolution}" if row.resolution else ""),
        "after_sales", "customer_property_service_requests", row.id)
    log_audit(db, tenant_id, user_id, "UPDATE", "customer_property_service_requests", row.id, f"After-sales request updated to {row.status}.")
    db.commit()
    db.refresh(row)
    return service_payload(row)


# Phase 15: a customer-scoped activity timeline and lifecycle overview.
@router.get("/api/v1/customer-portal/activity-timeline")
def customer_activity_timeline(portal: dict = Depends(require_portal_user), db: Session = Depends(get_db),
                               limit: int = Query(100, ge=1, le=250)):
    tenant_id, portal_id = portal["tenant_id"], portal["portal_user_id"]
    events = []
    def add(kind, title, description, at, record_id, status_value=None):
        if at:
            events.append({"type": kind, "title": title, "description": description,
                           "status": status_value, "record_id": str(record_id), "occurred_at": at})
    journeys = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.tenant_id == tenant_id,
        CustomerBookingRequest.portal_user_id == portal_id).all()
    for r in journeys:
        add("booking_request", "Booking request", f"Property booking request status: {r.status}.", r.updated_at, r.id, r.status)
    visits = db.query(SiteVisit).join(CustomerBookingRequest, CustomerBookingRequest.site_visit_id == SiteVisit.id).filter(
        CustomerBookingRequest.tenant_id == tenant_id, CustomerBookingRequest.portal_user_id == portal_id).all()
    for v in visits:
        add("site_visit", "Site visit", f"Site visit status: {v.status}.", v.updated_at, v.id, v.status)
    booking_ids = [r.booking_id for r in journeys if r.booking_id]
    if booking_ids:
        for p in db.query(Payment).filter(Payment.tenant_id == tenant_id, Payment.booking_id.in_(booking_ids)).all():
            add("payment", "Payment", f"Payment of {p.amount} is {p.status}.", p.updated_at, p.id, p.status)
        for c in db.query(CustomerBookingCancellationRequest).filter(CustomerBookingCancellationRequest.tenant_id == tenant_id,
            CustomerBookingCancellationRequest.portal_user_id == portal_id).all():
            add("cancellation", "Cancellation request", f"Cancellation request status: {c.status}.", c.updated_at, c.id, c.status)
        for h in db.query(PropertyHandover).filter(PropertyHandover.tenant_id == tenant_id, PropertyHandover.portal_user_id == portal_id).all():
            add("handover", "Property handover", f"Handover status: {h.status}.", h.updated_at, h.id, h.status)
        for s in db.query(CustomerPropertyServiceRequest).filter(CustomerPropertyServiceRequest.tenant_id == tenant_id,
            CustomerPropertyServiceRequest.portal_user_id == portal_id).all():
            add("after_sales", s.subject, f"After-sales request status: {s.status}.", s.updated_at, s.id, s.status)
        for r in db.query(PaymentRefund).filter(PaymentRefund.tenant_id == tenant_id, PaymentRefund.booking_id.in_(booking_ids)).all():
            add("refund", "Refund request", f"Refund of {r.amount} is {r.status}.", r.updated_at, r.id, r.status)
    tickets = db.query(SupportTicket).filter(SupportTicket.tenant_id == tenant_id,
        SupportTicket.contact_id == portal["contact_id"]).all()
    for t in tickets:
        add("support", t.subject, f"Support ticket status: {t.status}.", t.updated_at, t.id, t.status)
    events.sort(key=lambda x: x["occurred_at"] or datetime.min, reverse=True)
    return {"items": events[:limit], "total": len(events)}


@router.get("/api/v1/customer-portal/lifecycle-overview")
def customer_lifecycle_overview(portal: dict = Depends(require_portal_user), db: Session = Depends(get_db)):
    tenant_id, portal_id = portal["tenant_id"], portal["portal_user_id"]
    journeys = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.tenant_id == tenant_id,
        CustomerBookingRequest.portal_user_id == portal_id).all()
    booking_ids = [r.booking_id for r in journeys if r.booking_id]
    bookings = db.query(Booking).filter(Booking.tenant_id == tenant_id, Booking.id.in_(booking_ids)).all() if booking_ids else []
    verified = sum((Decimal(str(p.amount)) for p in db.query(Payment).filter(Payment.tenant_id == tenant_id,
        Payment.booking_id.in_(booking_ids), Payment.status == "Verified").all()), Decimal("0.00")) if booking_ids else Decimal("0.00")
    refunds = sum((Decimal(str(r.amount)) for r in db.query(PaymentRefund).filter(PaymentRefund.tenant_id == tenant_id,
        PaymentRefund.booking_id.in_(booking_ids), PaymentRefund.status == "Processed").all()), Decimal("0.00")) if booking_ids else Decimal("0.00")
    unread = db.query(CustomerPortalNotification).filter(CustomerPortalNotification.tenant_id == tenant_id,
        CustomerPortalNotification.portal_user_id == portal_id, CustomerPortalNotification.is_read.is_(False)).count()
    open_service = db.query(CustomerPropertyServiceRequest).filter(CustomerPropertyServiceRequest.tenant_id == tenant_id,
        CustomerPropertyServiceRequest.portal_user_id == portal_id, CustomerPropertyServiceRequest.status.in_(["Open", "In Progress", "Waiting on Customer"])).count()
    return {"bookings": {"total": len(bookings), "confirmed": sum(b.status == "Confirmed" for b in bookings),
        "completed": sum(b.status == "Completed" for b in bookings)},
        "payments": {"verified_gross": str(verified), "processed_refunds": str(refunds), "net_verified": str(max(Decimal("0.00"), verified - refunds))},
        "notifications": {"unread": unread}, "after_sales": {"open_requests": open_service}}
