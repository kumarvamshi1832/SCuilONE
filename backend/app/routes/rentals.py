"""Staff APIs for rental and lease lifecycle management."""
import calendar
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import require_active_user
from app.core.industry_modules import require_enabled_module
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.buyer_requirement import BuyerRequirement
from app.models.contact import Contact
from app.models.customer_portal import CustomerPortalUser
from app.models.lead import Lead
from app.models.property import Property
from app.models.property_match import PropertyMatch
from app.models.property_offer import PropertyOffer
from app.models.rental import (
    RentalAgreement, RentalPaymentSchedule, RentalPayment,
    RentalDepositTransaction, RentalExitRequest, RentalInspection,
    RentalSettlement, RentalAgreementRevision,
)
from app.schemas.rental import (
    RentalAgreementCreate, RentalAgreementUpdate, RentalAgreementResponse, RentalAgreementActivate,
    RentalAgreementSendForSignature, RentalAgreementCancel,
    RentalScheduleGenerate, RentalPaymentCreate, RentalPaymentResponse,
    RentalPaymentDecision, RentalDepositTransactionCreate,
    RentalExitRequestCreate, RentalExitDecision, RentalInspectionCreate,
    RentalSettlementCalculate, RentalSettlementResponse, RentalRefundCreate,
    RentalInspectionAcknowledge, RentalAgreementWalkInSignature,
    RentalRenewalCreate, RentalRenewalDecision, RentalSettlementCollectionCreate,
)
from app.services.audit_service import log_audit
from app.services.customer_portal_notifications import notify_customer
from app.services.rental_calculations import add_months, period_months, money, lock_in_end_date, calculate_deposit_settlement

router = APIRouter(
    prefix="/api/v1/rentals",
    tags=["Rentals and Leases"],
    dependencies=[Depends(require_enabled_module("properties"))],
)
CENT = Decimal("0.01")
ZERO = Decimal("0.00")
ACTIVE_EXIT_STATUSES = ("Requested", "Under Review", "Approved", "Inspection Pending", "Settlement Pending")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def identity(user: dict) -> tuple[UUID, UUID]:
    try:
        return UUID(str(user["tenant_id"])), UUID(str(user["user_id"]))
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid authenticated user context.")


def notify_rental_customer(db: Session, agreement: RentalAgreement, title: str, message: str, record_id: UUID | None = None) -> None:
    if not agreement.contact_id:
        return
    portal_user = db.query(CustomerPortalUser).filter(
        CustomerPortalUser.tenant_id == agreement.tenant_id,
        CustomerPortalUser.contact_id == agreement.contact_id,
        CustomerPortalUser.status == "Active",
    ).first()
    if portal_user:
        notify_customer(db, agreement.tenant_id, portal_user.id, title, message,
                        "rental_update", "rental_agreements", record_id or agreement.id)


def get_agreement(db: Session, tenant_id: UUID, agreement_id: UUID, lock: bool = False) -> RentalAgreement:
    q = db.query(RentalAgreement).filter(
        RentalAgreement.id == agreement_id,
        RentalAgreement.tenant_id == tenant_id,
    )
    if lock:
        q = q.with_for_update()
    row = q.first()
    if not row:
        raise HTTPException(status_code=404, detail="Rental agreement not found in this tenant.")
    return row


def deposit_balance(db: Session, tenant_id: UUID, agreement_id: UUID) -> Decimal:
    rows = db.query(RentalDepositTransaction).filter(
        RentalDepositTransaction.tenant_id == tenant_id,
        RentalDepositTransaction.agreement_id == agreement_id,
        RentalDepositTransaction.status == "Posted",
    ).all()
    total = ZERO
    for row in rows:
        total += money(row.amount) if row.direction == "Credit" else -money(row.amount)
    return money(total)


def schedule_paid(db: Session, tenant_id: UUID, schedule_id: UUID) -> Decimal:
    value = db.query(func.coalesce(func.sum(RentalPayment.amount), 0)).filter(
        RentalPayment.tenant_id == tenant_id,
        RentalPayment.schedule_id == schedule_id,
        RentalPayment.status == "Verified",
    ).scalar()
    return money(value)


def sync_schedule(db: Session, tenant_id: UUID, row: RentalPaymentSchedule) -> None:
    agreement = get_agreement(db, tenant_id, row.agreement_id)
    grace_cutoff = row.due_date + timedelta(days=agreement.late_fee_grace_days or 0)
    paid = schedule_paid(db, tenant_id, row.id)
    if (
        row.charge_type == "Rent"
        and agreement.late_fee_amount > ZERO
        and date.today() > grace_cutoff
        and paid < money(row.amount) + money(row.late_fee_amount)
        and row.late_fee_applied_at is None
    ):
        if agreement.late_fee_type == "Percentage":
            fee = money(money(row.amount) * money(agreement.late_fee_amount) / Decimal("100"))
        else:
            fee = money(agreement.late_fee_amount)
        row.late_fee_amount = fee
        row.late_fee_applied_at = datetime.utcnow()
    total_due = money(row.amount) + money(row.late_fee_amount)
    if paid >= total_due:
        row.status = "Paid"
    elif paid > ZERO:
        row.status = "Partially Paid"
    elif row.due_date < date.today():
        row.status = "Overdue"
    else:
        row.status = "Pending"


def generate_schedule_rows(db: Session, agreement: RentalAgreement, through_date: date, start_from: date | None = None) -> int:
    """Generate recurring rent and maintenance charges without duplicating periods."""
    existing = db.query(RentalPaymentSchedule).filter(
        RentalPaymentSchedule.tenant_id == agreement.tenant_id,
        RentalPaymentSchedule.agreement_id == agreement.id,
    ).all()
    existing_keys = {(x.charge_type, x.period_start, x.period_end) for x in existing}
    sequence = max((x.sequence for x in existing), default=0)
    base_start = start_from or agreement.agreement_start
    created = 0

    charge_specs = [("Rent", money(agreement.rent_amount), agreement.rent_frequency)]
    if money(agreement.maintenance_amount) > ZERO:
        charge_specs.append(("Maintenance", money(agreement.maintenance_amount), agreement.maintenance_frequency))

    for charge_type, base_amount, frequency in charge_specs:
        step = period_months(frequency)
        cursor = base_start
        while cursor <= through_date:
            next_start = add_months(cursor, step)
            period_end = next_start - timedelta(days=1)
            if agreement.agreement_end and period_end > agreement.agreement_end:
                period_end = agreement.agreement_end
            if period_end < cursor:
                break
            key = (charge_type, cursor, period_end)
            if key not in existing_keys:
                sequence += 1
                amount = base_amount
                if charge_type == "Rent" and agreement.escalation_percentage is not None and agreement.escalation_interval_months:
                    escalation_anchor = agreement.escalation_base_date or agreement.agreement_start
                    months_elapsed = max(0, (cursor.year - escalation_anchor.year) * 12 + cursor.month - escalation_anchor.month)
                    escalations = months_elapsed // agreement.escalation_interval_months
                    for _ in range(escalations):
                        amount = money(amount * (Decimal("1") + money(agreement.escalation_percentage) / Decimal("100")))
                due_day = min(agreement.due_day, calendar.monthrange(cursor.year, cursor.month)[1])
                due = date(cursor.year, cursor.month, due_day)
                if due < cursor:
                    due = cursor
                db.add(RentalPaymentSchedule(
                    tenant_id=agreement.tenant_id,
                    agreement_id=agreement.id,
                    sequence=sequence,
                    charge_type=charge_type,
                    period_start=cursor,
                    period_end=period_end,
                    due_date=due,
                    amount=amount,
                    status="Pending",
                ))
                existing_keys.add(key)
                created += 1
            cursor = next_start
    return created


