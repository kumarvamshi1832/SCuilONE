from datetime import datetime
from decimal import Decimal
from uuid import UUID
from app.models.payment import Payment
from app.core.industry_modules import require_enabled_module
from app.models.payment_refund import PaymentRefund
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.models.buyer_requirement import BuyerRequirement
from app.models.lead import Lead
from app.models.payment_plan import PaymentPlan
from app.models.customer_booking_journey import CustomerBookingRequest
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.booking import Booking, BookingNominee
from app.models.property import Property
from app.models.deal import Deal
from app.models.pipeline import Pipeline, PipelineStage
from app.schemas.booking import (
    BookingCancel,
    BookingCreate,
    BookingResponse,
    BookingUpdate,
    BookingNomineeInput,
    validate_nominee_allocations,
)
from app.services.audit_service import log_audit
from app.services.customer_portal_notifications import notify_booking_customer


router = APIRouter(
    prefix="/api/v1/bookings",
    tags=["Bookings"],
    dependencies=[
        Depends(require_enabled_module("bookings")),
    ],
)

ACTIVE_BOOKING_STATUSES = ("Pending", "Confirmed")


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_tenant_and_user(current_user: dict):
    try:
        return (
            UUID(str(current_user["tenant_id"])),
            UUID(str(current_user["user_id"])),
        )
    except (KeyError, TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authenticated user context.",
        )


def booking_snapshot(booking: Booking) -> dict:
    return {
        "id": booking.id,
        "tenant_id": booking.tenant_id,
        "property_id": booking.property_id,
        "lead_id": booking.lead_id,
        "buyer_requirement_id": booking.buyer_requirement_id,
        "buyer_name": booking.buyer_name,
        "buyer_email": booking.buyer_email,
        "buyer_phone": booking.buyer_phone,
        "buyer_address": booking.buyer_address,
        "buyer_details_submitted_at": booking.buyer_details_submitted_at,
        "agreed_price": booking.agreed_price,
        "nominees": [{"id": n.id, "tenant_id": n.tenant_id, "booking_id": n.booking_id, "nominee_name": n.nominee_name, "relationship": n.relationship, "phone": n.phone, "email": n.email, "date_of_birth": n.date_of_birth, "address": n.address, "allocation_percentage": n.allocation_percentage, "remarks": n.remarks, "created_at": n.created_at, "updated_at": n.updated_at} for n in booking.nominees],
        "payment_preference": booking.payment_preference,
        "installment_request_notes": booking.installment_request_notes,
        "booking_amount": booking.booking_amount,
        "refund_amount": booking.refund_amount,
        "status": booking.status,
        "booking_date": booking.booking_date,
        "cancellation_reason": booking.cancellation_reason,
        "created_by": booking.created_by,
    }


def get_booking_or_404(
    db: Session,
    booking_id: UUID,
    tenant_id: UUID,
) -> Booking:
    booking = db.query(Booking).filter(
        Booking.id == booking_id,
        Booking.tenant_id == tenant_id,
    ).first()

    if not booking:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found.",
        )

    return booking


def get_locked_property(
    db: Session,
    property_id: UUID,
    tenant_id: UUID,
) -> Property:
    property_record = (
        db.query(Property)
        .filter(
            Property.id == property_id,
            Property.tenant_id == tenant_id,
        )
        .with_for_update()
        .first()
    )

    if not property_record:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Property not found in this tenant.",
        )

    return property_record


