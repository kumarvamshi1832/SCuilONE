from datetime import datetime
from decimal import Decimal
from uuid import UUID
from app.models.payment import Payment
from app.models.payment_refund import PaymentRefund
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from app.models.buyer_requirement import BuyerRequirement
from app.models.lead import Lead
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.booking import Booking
from app.models.property import Property
from app.schemas.booking import (
    BookingCancel,
    BookingCreate,
    BookingResponse,
    BookingUpdate,
)
from app.services.audit_service import log_audit


router = APIRouter(prefix="/api/v1/bookings", tags=["Bookings"])

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
            payment_preference=payload.payment_preference,
            installment_request_notes=(payload.installment_request_notes.strip() if payload.installment_request_notes else None),
            booking_amount=payload.booking_amount,
            agreed_price=(
                payload.agreed_price
                if payload.agreed_price is not None
                else property_record.price
            ),
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

        before_data = booking_snapshot(booking)

        for field in ("buyer_name", "buyer_email", "buyer_phone", "status"):
            if field in changes:
                value = changes[field]
                if field == "buyer_name" and value is not None:
                    value = value.strip()
                setattr(booking, field, value)

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

        before_data = booking_snapshot(booking)
        property_before = {
            "id": property_record.id,
            "status": property_record.status,
        }

        booking.status = "Cancelled"
        booking.cancellation_reason = payload.cancellation_reason.strip()
        booking.updated_at = datetime.utcnow()

        # Release only when this property is still reserved for this booking.
        if property_record.status == "Reserved":
            property_record.status = "Available"
            property_record.updated_at = datetime.utcnow()

        db.flush()

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