@router.post("/agreements", response_model=RentalAgreementResponse, status_code=201,
             dependencies=[Depends(require_permission("booking.create"))])
def create_rental_agreement(payload: RentalAgreementCreate, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user)
    prop = db.query(Property).filter(Property.id == payload.property_id, Property.tenant_id == tenant_id).with_for_update().first()
    if not prop:
        raise HTTPException(404, "Property not found in this tenant.")
    if prop.listing_type != payload.agreement_type:
        raise HTTPException(400, f"A {payload.agreement_type} agreement requires a {payload.agreement_type} property listing.")
    if prop.price_frequency != payload.rent_frequency:
        raise HTTPException(400, "Agreement payment frequency must match the property's listed price frequency.")
    if payload.agreement_end:
        duration_months = max(0, (payload.agreement_end.year - payload.agreement_start.year) * 12 + payload.agreement_end.month - payload.agreement_start.month)
        if prop.minimum_term_months is not None and duration_months < prop.minimum_term_months:
            raise HTTPException(400, "Agreement duration is shorter than the property's minimum term.")
        if prop.maximum_term_months is not None and duration_months > prop.maximum_term_months:
            raise HTTPException(400, "Agreement duration exceeds the property's maximum term.")
    if prop.offer_hold_expires_at and prop.offer_hold_expires_at <= datetime.utcnow():
        prop.status = "Available"
        prop.offer_hold_expires_at = None
    offer_hold_valid = (
        prop.status == "Reserved"
        and payload.accepted_offer_id is not None
        and prop.offer_hold_expires_at is not None
        and prop.offer_hold_expires_at > datetime.utcnow()
    )
    if prop.status != "Available" and not offer_hold_valid:
        raise HTTPException(409, "Only an Available property or a property held for this accepted offer can receive a rental agreement.")
    existing_draft = db.query(RentalAgreement.id).filter(
        RentalAgreement.tenant_id == tenant_id,
        RentalAgreement.property_id == prop.id,
        RentalAgreement.status == "Draft",
    ).first()
    if existing_draft:
        raise HTTPException(409, "A Draft rental/lease agreement already exists for this property. Edit or cancel it before creating another.")
    if payload.lead_id and not db.query(Lead.id).filter(Lead.id == payload.lead_id, Lead.tenant_id == tenant_id).first():
        raise HTTPException(400, "Lead does not belong to this tenant.")
    if payload.contact_id and not db.query(Contact.id).filter(Contact.id == payload.contact_id, Contact.tenant_id == tenant_id).first():
        raise HTTPException(400, "Contact does not belong to this tenant.")
    if payload.buyer_requirement_id:
        linked_requirement = db.query(BuyerRequirement).filter(BuyerRequirement.id == payload.buyer_requirement_id, BuyerRequirement.tenant_id == tenant_id).first()
        if linked_requirement and payload.contact_id and linked_requirement.contact_id not in (None, payload.contact_id):
            raise HTTPException(400, "Buyer requirement belongs to a different contact.")
        if linked_requirement and payload.lead_id and linked_requirement.lead_id not in (None, payload.lead_id):
            raise HTTPException(400, "Buyer requirement belongs to a different lead.")
        # Customer Portal rental records are owned by the authenticated Contact.
        # Carry the requirement's contact onto the agreement even when staff
        # selected the lead-based workflow in the agreement form.
        if linked_requirement and not payload.contact_id and linked_requirement.contact_id:
            payload.contact_id = linked_requirement.contact_id
    if payload.buyer_requirement_id:
        req = db.query(BuyerRequirement).filter(BuyerRequirement.id == payload.buyer_requirement_id, BuyerRequirement.tenant_id == tenant_id).first()
        if not req:
            raise HTTPException(400, "Buyer requirement does not belong to this tenant.")
        expected = "Buy" if payload.agreement_type == "Sale" else payload.agreement_type
        if req.requirement_type != expected:
            raise HTTPException(400, "Buyer requirement transaction type does not match the agreement.")
    if payload.property_match_id:
        match = db.query(PropertyMatch).filter(PropertyMatch.id == payload.property_match_id, PropertyMatch.tenant_id == tenant_id, PropertyMatch.property_id == prop.id).first()
        if not match:
            raise HTTPException(400, "Property match does not link this property in this tenant.")
        if payload.buyer_requirement_id and match.buyer_requirement_id != payload.buyer_requirement_id:
            raise HTTPException(400, "Property match belongs to a different buyer requirement.")
    if payload.accepted_offer_id:
        offer = db.query(PropertyOffer).filter(PropertyOffer.id == payload.accepted_offer_id, PropertyOffer.tenant_id == tenant_id, PropertyOffer.status == "Accepted").first()
        if not offer or (payload.property_match_id and offer.property_match_id != payload.property_match_id):
            raise HTTPException(400, "Accepted offer does not match this rental agreement.")
        if offer.expires_at and offer.expires_at <= datetime.utcnow():
            raise HTTPException(409, "The accepted offer has expired.")
        if offer.hold_expires_at and offer.hold_expires_at <= datetime.utcnow():
            raise HTTPException(409, "The accepted offer's property hold has expired.")
        if prop.status == "Reserved" and (
            not offer.hold_expires_at or offer.hold_expires_at != prop.offer_hold_expires_at
        ):
            raise HTTPException(409, "The property hold does not belong to this accepted offer.")
        if not payload.property_match_id:
            raise HTTPException(400, "An accepted offer requires the linked property_match_id.")
        if money(offer.offered_price) != money(payload.rent_amount):
            raise HTTPException(400, "Agreement rent amount must match the accepted offer amount.")
        if offer.price_frequency != prop.price_frequency:
            raise HTTPException(400, "Accepted offer price frequency does not match the property listing.")
    agreement_data = payload.model_dump()
    agreement_data["escalation_base_date"] = payload.agreement_start
    row = RentalAgreement(**agreement_data, tenant_id=tenant_id, created_by=user_id, status="Draft")
    try:
        db.add(row)
        db.flush()
        log_audit(db, tenant_id, user_id, "CREATE", "rental_agreements", row.id, "Created rental/lease agreement draft", after_data={"property_id": str(prop.id), "agreement_type": row.agreement_type, "rent_amount": str(row.rent_amount), "deposit_amount": str(row.deposit_amount)})
        db.commit(); db.refresh(row)
        return row
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "A conflicting rental agreement already exists for this property.")
    except Exception:
        db.rollback(); raise


@router.get("/agreements", response_model=list[RentalAgreementResponse], dependencies=[Depends(require_permission("booking.view"))])
def list_rental_agreements(status_filter: str | None = Query(default=None, alias="status"), agreement_type: str | None = None, property_id: UUID | None = None, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, _ = identity(user)
    q = db.query(RentalAgreement).filter(RentalAgreement.tenant_id == tenant_id)
    if status_filter: q = q.filter(RentalAgreement.status == status_filter)
    if agreement_type: q = q.filter(RentalAgreement.agreement_type == agreement_type)
    if property_id: q = q.filter(RentalAgreement.property_id == property_id)
    return q.order_by(RentalAgreement.created_at.desc()).all()


@router.get("/agreements/{agreement_id}", response_model=RentalAgreementResponse, dependencies=[Depends(require_permission("booking.view"))])
def read_rental_agreement(agreement_id: UUID, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, _ = identity(user)
    return get_agreement(db, tenant_id, agreement_id)


@router.patch("/agreements/{agreement_id}", response_model=RentalAgreementResponse, dependencies=[Depends(require_permission("booking.update"))])
def update_rental_agreement_draft(agreement_id: UUID, payload: RentalAgreementUpdate, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user)
    agreement = get_agreement(db, tenant_id, agreement_id, lock=True)
    if agreement.status != "Draft":
        raise HTTPException(409, "Only a draft rental agreement can be edited. Create a revision or renewal after signature.")
    changes = payload.model_dump(exclude_unset=True)
    final_start = changes.get("agreement_start", agreement.agreement_start)
    final_end = changes.get("agreement_end", agreement.agreement_end)
    final_lockin = changes.get("lock_in_months", agreement.lock_in_months)
    if final_end and final_end < final_start:
        raise HTTPException(400, "Agreement end date cannot be before start date.")
    if final_end:
        duration_months = max(0, (final_end.year - final_start.year) * 12 + final_end.month - final_start.month)
        if final_lockin > duration_months:
            raise HTTPException(400, "Lock-in period cannot exceed the agreement duration.")
    if changes.get("escalation_percentage", agreement.escalation_percentage) is not None and changes.get("escalation_interval_months", agreement.escalation_interval_months) is None:
        raise HTTPException(400, "Escalation interval is required when escalation is configured.")
    prop = db.query(Property).filter(Property.id == agreement.property_id, Property.tenant_id == tenant_id).first()
    final_frequency = changes.get("rent_frequency", agreement.rent_frequency)
    if prop and final_frequency != prop.price_frequency:
        raise HTTPException(400, "Agreement payment frequency must match the property's listed price frequency.")
    for field, value in changes.items():
        setattr(agreement, field, value)
    if "agreement_start" in changes:
        agreement.escalation_base_date = agreement.agreement_start
    log_audit(db, tenant_id, user_id, "UPDATE", "rental_agreements", agreement.id, "Updated rental agreement draft", after_data={key: str(value) if value is not None else None for key, value in changes.items()})
    db.commit(); db.refresh(agreement); return agreement


@router.post("/agreements/{agreement_id}/send-for-signature", response_model=RentalAgreementResponse, dependencies=[Depends(require_permission("booking.update"))])
def send_rental_agreement_for_signature(agreement_id: UUID, payload: RentalAgreementSendForSignature, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user)
    row = get_agreement(db, tenant_id, agreement_id, lock=True)
    if row.status != "Draft":
        raise HTTPException(409, "Only a draft agreement can be sent for signature.")
    # Portal delivery is optional: walk-in customers can receive the agreement
    # document directly and return the executed copy without a portal account.
    if not payload.agreement_document_url.strip():
        raise HTTPException(400, "Agreement document URL is required.")
    row.agreement_document_url = payload.agreement_document_url.strip()
    row.status = "Pending Signature"
    notify_rental_customer(db, row, "Rental agreement ready for your signature",
        f"Your rental agreement is ready. Review the terms and sign it in your Customer Portal.")
    log_audit(db, tenant_id, user_id, "UPDATE", "rental_agreements", row.id, "Rental agreement sent for signature", after_data={"status": row.status, "agreement_document_url": row.agreement_document_url})
    db.commit(); db.refresh(row); return row


@router.post("/agreements/{agreement_id}/record-walk-in-signature", response_model=RentalAgreementResponse, dependencies=[Depends(require_permission("booking.update"))])
def record_walk_in_signature(agreement_id: UUID, payload: RentalAgreementWalkInSignature,
                             db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user)
    row = get_agreement(db, tenant_id, agreement_id, lock=True)
    if row.status != "Pending Signature":
        raise HTTPException(409, "Only a pending-signature agreement can receive a walk-in signature record.")
    if not payload.witnessed:
        raise HTTPException(400, "A staff witness must confirm receipt of the executed document.")
    if not payload.signed_document_url.strip():
        raise HTTPException(400, "Upload or provide the executed agreement document URL.")
    row.customer_signed_at = datetime.utcnow()
    row.customer_signature_name = payload.signer_name.strip()
    row.customer_signature_method = "Wet Signature / Executed Document Uploaded"
    row.customer_signature_document_url = payload.signed_document_url.strip()
    log_audit(db, tenant_id, user_id, "UPDATE", "rental_agreements", row.id,
              "Recorded executed agreement for walk-in customer",
              after_data={"customer_signature_name": row.customer_signature_name,
                          "customer_signature_method": row.customer_signature_method,
                          "customer_signature_document_url": row.customer_signature_document_url})
    db.commit()
    db.refresh(row)
    return row


@router.post("/agreements/{agreement_id}/cancel", dependencies=[Depends(require_permission("booking.update"))])
def cancel_rental_agreement(agreement_id: UUID, payload: RentalAgreementCancel, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user)
    row = get_agreement(db, tenant_id, agreement_id, lock=True)
    if row.status not in ("Draft", "Pending Signature"):
        raise HTTPException(409, "Only a draft or pending-signature agreement can be cancelled through this endpoint.")
    row.status = "Cancelled"; row.notes = ((row.notes or "") + "\nCancellation: " + payload.reason.strip()).strip()
    log_audit(db, tenant_id, user_id, "UPDATE", "rental_agreements", row.id, "Cancelled rental agreement draft", after_data={"status": row.status, "reason": payload.reason})
    db.commit()
    return {"agreement_id": str(row.id), "status": row.status}


@router.post("/agreements/{agreement_id}/activate", response_model=RentalAgreementResponse, dependencies=[Depends(require_permission("booking.update"))])
def activate_rental_agreement(agreement_id: UUID, payload: RentalAgreementActivate, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user)
    row = get_agreement(db, tenant_id, agreement_id, lock=True)
    if row.status != "Pending Signature":
        raise HTTPException(409, "Send the agreement for signature before activating it.")
    if not row.customer_signed_at:
        raise HTTPException(409, "The customer must accept and sign the agreement through the Customer Portal before activation.")
    if not (payload.signed_at or row.signed_at):
        raise HTTPException(400, "The owner/staff signed agreement date is required before activation.")
    if not (payload.agreement_document_url or row.agreement_document_url):
        raise HTTPException(400, "A signed agreement document URL is required before activation.")
    verified_deposit = money(db.query(func.coalesce(func.sum(RentalPayment.amount), 0)).filter(RentalPayment.tenant_id == tenant_id, RentalPayment.agreement_id == row.id, RentalPayment.payment_type == "Deposit", RentalPayment.status == "Verified").scalar())
    if row.deposit_amount > ZERO and verified_deposit < money(row.deposit_amount):
        raise HTTPException(409, f"Verified security deposit is insufficient. Required {row.deposit_amount}; verified {verified_deposit}.")
    if payload.confirm_deposit_received and row.deposit_amount > verified_deposit:
        raise HTTPException(409, "Deposit confirmation cannot replace a verified deposit payment record.")
    row.signed_at = payload.signed_at or datetime.utcnow()
    row.agreement_document_url = payload.agreement_document_url or row.agreement_document_url
    row.status = "Active"
    row.activated_at = datetime.utcnow()
    row.approved_by = user_id
    prop = db.query(Property).filter(Property.id == row.property_id, Property.tenant_id == tenant_id).with_for_update().first()
    if not prop:
        raise HTTPException(409, "Property is no longer available.")
    if row.accepted_offer_id:
        accepted_offer = db.query(PropertyOffer).filter(
            PropertyOffer.id == row.accepted_offer_id,
            PropertyOffer.tenant_id == tenant_id,
            PropertyOffer.status == "Accepted",
        ).first()
        if not accepted_offer or (accepted_offer.expires_at and accepted_offer.expires_at <= datetime.utcnow()) or (accepted_offer.hold_expires_at and accepted_offer.hold_expires_at <= datetime.utcnow()):
            raise HTTPException(409, "The accepted offer or its property hold has expired. Obtain a renewed offer before activation.")
    if prop.status != "Available" and not (
        prop.status == "Reserved" and prop.offer_hold_expires_at and prop.offer_hold_expires_at > datetime.utcnow()
    ):
        raise HTTPException(409, "Property is no longer available.")
    prop.status = "Rented"
    schedule_through = row.agreement_end or add_months(row.agreement_start, 12)
    generate_schedule_rows(db, row, schedule_through)
    log_audit(db, tenant_id, user_id, "UPDATE", "rental_agreements", row.id, "Activated rental agreement", after_data={"status": row.status, "property_status": prop.status, "initial_schedule_through": schedule_through.isoformat()})
    try:
        db.commit(); db.refresh(row); return row
    except IntegrityError:
        db.rollback(); raise HTTPException(409, "The property already has an active rental agreement.")


@router.post("/agreements/{agreement_id}/generate-schedule", dependencies=[Depends(require_permission("booking.update"))])
def generate_rental_schedule(agreement_id: UUID, payload: RentalScheduleGenerate, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user)
    row = get_agreement(db, tenant_id, agreement_id, lock=True)
    if row.status not in ("Active", "Termination Requested"):
        raise HTTPException(409, "Payment schedules can be generated only for active agreements.")
    through = payload.through_date or row.agreement_end or add_months(row.agreement_start, 12)
    if row.agreement_end and through > row.agreement_end:
        through = row.agreement_end
    created = generate_schedule_rows(db, row, through)
    log_audit(db, tenant_id, user_id, "CREATE", "rental_payment_schedules", row.id, "Generated rental payment schedule", after_data={"created_count": created, "through_date": through.isoformat()})
    db.commit()
    return {"agreement_id": str(row.id), "created_count": created, "through_date": through.isoformat()}


@router.get("/agreements/{agreement_id}/schedule", dependencies=[Depends(require_permission("booking.view"))])
def list_rental_schedule(agreement_id: UUID, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, _ = identity(user); row = get_agreement(db, tenant_id, agreement_id)
    schedules = db.query(RentalPaymentSchedule).filter(RentalPaymentSchedule.tenant_id == tenant_id, RentalPaymentSchedule.agreement_id == row.id).order_by(RentalPaymentSchedule.sequence.asc()).all()
    for item in schedules:
        sync_schedule(db, tenant_id, item)
    db.commit()
    return [{"id": str(x.id), "sequence": x.sequence, "charge_type": x.charge_type, "period_start": x.period_start, "period_end": x.period_end, "due_date": x.due_date, "amount": x.amount, "late_fee_amount": x.late_fee_amount, "total_due": money(x.amount) + money(x.late_fee_amount), "paid": schedule_paid(db, tenant_id, x.id), "outstanding": max(ZERO, money(x.amount) + money(x.late_fee_amount) - schedule_paid(db, tenant_id, x.id)), "status": x.status} for x in schedules]


@router.post("/agreements/{agreement_id}/payments", response_model=RentalPaymentResponse, status_code=201, dependencies=[Depends(require_permission("booking.payment.create"))])
def create_rental_payment(agreement_id: UUID, payload: RentalPaymentCreate, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user); row = get_agreement(db, tenant_id, agreement_id)
    allowed_active_statuses = ("Active", "Expired", "Termination Requested")
    if row.status not in allowed_active_statuses and not (row.status == "Pending Signature" and payload.payment_type == "Deposit"):
        raise HTTPException(409, "Only a pending-signature agreement can receive its initial deposit; recurring payments require an active agreement.")
    if row.status == "Pending Signature" and payload.payment_type == "Deposit" and not row.customer_signed_at:
        raise HTTPException(409, "The customer must sign the agreement before the initial deposit is recorded.")
    schedule = None
    if payload.schedule_id:
        schedule = db.query(RentalPaymentSchedule).filter(RentalPaymentSchedule.id == payload.schedule_id, RentalPaymentSchedule.tenant_id == tenant_id, RentalPaymentSchedule.agreement_id == row.id).first()
        if not schedule: raise HTTPException(404, "Rental payment schedule item not found.")
        if payload.payment_type != schedule.charge_type: raise HTTPException(400, f"This schedule item accepts {schedule.charge_type} payments only.")
        sync_schedule(db, tenant_id, schedule)
        reserved = money(db.query(func.coalesce(func.sum(RentalPayment.amount), 0)).filter(RentalPayment.tenant_id == tenant_id, RentalPayment.schedule_id == schedule.id, RentalPayment.status.in_(("Pending", "Under Verification", "Verified"))).scalar())
        total_due = money(schedule.amount) + money(schedule.late_fee_amount)
        if money(payload.amount) + reserved > total_due: raise HTTPException(400, f"Payment exceeds the remaining scheduled amount including late fees ({max(ZERO, total_due - reserved)}).")
    if payload.payment_type == "Deposit":
        reserved_deposit = money(db.query(func.coalesce(func.sum(RentalPayment.amount), 0)).filter(RentalPayment.tenant_id == tenant_id, RentalPayment.agreement_id == row.id, RentalPayment.payment_type == "Deposit", RentalPayment.status.in_(("Pending", "Under Verification", "Verified"))).scalar())
        if reserved_deposit + money(payload.amount) > money(row.deposit_amount): raise HTTPException(400, "Deposit payment exceeds the agreed security deposit.")
    payment = RentalPayment(tenant_id=tenant_id, agreement_id=row.id, schedule_id=schedule.id if schedule else None, settlement_id=None, payment_type=payload.payment_type, amount=payload.amount, payment_method=payload.payment_method, transaction_reference=payload.transaction_reference, proof_document_url=payload.proof_document_url, payment_date=payload.payment_date, status="Under Verification", created_by=user_id, notes=payload.notes)
    db.add(payment); db.commit(); db.refresh(payment); return payment


@router.get("/agreements/{agreement_id}/payments", response_model=list[RentalPaymentResponse], dependencies=[Depends(require_permission("booking.payment.view"))])
def list_rental_payments(agreement_id: UUID, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, _ = identity(user); row = get_agreement(db, tenant_id, agreement_id)
    return db.query(RentalPayment).filter(RentalPayment.tenant_id == tenant_id, RentalPayment.agreement_id == row.id).order_by(RentalPayment.created_at.desc()).all()


@router.post("/payments/{payment_id}/decision", response_model=RentalPaymentResponse, dependencies=[Depends(require_permission("booking.payment.verify"))])
def decide_rental_payment(payment_id: UUID, payload: RentalPaymentDecision, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user)
    payment = db.query(RentalPayment).filter(RentalPayment.id == payment_id, RentalPayment.tenant_id == tenant_id).with_for_update().first()
    if not payment: raise HTTPException(404, "Rental payment not found.")
    if payment.status not in ("Pending", "Under Verification"): raise HTTPException(409, "This payment has already been processed.")
    payment.status = payload.decision; payment.verified_by = user_id; payment.verified_at = datetime.utcnow(); payment.notes = payload.notes or payment.notes
    if payload.decision == "Verified":
        if not payment.receipt_number:
            payment.receipt_number = f"RNT-{datetime.utcnow():%Y%m%d}-{payment.id.hex[:8].upper()}"
        if payment.payment_type == "Deposit":
            exists = db.query(RentalDepositTransaction.id).filter(RentalDepositTransaction.payment_id == payment.id, RentalDepositTransaction.status == "Posted").first()
            if not exists:
                db.add(RentalDepositTransaction(tenant_id=tenant_id, agreement_id=payment.agreement_id, payment_id=payment.id, direction="Credit", transaction_type="Deposit Received", amount=payment.amount, status="Posted", description="Verified security deposit payment", reference=payment.transaction_reference, created_by=user_id))
        if payment.schedule_id:
            schedule = db.query(RentalPaymentSchedule).filter(RentalPaymentSchedule.id == payment.schedule_id, RentalPaymentSchedule.tenant_id == tenant_id).with_for_update().first()
            if schedule: sync_schedule(db, tenant_id, schedule)
        if payment.settlement_id:
            settlement = db.query(RentalSettlement).filter(RentalSettlement.id == payment.settlement_id, RentalSettlement.tenant_id == tenant_id).with_for_update().first()
            if settlement:
                collected = money(db.query(func.coalesce(func.sum(RentalPayment.amount), 0)).filter(RentalPayment.tenant_id == tenant_id, RentalPayment.settlement_id == settlement.id, RentalPayment.status == "Verified").scalar())
                settlement.status = "Collected" if collected >= money(settlement.amount_due_from_tenant) else "Partially Collected"
    agreement = get_agreement(db, tenant_id, payment.agreement_id)
    notify_rental_customer(db, agreement, f"Rental payment {payload.decision.lower()}",
        f"Your {payment.payment_type.lower()} payment of {payment.amount} was {payload.decision.lower()} by the property team.", payment.id)
    log_audit(db, tenant_id, user_id, "UPDATE", "rental_payments", payment.id, f"Rental payment {payload.decision.lower()}", after_data={"status": payment.status, "amount": str(payment.amount)})
    db.commit(); db.refresh(payment); return payment


@router.get("/payments/{payment_id}/receipt", dependencies=[Depends(require_permission("booking.payment.view"))])
def read_rental_payment_receipt(payment_id: UUID, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, _ = identity(user)
    payment = db.query(RentalPayment).filter(RentalPayment.id == payment_id, RentalPayment.tenant_id == tenant_id).first()
    if not payment: raise HTTPException(404, "Rental payment not found.")
    if payment.status != "Verified" or not payment.receipt_number:
        raise HTTPException(409, "A receipt is available only after payment verification.")
    agreement = get_agreement(db, tenant_id, payment.agreement_id)
    prop = db.query(Property).filter(Property.id == agreement.property_id, Property.tenant_id == tenant_id).first()
    return {"receipt_number": payment.receipt_number, "payment_id": str(payment.id), "agreement_id": str(agreement.id), "customer_name": agreement.customer_name, "property_id": str(agreement.property_id), "payment_type": payment.payment_type, "amount": payment.amount, "currency": prop.currency if prop else "INR", "payment_method": payment.payment_method, "transaction_reference": payment.transaction_reference, "payment_date": payment.payment_date, "verified_at": payment.verified_at, "notes": payment.notes}


@router.get("/agreements/{agreement_id}/deposit", dependencies=[Depends(require_permission("booking.view"))])
def read_deposit_ledger(agreement_id: UUID, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, _ = identity(user); row = get_agreement(db, tenant_id, agreement_id)
    items = db.query(RentalDepositTransaction).filter(RentalDepositTransaction.tenant_id == tenant_id, RentalDepositTransaction.agreement_id == row.id).order_by(RentalDepositTransaction.created_at.asc()).all()
    balance = ZERO; result = []
    for item in items:
        if item.status == "Posted": balance += money(item.amount) if item.direction == "Credit" else -money(item.amount)
        result.append({"id": str(item.id), "direction": item.direction, "transaction_type": item.transaction_type, "amount": item.amount, "status": item.status, "description": item.description, "reference": item.reference, "created_at": item.created_at, "running_balance": money(balance)})
    return {"agreement_id": str(row.id), "agreed_deposit": row.deposit_amount, "current_balance": money(balance), "transactions": result}


@router.post("/agreements/{agreement_id}/deposit-transactions", dependencies=[Depends(require_permission("booking.update"))])
def create_deposit_transaction(agreement_id: UUID, payload: RentalDepositTransactionCreate, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user); row = get_agreement(db, tenant_id, agreement_id, lock=True)
    if payload.direction == "Credit" and payload.transaction_type != "Deposit Adjustment":
        raise HTTPException(400, "Manual credits must be Deposit Adjustment entries. Deposit Received entries are created only from verified deposit payments.")
    if payload.direction == "Debit" and payload.transaction_type in ("Deposit Received",):
        raise HTTPException(400, "Deposit Received must be a credit.")
    current_balance = deposit_balance(db, tenant_id, row.id)
    if payload.direction == "Debit" and money(payload.amount) > current_balance:
        raise HTTPException(409, "This debit exceeds the available security deposit balance.")
    if payload.direction == "Credit" and money(payload.amount) + current_balance > money(row.deposit_amount):
        raise HTTPException(409, "Deposit adjustment would exceed the agreed security deposit amount.")
    tx = RentalDepositTransaction(tenant_id=tenant_id, agreement_id=row.id, direction=payload.direction, transaction_type=payload.transaction_type, amount=payload.amount, status="Posted", description=payload.description, reference=payload.reference, created_by=user_id)
    db.add(tx); db.flush(); log_audit(db, tenant_id, user_id, "CREATE", "rental_deposit_transactions", tx.id, "Recorded security deposit ledger transaction", after_data={"direction": tx.direction, "amount": str(tx.amount), "type": tx.transaction_type})
    db.commit(); db.refresh(tx); return {"id": str(tx.id), "balance": deposit_balance(db, tenant_id, row.id)}


@router.post("/agreements/{agreement_id}/exit-requests", status_code=201, dependencies=[Depends(require_permission("booking.update"))])
def create_exit_request(agreement_id: UUID, payload: RentalExitRequestCreate, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user); row = get_agreement(db, tenant_id, agreement_id, lock=True)
    if row.status not in ("Active", "Expired"): raise HTTPException(409, "Only an active or expired-but-not-handed-over agreement can receive a tenant exit request.")
    if payload.requested_vacate_date < date.today(): raise HTTPException(400, "Requested vacate date cannot be in the past.")
    if payload.notice_served_date and payload.notice_served_date > date.today(): raise HTTPException(400, "Notice served date cannot be in the future.")
    existing = db.query(RentalExitRequest).filter(RentalExitRequest.tenant_id == tenant_id, RentalExitRequest.agreement_id == row.id, RentalExitRequest.status.in_(ACTIVE_EXIT_STATUSES)).first()
    if existing: raise HTTPException(409, "An open exit request already exists for this agreement.")
    exit_row = RentalExitRequest(tenant_id=tenant_id, agreement_id=row.id, requested_vacate_date=payload.requested_vacate_date, notice_served_date=payload.notice_served_date or date.today(), reason=payload.reason, status="Requested", created_by=user_id)
    row.status = "Termination Requested"
    db.add(exit_row); db.flush()
    log_audit(db, tenant_id, user_id, "CREATE", "rental_exit_requests", exit_row.id, "Tenant exit request created", after_data={"requested_vacate_date": exit_row.requested_vacate_date.isoformat(), "status": exit_row.status})
    db.commit(); db.refresh(exit_row)
    lock_in_end = lock_in_end_date(row.agreement_start, row.lock_in_months)
    notice_required_by = exit_row.notice_served_date + timedelta(days=row.notice_period_days)
    return {"id": str(exit_row.id), "agreement_id": str(row.id), "status": exit_row.status, "requested_vacate_date": exit_row.requested_vacate_date, "inside_lock_in": payload.requested_vacate_date < lock_in_end, "lock_in_end_date": lock_in_end, "lock_in_months_remaining": max(0, (lock_in_end.year - payload.requested_vacate_date.year) * 12 + lock_in_end.month - payload.requested_vacate_date.month) if payload.requested_vacate_date < lock_in_end else 0, "notice_required_by": notice_required_by, "notice_shortfall_days": max(0, (notice_required_by - payload.requested_vacate_date).days)}


@router.post("/exit-requests/{exit_request_id}/decision", dependencies=[Depends(require_permission("booking.update"))])
def decide_exit_request(exit_request_id: UUID, payload: RentalExitDecision, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user)
    row = db.query(RentalExitRequest).filter(RentalExitRequest.id == exit_request_id, RentalExitRequest.tenant_id == tenant_id).with_for_update().first()
    if not row: raise HTTPException(404, "Rental exit request not found.")
    if row.status not in ("Requested", "Under Review"): raise HTTPException(409, "This exit request has already been decided.")
    agreement = get_agreement(db, tenant_id, row.agreement_id, lock=True)
    lock_in_end = lock_in_end_date(agreement.agreement_start, agreement.lock_in_months)
    inside_lock_in = row.requested_vacate_date < lock_in_end
    if payload.decision == "Approved" and inside_lock_in and not payload.early_exit_approved:
        raise HTTPException(409, "This request is inside the lock-in period. Explicitly approve an early-exit exception or reject the request.")
    row.status = "Inspection Pending" if payload.decision == "Approved" else "Rejected"
    notice_required_by = row.notice_served_date + timedelta(days=agreement.notice_period_days) if row.notice_served_date else row.requested_vacate_date
    notice_shortfall = row.requested_vacate_date < notice_required_by
    if payload.decision == "Approved" and notice_shortfall and not payload.notice_period_waived:
        raise HTTPException(409, "The requested vacate date does not satisfy the notice period. Explicitly waive the shortfall or reject the request.")
    row.early_exit_approved = payload.early_exit_approved if payload.decision == "Approved" else False
    row.early_exit_charge = payload.early_exit_charge if payload.decision == "Approved" else ZERO
    row.notice_period_waived = payload.notice_period_waived if payload.decision == "Approved" else False
    row.notice_shortfall_charge = payload.notice_shortfall_charge if payload.decision == "Approved" else ZERO
    row.decision_notes = payload.decision_notes; row.decided_by = user_id; row.decided_at = datetime.utcnow()
    if payload.decision == "Rejected":
        row.active_request_key = "CLOSED"; agreement.status = "Active"
    log_audit(db, tenant_id, user_id, "UPDATE", "rental_exit_requests", row.id, f"Rental exit request {payload.decision.lower()}", after_data={"status": row.status, "inside_lock_in": inside_lock_in, "early_exit_approved": row.early_exit_approved, "early_exit_charge": str(row.early_exit_charge), "notice_period_waived": row.notice_period_waived, "notice_shortfall_charge": str(row.notice_shortfall_charge)})
    db.commit()
    return {"id": str(row.id), "status": row.status, "inside_lock_in": inside_lock_in, "lock_in_end_date": lock_in_end, "early_exit_charge": row.early_exit_charge}


@router.post("/agreements/{agreement_id}/inspections", status_code=201, dependencies=[Depends(require_permission("booking.update"))])
def create_rental_inspection(agreement_id: UUID, payload: RentalInspectionCreate, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user); agreement = get_agreement(db, tenant_id, agreement_id)
    exit_row = None
    if payload.exit_request_id:
        exit_row = db.query(RentalExitRequest).filter(RentalExitRequest.id == payload.exit_request_id, RentalExitRequest.tenant_id == tenant_id, RentalExitRequest.agreement_id == agreement.id).first()
        if not exit_row: raise HTTPException(404, "Exit request not found for this agreement.")
        if payload.inspection_type == "Move Out" and exit_row.status != "Inspection Pending": raise HTTPException(409, "Move-out inspection requires an approved exit request.")
    inspection = RentalInspection(tenant_id=tenant_id, agreement_id=agreement.id, exit_request_id=exit_row.id if exit_row else None, inspection_type=payload.inspection_type, condition=payload.condition, damage_details=payload.damage_details, damage_amount=payload.damage_amount, photographs=payload.photographs, meter_readings=payload.meter_readings, inspected_by=user_id, tenant_acknowledged=payload.tenant_acknowledged, notes=payload.notes)
    db.add(inspection)
    db.flush()
    if exit_row and payload.inspection_type == "Move Out": exit_row.status = "Settlement Pending"
    log_audit(db, tenant_id, user_id, "CREATE", "rental_inspections", inspection.id, f"Created {payload.inspection_type.lower()} inspection", after_data={"condition": inspection.condition, "damage_amount": str(inspection.damage_amount)})
    db.commit(); db.refresh(inspection)
    return inspection


@router.get("/agreements/{agreement_id}/inspections", dependencies=[Depends(require_permission("booking.view"))])
def list_rental_inspections(agreement_id: UUID, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, _ = identity(user); agreement = get_agreement(db, tenant_id, agreement_id)
    return db.query(RentalInspection).filter(
        RentalInspection.tenant_id == tenant_id,
        RentalInspection.agreement_id == agreement.id,
    ).order_by(RentalInspection.inspected_at.asc()).all()


@router.post("/agreements/{agreement_id}/settlement/calculate", response_model=RentalSettlementResponse, dependencies=[Depends(require_permission("booking.update"))])
def calculate_rental_settlement(agreement_id: UUID, payload: RentalSettlementCalculate, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user); agreement = get_agreement(db, tenant_id, agreement_id, lock=True)
    exit_row = db.query(RentalExitRequest).filter(RentalExitRequest.id == payload.exit_request_id, RentalExitRequest.tenant_id == tenant_id, RentalExitRequest.agreement_id == agreement.id, RentalExitRequest.status == "Settlement Pending").first()
    if not exit_row: raise HTTPException(409, "An approved exit request with a completed move-out inspection is required.")
    inspection = db.query(RentalInspection).filter(RentalInspection.tenant_id == tenant_id, RentalInspection.agreement_id == agreement.id, RentalInspection.exit_request_id == exit_row.id, RentalInspection.inspection_type == "Move Out").order_by(RentalInspection.inspected_at.desc()).first()
    if not inspection: raise HTTPException(409, "Move-out inspection is required before settlement.")
    balance = deposit_balance(db, tenant_id, agreement.id)
    schedules = db.query(RentalPaymentSchedule).filter(RentalPaymentSchedule.tenant_id == tenant_id, RentalPaymentSchedule.agreement_id == agreement.id, RentalPaymentSchedule.due_date <= exit_row.requested_vacate_date, RentalPaymentSchedule.status != "Cancelled").all()
    arrears = ZERO
    for item in schedules: arrears += max(ZERO, money(item.amount) - schedule_paid(db, tenant_id, item.id))
    damage = money(inspection.damage_amount)
    early = money(exit_row.early_exit_charge)
    notice_charge = money(exit_row.notice_shortfall_charge + payload.notice_shortfall_charge)
    utilities = money(payload.utility_charges); other = money(payload.other_charges)
    calculation = calculate_deposit_settlement(
        deposit_balance=balance, rent_arrears=arrears, utility_charges=utilities,
        damage_charges=damage, early_exit_charge=early,
        notice_shortfall_charge=notice_charge, other_charges=other,
    )
    deductions = calculation["deductions_total"]
    refund = calculation["refund_amount"]
    due = calculation["amount_due_from_tenant"]
    snapshot = {"calculated_at": datetime.utcnow().isoformat(), "exit_date": exit_row.requested_vacate_date.isoformat(), "deposit_ledger_balance": str(balance), "rent_arrears": str(arrears), "damage_charges": str(damage), "early_exit_charge": str(early), "notice_shortfall_charge": str(notice_charge), "utility_charges": str(utilities), "other_charges": str(other), "deductions_total": str(deductions), "refund_amount": str(refund), "amount_due_from_tenant": str(due), "move_out_inspection_id": str(inspection.id)}
    settlement = db.query(RentalSettlement).filter(RentalSettlement.tenant_id == tenant_id, RentalSettlement.agreement_id == agreement.id).with_for_update().first()
    if settlement and settlement.status not in ("Draft", "Under Review"):
        raise HTTPException(409, "An approved or completed settlement cannot be recalculated.")
    if not settlement:
        settlement = RentalSettlement(tenant_id=tenant_id, agreement_id=agreement.id, exit_request_id=exit_row.id)
        db.add(settlement)
        db.flush()
    settlement.deposit_balance = balance; settlement.rent_arrears = arrears; settlement.utility_charges = utilities; settlement.damage_charges = damage; settlement.early_exit_charge = early; settlement.notice_shortfall_charge = notice_charge; settlement.other_charges = other; settlement.deductions_total = deductions; settlement.refund_amount = refund; settlement.amount_due_from_tenant = due; settlement.status = "Under Review"; settlement.calculation_snapshot = snapshot; settlement.notes = payload.notes
    log_audit(db, tenant_id, user_id, "UPDATE", "rental_settlements", settlement.id, "Calculated rental deposit settlement", after_data=snapshot)
    db.commit(); db.refresh(settlement); return settlement


@router.post("/settlements/{settlement_id}/approve", response_model=RentalSettlementResponse, dependencies=[Depends(require_permission("booking.update"))])
def approve_rental_settlement(settlement_id: UUID, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user)
    row = db.query(RentalSettlement).filter(RentalSettlement.id == settlement_id, RentalSettlement.tenant_id == tenant_id).with_for_update().first()
    if not row: raise HTTPException(404, "Rental settlement not found.")
    if row.status != "Under Review": raise HTTPException(409, "Only a settlement under review can be approved.")
    row.status = "Approved" if row.refund_amount > ZERO else ("Amount Due" if row.amount_due_from_tenant > ZERO else "Refunded")
    row.approved_by = user_id; row.approved_at = datetime.utcnow()
    log_audit(db, tenant_id, user_id, "UPDATE", "rental_settlements", row.id, "Approved rental settlement", after_data={"status": row.status, "refund_amount": str(row.refund_amount), "amount_due_from_tenant": str(row.amount_due_from_tenant)})
    db.commit(); db.refresh(row); return row


@router.post("/settlements/{settlement_id}/refund", response_model=RentalSettlementResponse, dependencies=[Depends(require_permission("booking.update"))])
def record_rental_refund(settlement_id: UUID, payload: RentalRefundCreate, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user)
    row = db.query(RentalSettlement).filter(RentalSettlement.id == settlement_id, RentalSettlement.tenant_id == tenant_id).with_for_update().first()
    if not row: raise HTTPException(404, "Rental settlement not found.")
    if row.status not in ("Approved", "Partially Refunded"): raise HTTPException(409, "Settlement must be approved before recording a refund.")
    refunded = money(db.query(func.coalesce(func.sum(RentalDepositTransaction.amount), 0)).filter(RentalDepositTransaction.tenant_id == tenant_id, RentalDepositTransaction.settlement_id == row.id, RentalDepositTransaction.direction == "Debit", RentalDepositTransaction.transaction_type == "Refund", RentalDepositTransaction.status == "Posted").scalar())
    remaining = max(ZERO, money(row.refund_amount - refunded))
    if money(payload.amount) > remaining: raise HTTPException(400, f"Refund exceeds remaining approved amount {remaining}.")
    available = deposit_balance(db, tenant_id, row.agreement_id)
    if money(payload.amount) > available: raise HTTPException(409, "Refund exceeds the remaining deposit ledger balance.")
    db.add(RentalDepositTransaction(tenant_id=tenant_id, agreement_id=row.agreement_id, settlement_id=row.id, direction="Debit", transaction_type="Refund", amount=payload.amount, status="Posted", description=payload.notes or "Security deposit refund paid to tenant", reference=payload.reference, created_by=user_id))
    refunded += money(payload.amount)
    row.refund_reference = payload.reference
    row.refunded_at = datetime.utcnow() if refunded >= money(row.refund_amount) else None
    row.status = "Refunded" if refunded >= money(row.refund_amount) else "Partially Refunded"
    log_audit(db, tenant_id, user_id, "CREATE", "rental_deposit_transactions", row.id, "Recorded security deposit refund", after_data={"amount": str(payload.amount), "total_refunded": str(refunded), "status": row.status})
    db.commit(); db.refresh(row); return row


@router.post("/settlements/{settlement_id}/collect", response_model=RentalPaymentResponse, status_code=201, dependencies=[Depends(require_permission("booking.payment.create"))])
def collect_rental_settlement_amount(settlement_id: UUID, payload: RentalSettlementCollectionCreate, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user)
    settlement = db.query(RentalSettlement).filter(RentalSettlement.id == settlement_id, RentalSettlement.tenant_id == tenant_id).with_for_update().first()
    if not settlement:
        raise HTTPException(404, "Rental settlement not found.")
    if settlement.status not in ("Amount Due", "Partially Collected"):
        raise HTTPException(409, "This settlement does not have an outstanding amount to collect.")
    collected = money(db.query(func.coalesce(func.sum(RentalPayment.amount), 0)).filter(RentalPayment.tenant_id == tenant_id, RentalPayment.settlement_id == settlement.id, RentalPayment.status.in_(("Pending", "Under Verification", "Verified"))).scalar())
    remaining = max(ZERO, money(settlement.amount_due_from_tenant - collected))
    if money(payload.amount) > remaining:
        raise HTTPException(400, f"Collection exceeds the remaining settlement amount {remaining}.")
    payment = RentalPayment(tenant_id=tenant_id, agreement_id=settlement.agreement_id, settlement_id=settlement.id, payment_type="Other", amount=payload.amount, payment_method=payload.payment_method, transaction_reference=payload.transaction_reference, payment_date=payload.payment_date, status="Under Verification", created_by=user_id, notes=payload.notes or "Rental move-out settlement collection")
    db.add(payment); db.commit(); db.refresh(payment); return payment


@router.post("/exit-requests/{exit_request_id}/complete-handover", dependencies=[Depends(require_permission("booking.update"))])
def complete_rental_handover(exit_request_id: UUID, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user)
    exit_row = db.query(RentalExitRequest).filter(RentalExitRequest.id == exit_request_id, RentalExitRequest.tenant_id == tenant_id).with_for_update().first()
    if not exit_row: raise HTTPException(404, "Rental exit request not found.")
    if exit_row.status != "Settlement Pending": raise HTTPException(409, "Move-out inspection and settlement calculation are required before handover closure.")
    agreement = get_agreement(db, tenant_id, exit_row.agreement_id, lock=True)
    settlement = db.query(RentalSettlement).filter(RentalSettlement.tenant_id == tenant_id, RentalSettlement.agreement_id == agreement.id).first()
    if not settlement or settlement.status not in ("Approved", "Partially Refunded", "Refunded", "Amount Due", "Partially Collected", "Collected"):
        raise HTTPException(409, "Final settlement must be approved before closing the rental handover.")
    prop = db.query(Property).filter(Property.id == agreement.property_id, Property.tenant_id == tenant_id).with_for_update().first()
    agreement.status = "Terminated"; exit_row.status = "Closed"; exit_row.active_request_key = "CLOSED"
    if prop: prop.status = "Available"
    log_audit(db, tenant_id, user_id, "UPDATE", "rental_agreements", agreement.id, "Completed tenant move-out and released property", after_data={"agreement_status": agreement.status, "property_status": prop.status if prop else None, "settlement_status": settlement.status})
    db.commit()
    return {"agreement_id": str(agreement.id), "exit_request_id": str(exit_row.id), "agreement_status": agreement.status, "property_status": prop.status if prop else None, "settlement_status": settlement.status}


@router.post("/agreements/{agreement_id}/renewals", status_code=201, dependencies=[Depends(require_permission("booking.update"))])
def request_rental_renewal(agreement_id: UUID, payload: RentalRenewalCreate, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user); agreement = get_agreement(db, tenant_id, agreement_id, lock=True)
    if agreement.status not in ("Active", "Expired"): raise HTTPException(409, "Only active or expired agreements can be renewed.")
    if agreement.agreement_end is None: raise HTTPException(400, "An open-ended agreement does not require a fixed-term renewal.")
    if payload.new_end_date <= agreement.agreement_end: raise HTTPException(400, "Renewal end date must be after the current end date.")
    current = db.query(func.coalesce(func.max(RentalAgreementRevision.revision_number), 0)).filter(RentalAgreementRevision.tenant_id == tenant_id, RentalAgreementRevision.agreement_id == agreement.id).scalar()
    revision = RentalAgreementRevision(tenant_id=tenant_id, agreement_id=agreement.id, revision_number=int(current or 0) + 1, revision_type="Renewal", old_end_date=agreement.agreement_end, new_end_date=payload.new_end_date, old_rent_amount=agreement.rent_amount, new_rent_amount=payload.new_rent_amount, reason=payload.reason, status="Pending", requested_by=user_id)
    db.add(revision); db.commit(); db.refresh(revision)
    return revision


@router.post("/renewals/{revision_id}/decision", dependencies=[Depends(require_permission("booking.update"))])
def decide_rental_renewal(revision_id: UUID, payload: RentalRenewalDecision, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, user_id = identity(user)
    revision = db.query(RentalAgreementRevision).filter(RentalAgreementRevision.id == revision_id, RentalAgreementRevision.tenant_id == tenant_id).with_for_update().first()
    if not revision: raise HTTPException(404, "Rental renewal request not found.")
    if revision.status != "Pending": raise HTTPException(409, "This renewal request has already been decided.")
    agreement = get_agreement(db, tenant_id, revision.agreement_id, lock=True)
    revision.status = payload.decision; revision.decided_by = user_id; revision.decided_at = datetime.utcnow()
    if payload.decision == "Approved":
        old_end = agreement.agreement_end
        agreement.agreement_end = revision.new_end_date; agreement.rent_amount = revision.new_rent_amount; agreement.status = "Active"
        agreement.escalation_base_date = old_end + timedelta(days=1)
        generate_schedule_rows(db, agreement, revision.new_end_date, start_from=old_end + timedelta(days=1))
    log_audit(db, tenant_id, user_id, "UPDATE", "rental_agreement_revisions", revision.id, f"Rental renewal {payload.decision.lower()}", after_data={"status": revision.status, "new_end_date": revision.new_end_date.isoformat(), "new_rent_amount": str(revision.new_rent_amount), "notes": payload.notes})
    db.commit()
    return {"revision_id": str(revision.id), "status": revision.status, "agreement_id": str(agreement.id), "agreement_end": agreement.agreement_end, "rent_amount": agreement.rent_amount}


@router.get("/exit-requests", dependencies=[Depends(require_permission("booking.view"))])
def list_rental_exit_requests(status_filter: str | None = Query(default=None, alias="status"), db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, _ = identity(user)
    q = db.query(RentalExitRequest).filter(RentalExitRequest.tenant_id == tenant_id)
    if status_filter: q = q.filter(RentalExitRequest.status == status_filter)
    return q.order_by(RentalExitRequest.created_at.desc()).all()


@router.get("/settlements", dependencies=[Depends(require_permission("booking.view"))])
def list_rental_settlements(status_filter: str | None = Query(default=None, alias="status"), db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, _ = identity(user)
    q = db.query(RentalSettlement).filter(RentalSettlement.tenant_id == tenant_id)
    if status_filter: q = q.filter(RentalSettlement.status == status_filter)
    return q.order_by(RentalSettlement.created_at.desc()).all()


@router.get("/settlements/{settlement_id}", response_model=RentalSettlementResponse, dependencies=[Depends(require_permission("booking.view"))])
def read_rental_settlement(settlement_id: UUID, db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, _ = identity(user)
    row = db.query(RentalSettlement).filter(RentalSettlement.id == settlement_id, RentalSettlement.tenant_id == tenant_id).first()
    if not row: raise HTTPException(404, "Rental settlement not found.")
    return row


@router.get("/renewals", dependencies=[Depends(require_permission("booking.view"))])
def list_rental_renewals(status_filter: str | None = Query(default=None, alias="status"), db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, _ = identity(user)
    q = db.query(RentalAgreementRevision).filter(RentalAgreementRevision.tenant_id == tenant_id, RentalAgreementRevision.revision_type == "Renewal")
    if status_filter: q = q.filter(RentalAgreementRevision.status == status_filter)
    return q.order_by(RentalAgreementRevision.created_at.desc()).all()


@router.get("/dashboard/summary", dependencies=[Depends(require_permission("booking.view"))])
def rental_dashboard_summary(db: Session = Depends(get_db), user=Depends(require_active_user)):
    tenant_id, _ = identity(user); today = date.today(); next_30 = today + timedelta(days=30)
    active = db.query(RentalAgreement).filter(RentalAgreement.tenant_id == tenant_id, RentalAgreement.status == "Active").count()
    expiring = db.query(RentalAgreement).filter(RentalAgreement.tenant_id == tenant_id, RentalAgreement.status == "Active", RentalAgreement.agreement_end.is_not(None), RentalAgreement.agreement_end <= next_30, RentalAgreement.agreement_end >= today).count()
    open_exits = db.query(RentalExitRequest).filter(RentalExitRequest.tenant_id == tenant_id, RentalExitRequest.status.in_(ACTIVE_EXIT_STATUSES)).count()
    due_schedules = db.query(RentalPaymentSchedule).filter(
        RentalPaymentSchedule.tenant_id == tenant_id,
        RentalPaymentSchedule.status.in_(("Pending", "Partially Paid", "Overdue")),
    ).all()
    for item in due_schedules:
        sync_schedule(db, tenant_id, item)
    db.commit()
    overdue = sum(1 for item in due_schedules if item.status == "Overdue" and item.due_date < today)
    deposit_rows = db.query(RentalAgreement.id).filter(RentalAgreement.tenant_id == tenant_id, RentalAgreement.status.in_(("Active", "Termination Requested"))).all()
    liability = sum((deposit_balance(db, tenant_id, item.id) for item in deposit_rows), ZERO)
    due_rows = [item for item in due_schedules if item.charge_type == "Rent" and today.replace(day=1) <= item.due_date <= next_30]
    due_today_month = sum((money(item.amount) + money(item.late_fee_amount) for item in due_rows), ZERO)
    verified_rent = money(db.query(func.coalesce(func.sum(RentalPayment.amount), 0)).filter(
        RentalPayment.tenant_id == tenant_id, RentalPayment.payment_type == "Rent", RentalPayment.status == "Verified",
    ).scalar())
    outstanding_schedules = db.query(RentalPaymentSchedule).filter(
        RentalPaymentSchedule.tenant_id == tenant_id,
        RentalPaymentSchedule.charge_type == "Rent",
        RentalPaymentSchedule.status.in_(("Pending", "Partially Paid", "Overdue")),
    ).all()
    outstanding_rent = sum((max(ZERO, money(item.amount) + money(item.late_fee_amount) - schedule_paid(db, tenant_id, item.id)) for item in outstanding_schedules), ZERO)
    return {"active_agreements": active, "agreements_expiring_next_30_days": expiring, "open_exit_requests": open_exits, "overdue_schedule_items": overdue, "security_deposit_liability": money(liability), "verified_rent_collected_lifetime": verified_rent, "outstanding_rent": money(outstanding_rent), "scheduled_rent_next_30_days": money(due_today_month)}