def close_linked_deals(
    db: Session,
    booking: Booking,
    tenant_id: UUID,
    user_id: UUID,
    outcome: str,
) -> None:
    if outcome not in ("Won", "Lost"):
        raise ValueError("Outcome must be Won or Lost.")

    deals = (
        db.query(Deal)
        .filter(
            Deal.tenant_id == tenant_id,
            Deal.booking_id == booking.id,
        )
        .with_for_update()
        .all()
    )

    for deal in deals:
        current_stage = None

        if deal.pipeline_stage_id:
            current_stage = (
                db.query(PipelineStage)
                .join(
                    Pipeline,
                    Pipeline.id == PipelineStage.pipeline_id,
                )
                .filter(
                    Pipeline.tenant_id == tenant_id,
                    PipelineStage.id == deal.pipeline_stage_id,
                )
                .first()
            )

        # Never overwrite an already closed Deal.
        if current_stage and (
            current_stage.is_closed_won
            or current_stage.is_closed_lost
        ):
            continue

        target_stage = None

        if deal.pipeline_id:
            target_stage = (
                db.query(PipelineStage)
                .join(
                    Pipeline,
                    Pipeline.id == PipelineStage.pipeline_id,
                )
                .filter(
                    Pipeline.tenant_id == tenant_id,
                    PipelineStage.pipeline_id == deal.pipeline_id,
                    PipelineStage.is_active.is_(True),
                    (
                        PipelineStage.is_closed_won.is_(True)
                        if outcome == "Won"
                        else PipelineStage.is_closed_lost.is_(True)
                    ),
                )
                .order_by(PipelineStage.position)
                .first()
            )

        before_data = {
            "stage": deal.stage,
            "pipeline_stage_id": (
                str(deal.pipeline_stage_id)
                if deal.pipeline_stage_id else None
            ),
        }

        if target_stage:
            deal.stage = target_stage.name
            deal.pipeline_stage_id = target_stage.id
        else:
            deal.stage = outcome
            deal.pipeline_stage_id = None

        deal.updated_at = datetime.utcnow()

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="UPDATE",
            module="deals",
            record_id=deal.id,
            description=(
                f"Deal closed {outcome} after booking "
                f"{booking.id} was {booking.status}."
            ),
            before_data=before_data,
            after_data={
                "stage": deal.stage,
                "pipeline_stage_id": (
                    str(deal.pipeline_stage_id)
                    if deal.pipeline_stage_id else None
                ),
            },
        )



def audit_booking(
    db: Session,
    tenant_id: UUID,
    user_id: UUID,
    action: str,
    booking: Booking,
    description: str,
    before_data=None,
):
    log_audit(
        db=db,
        tenant_id=tenant_id,
        user_id=user_id,
        action=action,
        module="bookings",
        record_id=booking.id,
        description=description,
        before_data=before_data,
        after_data=booking_snapshot(booking),
    )


@router.post(
    "/",
    response_model=BookingResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_booking(
    payload: BookingCreate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("booking.create")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    try:
        property_record = get_locked_property(
            db, payload.property_id, tenant_id
        )

        if property_record.listing_type != "Sale":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Bookings are currently supported only for sale properties.",
            )

        if property_record.status != "Available":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only available properties can be booked.",
            )

        linked_lead_id = payload.lead_id
        requirement = None

        if payload.buyer_requirement_id:
            requirement = (
                db.query(BuyerRequirement)
                .filter(
                    BuyerRequirement.id == payload.buyer_requirement_id,
                    BuyerRequirement.tenant_id == tenant_id,
                )
                .first()
            )

            if requirement is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Buyer requirement not found in this tenant.",
                )

            if requirement.lead_id is not None:
                if linked_lead_id is not None and linked_lead_id != requirement.lead_id:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="The buyer requirement belongs to a different lead.",
                    )

                linked_lead_id = requirement.lead_id

            elif linked_lead_id is not None:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="The selected buyer requirement is not linked to the selected lead.",
                )

        if linked_lead_id is not None:
            lead = (
                db.query(Lead)
                .filter(
                    Lead.id == linked_lead_id,
                    Lead.tenant_id == tenant_id,
                )
                .first()
            )

            if lead is None:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Lead not found in this tenant.",
                )

        effective_agreed_price = payload.agreed_price if payload.agreed_price is not None else property_record.price
        if payload.booking_amount <= 0 or payload.booking_amount > effective_agreed_price:
            raise HTTPException(status_code=422, detail="Booking amount must be greater than zero and cannot exceed the agreed property price.")

        booking = Booking(
            tenant_id=tenant_id,
            property_id=property_record.id,
            lead_id=linked_lead_id,
            buyer_requirement_id=(
                requirement.id if requirement is not None else None
            ),
            buyer_name=payload.buyer_name.strip(),
            buyer_email=payload.buyer_email,
            buyer_phone=payload.buyer_phone,
            buyer_address=payload.buyer_address.strip() if payload.buyer_address else None,
            payment_preference=payload.payment_preference,
            installment_request_notes=(payload.installment_request_notes.strip() if payload.installment_request_notes else None),
            booking_amount=payload.booking_amount,
            agreed_price=effective_agreed_price,
            refund_amount=Decimal("0.00"),
            status="Pending",
            created_by=user_id,
        )

        property_before = {
            "id": property_record.id,
            "status": property_record.status,
        }

        db.add(booking)
        db.flush()
        validate_nominee_allocations(payload.nominees)
        for nominee in payload.nominees:
            db.add(BookingNominee(tenant_id=tenant_id, booking_id=booking.id, nominee_name=nominee.nominee_name.strip(), relationship=nominee.relationship.strip(), phone=nominee.phone.strip() if nominee.phone else None, email=str(nominee.email) if nominee.email else None, date_of_birth=nominee.date_of_birth, address=nominee.address.strip() if nominee.address else None, allocation_percentage=nominee.allocation_percentage, remarks=nominee.remarks.strip() if nominee.remarks else None))

        property_record.status = "Reserved"
        property_record.updated_at = datetime.utcnow()
        db.flush()

        audit_booking(
            db,
            tenant_id,
            user_id,
            "CREATE",
            booking,
            f"Created booking for property {property_record.name}.",
        )

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="UPDATE",
            module="properties",
            record_id=property_record.id,
            description=f"Reserved property for booking {booking.id}.",
            before_data=property_before,
            after_data={
                "id": property_record.id,
                "status": property_record.status,
            },
        )

        db.commit()
        db.refresh(booking)
        return booking

    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An active booking already exists for this property.",
        )
    except Exception:
        db.rollback()
        raise


@router.put("/{booking_id}/nominees", response_model=list[dict], dependencies=[Depends(require_permission("booking.update"))])
def replace_booking_nominees(booking_id: UUID, nominees: list[BookingNomineeInput], db: Session = Depends(get_db), current_user: dict = Depends(require_active_user)):
    tenant_id, user_id = get_tenant_and_user(current_user)
    if len(nominees) > 20:
        raise HTTPException(422, "A booking can have at most 20 nominees.")
    try:
        validate_nominee_allocations(nominees)
    except ValueError as exc:
        raise HTTPException(422, str(exc)) from exc
    booking = get_booking_or_404(db, booking_id, tenant_id)
    if booking.status == "Cancelled":
        raise HTTPException(409, "Nominees cannot be changed on a cancelled booking.")
    db.query(BookingNominee).filter(BookingNominee.tenant_id == tenant_id, BookingNominee.booking_id == booking.id).delete(synchronize_session=False)
    for nominee in nominees:
        db.add(BookingNominee(tenant_id=tenant_id, booking_id=booking.id, nominee_name=nominee.nominee_name.strip(), relationship=nominee.relationship.strip(), phone=nominee.phone.strip() if nominee.phone else None, email=str(nominee.email) if nominee.email else None, date_of_birth=nominee.date_of_birth, address=nominee.address.strip() if nominee.address else None, allocation_percentage=nominee.allocation_percentage, remarks=nominee.remarks.strip() if nominee.remarks else None))
    log_audit(db, tenant_id, user_id, "UPDATE", "bookings", booking.id, "Staff replaced booking nominee details.")
    db.commit()
    db.refresh(booking)
    return [{"id": str(n.id), "booking_id": str(n.booking_id), "nominee_name": n.nominee_name, "relationship": n.relationship, "phone": n.phone, "email": n.email, "date_of_birth": n.date_of_birth, "address": n.address, "allocation_percentage": str(n.allocation_percentage) if n.allocation_percentage is not None else None, "remarks": n.remarks} for n in booking.nominees]


@router.get("/", response_model=list[BookingResponse])
def list_bookings(
    booking_status: str | None = Query(default=None, alias="status"),
    property_id: UUID | None = Query(default=None),
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=100, ge=1, le=500),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("booking.view")),
):
    tenant_id, _ = get_tenant_and_user(current_user)

    query = db.query(Booking).filter(
        Booking.tenant_id == tenant_id
    )

    if booking_status:
        query = query.filter(Booking.status == booking_status)

    if property_id:
        query = query.filter(Booking.property_id == property_id)

    return (
        query.order_by(Booking.created_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/{booking_id}", response_model=BookingResponse)
def get_booking(
    booking_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("booking.view")),
):
    tenant_id, _ = get_tenant_and_user(current_user)
    return get_booking_or_404(db, booking_id, tenant_id)


@router.patch("/{booking_id}", response_model=BookingResponse)
def update_booking(
    booking_id: UUID,
    payload: BookingUpdate,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("booking.update")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    try:
        booking = (
            db.query(Booking)
            .filter(
                Booking.id == booking_id,
                Booking.tenant_id == tenant_id,
            )
            .with_for_update()
            .first()
        )

        if not booking:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Booking not found.",
            )

        if booking.status in ("Cancelled", "Completed"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cancelled or completed bookings cannot be updated.",
            )

        changes = payload.model_dump(exclude_unset=True)

        if not changes:
            return booking

        if "status" in changes:
            new_status = changes["status"]

            if new_status not in ("Pending", "Confirmed"):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Use the cancellation endpoint to cancel a booking. Sale completion is a separate operation.",
                )

            if new_status == "Confirmed" and booking.status != "Pending":
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Only pending bookings can be confirmed.",
                )
            if new_status == "Confirmed":
                journey = db.query(CustomerBookingRequest).filter(
                    CustomerBookingRequest.tenant_id == tenant_id,
                    CustomerBookingRequest.booking_id == booking.id,
                ).with_for_update().first()
                if journey:
                    if journey.status != "Approved" or not journey.hold_expires_at or journey.hold_expires_at <= datetime.utcnow():
                        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Customer portal booking hold is not active. Resolve the hold before confirming.")
                    if not booking.buyer_details_submitted_at:
                        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Customer buyer and nominee details must be submitted before confirmation.")
                    if journey.agreement_status != "Verified" or not journey.agreement_verified_at:
                        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Customer portal booking cannot be confirmed until the signed agreement is verified.")
                    verified_payments = db.query(Payment).filter(Payment.tenant_id == tenant_id, Payment.booking_id == booking.id, Payment.status == "Verified").all()
                    payment_ids = [item.id for item in verified_payments]
                    gross = sum((Decimal(str(item.amount)) for item in verified_payments), Decimal("0.00"))
                    refunds = db.query(PaymentRefund).filter(PaymentRefund.tenant_id == tenant_id, PaymentRefund.booking_id == booking.id, PaymentRefund.payment_id.in_(payment_ids) if payment_ids else PaymentRefund.payment_id == None, PaymentRefund.status == "Processed").all()
                    net = gross - sum((Decimal(str(item.amount)) for item in refunds), Decimal("0.00"))
                    if net < Decimal(str(booking.booking_amount)):
                        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=f"Verified booking amount is not yet received. Required {booking.booking_amount}; net verified {net}.")
                    journey.status = "Confirmed"
                    journey.final_confirmed_at = datetime.utcnow()
                    journey.hold_expires_at = None

        before_data = booking_snapshot(booking)

        for field in ("buyer_name", "buyer_email", "buyer_phone", "buyer_address", "status"):
            if field in changes:
                value = changes[field]
                if field in ("buyer_name", "buyer_email", "buyer_phone", "buyer_address") and value is not None and isinstance(value, str):
                    value = value.strip()
                setattr(booking, field, value)

        if "nominees" in changes:
            db.query(BookingNominee).filter(BookingNominee.tenant_id == tenant_id, BookingNominee.booking_id == booking.id).delete(synchronize_session=False)
            db.expire(booking, ["nominees"])
            for nominee in changes["nominees"]:
                db.add(BookingNominee(tenant_id=tenant_id, booking_id=booking.id, nominee_name=nominee.nominee_name.strip(), relationship=nominee.relationship.strip(), phone=nominee.phone.strip() if nominee.phone else None, email=str(nominee.email) if nominee.email else None, date_of_birth=nominee.date_of_birth, address=nominee.address.strip() if nominee.address else None, allocation_percentage=nominee.allocation_percentage, remarks=nominee.remarks.strip() if nominee.remarks else None))

        booking.updated_at = datetime.utcnow()
        db.flush()

        audit_booking(
            db,
            tenant_id,
            user_id,
            "UPDATE",
            booking,
            "Updated booking details.",
            before_data,
        )

        db.commit()
        db.refresh(booking)
        return booking

    except HTTPException:
        db.rollback()
        raise
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="The booking conflicts with an existing record.",
        )
    except Exception:
        db.rollback()
        raise


@router.post(
    "/{booking_id}/cancel",
    response_model=BookingResponse,
)
def cancel_booking(
    booking_id: UUID,
    payload: BookingCancel,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("booking.cancel")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    try:
        booking = (
            db.query(Booking)
            .filter(
                Booking.id == booking_id,
                Booking.tenant_id == tenant_id,
            )
            .with_for_update()
            .first()
        )

        if not booking:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Booking not found.",
            )

        if booking.status in ("Cancelled", "Completed"):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Cancelled or completed bookings cannot be cancelled again.",
            )

        property_record = get_locked_property(
            db, booking.property_id, tenant_id
        )

        verified_payments = db.query(Payment).filter(
            Payment.tenant_id == tenant_id, Payment.booking_id == booking.id,
            Payment.status == "Verified",
        ).all()
        verified_total = sum((Decimal(str(item.amount)) for item in verified_payments), Decimal("0.00"))
        processed_refunds = db.query(PaymentRefund).filter(
            PaymentRefund.tenant_id == tenant_id, PaymentRefund.booking_id == booking.id,
            PaymentRefund.status == "Processed",
        ).all()
        processed_total = sum((Decimal(str(item.amount)) for item in processed_refunds), Decimal("0.00"))
        pending_refund = db.query(PaymentRefund.id).filter(
            PaymentRefund.tenant_id == tenant_id, PaymentRefund.booking_id == booking.id,
            PaymentRefund.status == "Pending",
        ).first()
        if pending_refund or processed_total < verified_total:
            raise HTTPException(status_code=409, detail=(
                "Refund all verified customer payments and resolve pending refund requests before cancelling this booking. "
                f"Verified: {verified_total:.2f}; processed refunds: {processed_total:.2f}."
            ))

        before_data = booking_snapshot(booking)
        property_before = {
            "id": property_record.id,
            "status": property_record.status,
        }

        booking.status = "Cancelled"
        booking.cancellation_reason = payload.cancellation_reason.strip()
        booking.updated_at = datetime.utcnow()
        journey = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.tenant_id == tenant_id, CustomerBookingRequest.booking_id == booking.id).with_for_update().first()
        if journey:
            journey.status = "Cancelled"
            journey.hold_expires_at = None

        close_linked_deals(
            db=db,
            booking=booking,
            tenant_id=tenant_id,
            user_id=user_id,
            outcome="Lost",
        )


        # Release only when this property is still reserved for this booking.
        if property_record.status == "Reserved":
            property_record.status = "Available"
            property_record.updated_at = datetime.utcnow()

        # Cancel the associated payment plan in the same transaction.
        payment_plan = (
            db.query(PaymentPlan)
            .filter(
                PaymentPlan.tenant_id == tenant_id,
                PaymentPlan.booking_id == booking.id,
            )
            .with_for_update()
            .first()
        )

        plan_before = None

        if payment_plan and payment_plan.status == "Active":
            plan_before = {
                "id": str(payment_plan.id),
                "status": payment_plan.status,
            }
            payment_plan.status = "Cancelled"
            payment_plan.updated_at = datetime.utcnow()

        for pending_payment in db.query(Payment).filter(
            Payment.tenant_id == tenant_id, Payment.booking_id == booking.id,
            Payment.status == "Pending",
        ).with_for_update().all():
            pending_payment.status = "Rejected"
            pending_payment.notes = ((pending_payment.notes or "") + "\nRejected because the booking was cancelled.").strip()

        db.flush()

        if payment_plan and plan_before:
            log_audit(
                db=db,
                tenant_id=tenant_id,
                user_id=user_id,
                action="UPDATE",
                module="payment_plans",
                record_id=payment_plan.id,
                description=f"Cancelled payment plan after booking {booking.id} was cancelled.",
                before_data=plan_before,
                after_data={
                    "id": str(payment_plan.id),
                    "status": payment_plan.status,
                },
            )


        notify_booking_customer(db, tenant_id, booking.id, "Booking cancelled",
            "Your booking has been cancelled by the property team. Any refund must be handled through the recorded refund process.",
            "booking_cancelled", "bookings", booking.id)

        audit_booking(
            db,
            tenant_id,
            user_id,
            "CANCEL",
            booking,
            "Cancelled booking. Any refund must be recorded separately.",
            before_data,
        )

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="UPDATE",
            module="properties",
            record_id=property_record.id,
            description=f"Released property after cancellation of booking {booking.id}.",
            before_data=property_before,
            after_data={
                "id": property_record.id,
                "status": property_record.status,
            },
        )

        db.commit()
        db.refresh(booking)
        return booking

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise



@router.post(
    "/{booking_id}/complete",
    response_model=BookingResponse,
)
def complete_booking(
    booking_id: UUID,
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
    _permission=Depends(require_permission("booking.sale.complete")),
):
    tenant_id, user_id = get_tenant_and_user(current_user)

    try:
        booking = (
            db.query(Booking)
            .filter(
                Booking.id == booking_id,
                Booking.tenant_id == tenant_id,
            )
            .with_for_update()
            .first()
        )

        if not booking:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Booking not found.",
            )

        if booking.status != "Confirmed":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Only confirmed bookings can be completed.",
            )

        property_record = get_locked_property(
            db, booking.property_id, tenant_id
        )

        if property_record.status != "Reserved":
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The property must be Reserved to complete this booking.",
            )

        verified_payments = (
            db.query(Payment)
            .filter(
                Payment.tenant_id == tenant_id,
                Payment.booking_id == booking.id,
                Payment.status == "Verified",
            )
            .with_for_update()
            .all()
        )

        processed_refunds = (
            db.query(PaymentRefund)
            .filter(
                PaymentRefund.tenant_id == tenant_id,
                PaymentRefund.booking_id == booking.id,
                PaymentRefund.status == "Processed",
            )
            .with_for_update()
            .all()
        )

        total_received = sum(
            (Decimal(str(payment.amount)) for payment in verified_payments),
            Decimal("0.00"),
        )

        total_refunded = sum(
            (Decimal(str(refund.amount)) for refund in processed_refunds),
            Decimal("0.00"),
        )

        net_received = total_received - total_refunded
        agreed_price = Decimal(str(booking.agreed_price))

        if net_received < agreed_price:
            outstanding = agreed_price - net_received
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=(
                    "Sale cannot be completed. Outstanding balance: "
                    f"{outstanding:.2f}."
                ),
            )

        booking_before = booking_snapshot(booking)
        property_before = {
            "id": property_record.id,
            "status": property_record.status,
        }

        booking.status = "Completed"
        booking.updated_at = datetime.utcnow()
        notify_booking_customer(db, tenant_id, booking.id, "Property sale completed",
            "Your full agreed sale amount has been verified and the property sale is marked complete. The handover team can now schedule possession.",
            "sale_completed", "bookings", booking.id)
        journey = db.query(CustomerBookingRequest).filter(CustomerBookingRequest.tenant_id == tenant_id, CustomerBookingRequest.booking_id == booking.id).with_for_update().first()
        if journey:
            journey.status = "Completed"
            journey.hold_expires_at = None

        close_linked_deals(
            db=db,
            booking=booking,
            tenant_id=tenant_id,
            user_id=user_id,
            outcome="Won",
        )

        if booking.lead_id:
            lead = (
                db.query(Lead)
                .filter(
                    Lead.id == booking.lead_id,
                    Lead.tenant_id == tenant_id,
                )
                .with_for_update()
                .first()
            )

            if lead:
                lead.status = "Converted"
                lead.updated_at = datetime.utcnow()

        if booking.buyer_requirement_id:
            requirement = (
                db.query(BuyerRequirement)
                .filter(
                    BuyerRequirement.id == booking.buyer_requirement_id,
                    BuyerRequirement.tenant_id == tenant_id,
                )
                .with_for_update()
                .first()
            )

            if requirement:
                requirement.status = "Closed"
                requirement.updated_at = datetime.utcnow()

        property_record.status = "Sold"
        property_record.updated_at = datetime.utcnow()

        db.flush()

        audit_booking(
            db,
            tenant_id,
            user_id,
            "COMPLETE",
            booking,
            (
                f"Completed sale for property {property_record.name}. "
                f"Agreed price: {agreed_price:.2f}; "
                f"net verified payments: {net_received:.2f}."
            ),
            before_data=booking_before,
        )

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="UPDATE",
            module="properties",
            record_id=property_record.id,
            description=(
                f"Marked property as Sold after completing booking {booking.id}."
            ),
            before_data=property_before,
            after_data={
                "id": property_record.id,
                "status": property_record.status,
            },
        )

        db.commit()
        db.refresh(booking)
        return booking

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise
