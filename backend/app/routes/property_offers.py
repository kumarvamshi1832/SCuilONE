from datetime import datetime, timedelta
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.dependencies import require_active_user
from app.core.industry_modules import require_enabled_module
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.property_match import PropertyMatch
from app.models.property import Property
from app.models.buyer_requirement import BuyerRequirement
from app.models.lead import Lead
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.customer_portal import CustomerPortalUser
from app.models.property_offer import PropertyOffer
from app.schemas.property_offer import (
    PropertyOfferCreate,
    PropertyOfferDecision,
    PropertyOfferResponse,
    WalkInOfferResponseIn,
)
from app.services.audit_service import log_audit
from app.services.customer_portal_notifications import notify_customer
from app.services.real_estate_lifecycle import apply_offer_acceptance, utcnow

router = APIRouter(
    prefix="/api/v1/property-offers",
    tags=["Property Offers"],
    dependencies=[Depends(require_enabled_module("buyer_requirements"))],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def identity(user):
    try:
        return UUID(str(user["tenant_id"])), UUID(str(user["user_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(401, "Invalid authenticated user context")


def notify_match_customer(db: Session, tenant_id: UUID, match: PropertyMatch, title: str, message: str, record_id: UUID) -> None:
    requirement = db.query(BuyerRequirement).filter(
        BuyerRequirement.id == match.buyer_requirement_id,
        BuyerRequirement.tenant_id == tenant_id,
    ).first()
    if not requirement or not requirement.contact_id:
        return
    portal_user = db.query(CustomerPortalUser).filter(
        CustomerPortalUser.tenant_id == tenant_id,
        CustomerPortalUser.contact_id == requirement.contact_id,
        CustomerPortalUser.status == "Active",
    ).first()
    if portal_user:
        notify_customer(
            db, tenant_id, portal_user.id, title, message,
            "rental_offer", "property_offers", record_id,
        )


def get_offer(db, offer_id, tenant_id):
    row = db.query(PropertyOffer).filter(PropertyOffer.id == offer_id, PropertyOffer.tenant_id == tenant_id).first()
    if not row:
        raise HTTPException(404, "Offer not found")
    return row


@router.post("/", response_model=PropertyOfferResponse, status_code=201)
def create_offer(
    payload: PropertyOfferCreate,
    db: Session = Depends(get_db),
    user=Depends(require_active_user),
    _p=Depends(require_permission("buyer_requirement.update")),
):
    tenant_id, user_id = identity(user)
    match = db.query(PropertyMatch).filter(
        PropertyMatch.id == payload.property_match_id,
        PropertyMatch.tenant_id == tenant_id,
    ).with_for_update().first()
    if not match:
        raise HTTPException(404, "Property match not found in this tenant")
    prop = db.query(Property).filter(Property.id == match.property_id, Property.tenant_id == tenant_id).with_for_update().first()
    if not prop:
        raise HTTPException(404, "Matched property not found in this tenant")
    if db.query(PropertyOffer.id).filter(
        PropertyOffer.tenant_id == tenant_id,
        PropertyOffer.property_match_id == match.id,
        PropertyOffer.status.in_(("Submitted", "Countered")),
    ).first():
        raise HTTPException(409, "An offer is already awaiting a response for this property match.")
    now = utcnow()
    row = PropertyOffer(
        tenant_id=tenant_id,
        property_match_id=match.id,
        offered_price=payload.offered_price,
        price_frequency=prop.price_frequency or "One-time",
        terms=payload.terms,
        expires_at=payload.expires_at or now + timedelta(days=7),
        created_by=user_id,
        status="Submitted",
        offer_type="Seller",
    )
    db.add(row)
    db.flush()
    notify_match_customer(
        db, tenant_id, match, "New property offer received",
        f"The property team has proposed {row.offered_price} {row.price_frequency.lower()}. Review the offer and accept, reject, or counter it in your Customer Portal.",
        row.id,
    )
    log_audit(
        db, tenant_id, user_id,
        action="CREATE", module="property_offers", record_id=row.id,
        description="Staff rental/property offer submitted",
        after_data={"offered_price": str(row.offered_price), "property_match_id": str(row.property_match_id), "status": row.status, "offer_type": "Seller"},
    )
    db.commit()
    db.refresh(row)
    return row


@router.get("/", response_model=list[PropertyOfferResponse])
def list_offers(
    property_match_id: UUID | None = None,
    db: Session = Depends(get_db),
    user=Depends(require_active_user),
    _p=Depends(require_permission("buyer_requirement.view")),
):
    tenant_id, _ = identity(user)
    q = db.query(PropertyOffer).filter(PropertyOffer.tenant_id == tenant_id)
    if property_match_id:
        q = q.filter(PropertyOffer.property_match_id == property_match_id)
    return q.order_by(PropertyOffer.created_at.asc()).all()


@router.get("/{offer_id}/thread", response_model=list[PropertyOfferResponse])
def offer_thread(
    offer_id: UUID,
    db: Session = Depends(get_db),
    user=Depends(require_active_user),
    _p=Depends(require_permission("buyer_requirement.view")),
):
    tenant_id, _ = identity(user)
    offer = get_offer(db, offer_id, tenant_id)
    return db.query(PropertyOffer).filter(
        PropertyOffer.tenant_id == tenant_id,
        PropertyOffer.property_match_id == offer.property_match_id,
    ).order_by(PropertyOffer.created_at.asc()).all()


@router.post("/{offer_id}/decision", response_model=PropertyOfferResponse)
def decide_offer(
    offer_id: UUID,
    payload: PropertyOfferDecision,
    db: Session = Depends(get_db),
    user=Depends(require_active_user),
    _p=Depends(require_permission("buyer_requirement.update")),
):
    tenant_id, user_id = identity(user)
    now = utcnow()
    row = db.query(PropertyOffer).filter(
        PropertyOffer.id == offer_id,
        PropertyOffer.tenant_id == tenant_id,
    ).with_for_update().first()
    if not row:
        raise HTTPException(404, "Offer not found")
    if row.status not in ("Submitted", "Countered"):
        raise HTTPException(409, "Only submitted or countered offers can receive a decision")
    if row.expires_at and row.expires_at <= now:
        row.status = "Expired"
        db.commit()
        raise HTTPException(409, "This offer has expired and can no longer be accepted or countered.")
    if row.offer_type != "Buyer":
        raise HTTPException(403, "Staff can respond only to a customer-submitted offer or counteroffer.")
    if payload.decision == "Withdrawn":
        raise HTTPException(400, "Staff cannot withdraw a customer offer. Ask the customer to withdraw it from the Customer Portal.")
    if payload.decision == "Countered" and payload.counter_price is None:
        raise HTTPException(400, "counter_price is required for a counteroffer")

    match = db.query(PropertyMatch).filter(
        PropertyMatch.id == row.property_match_id,
        PropertyMatch.tenant_id == tenant_id,
    ).with_for_update().first()
    prop = db.query(Property).filter(
        Property.id == match.property_id,
        Property.tenant_id == tenant_id,
    ).with_for_update().first() if match else None

    if payload.decision == "Accepted":
        if not match or not prop:
            raise HTTPException(404, "The property linked to this offer no longer exists.")
        apply_offer_acceptance(db, tenant_id, row, match, prop, now=now)
    else:
        row.status = payload.decision

    row.response_notes = payload.response_notes
    row.responded_by = user_id
    row.responded_at = now
    row.updated_at = now
    db.flush()

    if payload.decision == "Countered":
        counter = PropertyOffer(
            tenant_id=tenant_id,
            property_match_id=row.property_match_id,
            parent_offer_id=row.id,
            offered_price=payload.counter_price,
            price_frequency=row.price_frequency,
            terms=payload.counter_terms or row.terms,
            expires_at=now + timedelta(days=7),
            created_by=user_id,
            status="Submitted",
            offer_type="Seller",
        )
        db.add(counter)
        db.flush()
        if match:
            notify_match_customer(
                db, tenant_id, match, "Staff sent a property counteroffer",
                f"The property team countered with {payload.counter_price}. Review the new offer in your Customer Portal.",
                counter.id,
            )
    else:
        if match:
            notify_match_customer(
                db, tenant_id, match, f"Your property offer was {payload.decision.lower()}",
                f"The property team {payload.decision.lower()} your offer. Open your Customer Portal to view the negotiation history.",
                row.id,
            )

    log_audit(
        db, tenant_id, user_id,
        action="UPDATE", module="property_offers", record_id=row.id,
        description=f"Offer {payload.decision.lower()}",
        after_data={"status": row.status, "response_notes": row.response_notes, "counter_price": str(payload.counter_price) if payload.counter_price else None},
    )
    db.commit()
    db.refresh(row)
    return row


@router.post("/{offer_id}/walk-in-response", response_model=PropertyOfferResponse)
def record_walk_in_offer_response(
    offer_id: UUID,
    payload: WalkInOfferResponseIn,
    db: Session = Depends(get_db),
    user=Depends(require_active_user),
    _p=Depends(require_permission("buyer_requirement.update")),
):
    """Record a walk-in/offline customer's Accept, Reject, or Counteroffer response to a Seller offer."""
    tenant_id, user_id = identity(user)
    now = utcnow()
    row = db.query(PropertyOffer).filter(
        PropertyOffer.id == offer_id,
        PropertyOffer.tenant_id == tenant_id,
    ).with_for_update().first()
    if not row:
        raise HTTPException(404, "Offer not found.")
    if row.offer_type != "Seller":
        raise HTTPException(403, "Walk-in customer responses can only be recorded against a Seller offer or counteroffer.")
    if row.status not in ("Submitted", "Countered"):
        raise HTTPException(409, f"Offer in status {row.status} can no longer receive a customer response.")
    if row.expires_at and row.expires_at <= now:
        row.status = "Expired"
        row.updated_at = now
        db.commit()
        raise HTTPException(409, "This offer has expired and can no longer be accepted or countered.")

    match = db.query(PropertyMatch).filter(
        PropertyMatch.id == row.property_match_id,
        PropertyMatch.tenant_id == tenant_id,
    ).with_for_update().first()
    prop = db.query(Property).filter(
        Property.id == match.property_id,
        Property.tenant_id == tenant_id,
    ).with_for_update().first() if match else None

    if payload.decision == "Accepted":
        if not match or not prop:
            raise HTTPException(404, "The property linked to this offer no longer exists.")
        apply_offer_acceptance(db, tenant_id, row, match, prop, now=now)
    else:
        row.status = payload.decision

    row.response_notes = payload.response_notes
    row.responded_by = user_id
    row.responded_at = now
    row.updated_at = now
    db.flush()

    counter_id = None
    if payload.decision == "Countered":
        counter = PropertyOffer(
            tenant_id=tenant_id,
            property_match_id=row.property_match_id,
            parent_offer_id=row.id,
            offered_price=payload.counter_price,
            price_frequency=row.price_frequency,
            terms=payload.counter_terms or row.terms,
            expires_at=now + timedelta(days=7),
            created_by=user_id,
            status="Submitted",
            offer_type="Buyer",
        )
        db.add(counter)
        db.flush()
        counter_id = str(counter.id)

    log_audit(
        db, tenant_id, user_id,
        action="UPDATE", module="property_offers", record_id=row.id,
        description=f"Staff recorded walk-in customer offer response: {payload.decision}",
        after_data={
            "status": row.status,
            "decision": payload.decision,
            "response_notes": row.response_notes,
            "counter_price": str(payload.counter_price) if payload.counter_price else None,
            "counter_offer_id": counter_id,
        },
    )
    db.commit()
    db.refresh(row)
    return row


@router.post("/{offer_id}/owner-approval", response_model=PropertyOfferResponse)
def approve_offer_as_owner(
    offer_id: UUID,
    approved: bool,
    db: Session = Depends(get_db),
    user=Depends(require_active_user),
    _p=Depends(require_permission("property.update")),
):
    tenant_id, user_id = identity(user)
    now = utcnow()
    role_names = {name for (name,) in db.query(Role.name).join(UserRole, UserRole.role_id == Role.id).filter(UserRole.user_id == user_id).all()}
    if not (role_names & {"Platform Super Admin", "Tenant Owner", "Owner", "Tenant Admin", "Admin"}):
        raise HTTPException(403, "Only a tenant owner or administrator can approve an offer on the owner's behalf.")
    row = db.query(PropertyOffer).filter(PropertyOffer.id == offer_id, PropertyOffer.tenant_id == tenant_id).with_for_update().first()
    if not row:
        raise HTTPException(404, "Offer not found")
    if row.status != "Pending Owner Approval":
        raise HTTPException(409, "Only offers awaiting owner approval can be decided.")
    if row.expires_at and row.expires_at <= now:
        row.status = "Expired"
        db.commit()
        raise HTTPException(409, "This offer has expired and cannot be approved.")
    match = db.query(PropertyMatch).filter(PropertyMatch.id == row.property_match_id, PropertyMatch.tenant_id == tenant_id).with_for_update().first()
    prop = db.query(Property).filter(Property.id == match.property_id, Property.tenant_id == tenant_id).with_for_update().first() if match else None
    if not approved:
        row.status = "Rejected"
        row.response_notes = ((row.response_notes or "") + "\nOwner rejected the offer.").strip()
    else:
        if not prop:
            raise HTTPException(404, "Property not found.")
        if prop.offer_hold_expires_at and prop.offer_hold_expires_at <= now:
            prop.status = "Available"
            prop.offer_hold_expires_at = None
        if prop.status != "Available":
            raise HTTPException(409, "This property is no longer available for acceptance.")
        if prop.minimum_acceptable_price is not None and row.offered_price < prop.minimum_acceptable_price:
            raise HTTPException(409, "Offer is below the current minimum acceptable price.")
        competing = db.query(PropertyOffer.id).join(PropertyMatch, PropertyMatch.id == PropertyOffer.property_match_id).filter(
            PropertyOffer.tenant_id == tenant_id, PropertyMatch.tenant_id == tenant_id,
            PropertyMatch.property_id == prop.id, PropertyOffer.id != row.id,
            PropertyOffer.status == "Accepted",
            (PropertyOffer.hold_expires_at.is_(None) | (PropertyOffer.hold_expires_at > now)),
        ).first()
        if competing:
            raise HTTPException(409, "Another accepted offer already exists for this property.")
        row.status = "Accepted"
        row.owner_approved_by = user_id
        row.owner_approved_at = now
        match.status = "Offer Accepted"
        req = db.query(BuyerRequirement).filter(BuyerRequirement.id == match.buyer_requirement_id, BuyerRequirement.tenant_id == tenant_id).first()
        if req and req.lead_id:
            lead = db.query(Lead).filter(Lead.id == req.lead_id, Lead.tenant_id == tenant_id).first()
            if lead:
                lead.status = "Offer Accepted"
        if prop.hold_on_offer_acceptance:
            prop.offer_hold_expires_at = now + timedelta(hours=max(1, prop.offer_hold_hours or 48))
            row.hold_expires_at = prop.offer_hold_expires_at
            row.expires_at = min(row.expires_at, row.hold_expires_at) if row.expires_at else row.hold_expires_at
            prop.status = "Reserved"
    row.responded_by = user_id
    row.responded_at = now
    row.updated_at = now
    log_audit(
        db, tenant_id, user_id,
        action="UPDATE", module="property_offers", record_id=row.id,
        description="Owner approval decision recorded",
        after_data={"status": row.status, "approved": approved},
    )
    db.commit()
    db.refresh(row)
    return row


@router.post("/record-buyer-offer", response_model=PropertyOfferResponse, status_code=201)
def record_staff_buyer_offer(
    payload: PropertyOfferCreate,
    db: Session = Depends(get_db),
    user=Depends(require_active_user),
    _p=Depends(require_permission("buyer_requirement.update")),
):
    """Record a buyer's verbal, walk-in, phone, or offline offer on their behalf."""
    tenant_id, user_id = identity(user)
    now = utcnow()
    match = db.query(PropertyMatch).filter(
        PropertyMatch.id == payload.property_match_id,
        PropertyMatch.tenant_id == tenant_id,
    ).with_for_update().first()
    if not match:
        raise HTTPException(404, "Property match not found in this tenant.")
    prop = db.query(Property).filter(Property.id == match.property_id, Property.tenant_id == tenant_id).first()
    if not prop:
        raise HTTPException(404, "Matched property not found.")
    if db.query(PropertyOffer.id).filter(
        PropertyOffer.tenant_id == tenant_id,
        PropertyOffer.property_match_id == match.id,
        PropertyOffer.status.in_(("Submitted", "Countered")),
    ).first():
        raise HTTPException(409, "An offer is already awaiting a response for this property match.")
    row = PropertyOffer(
        tenant_id=tenant_id,
        property_match_id=match.id,
        offered_price=payload.offered_price,
        price_frequency=prop.price_frequency or "One-time",
        terms=payload.terms,
        expires_at=payload.expires_at or now + timedelta(days=7),
        created_by=user_id,
        status="Submitted",
        offer_type="Buyer",
    )
    db.add(row)
    db.flush()
    log_audit(
        db, tenant_id, user_id,
        action="CREATE", module="property_offers", record_id=row.id,
        description="Staff recorded buyer's verbal/walk-in offer",
        after_data={"status": row.status, "offer_type": row.offer_type, "offered_price": str(row.offered_price)},
    )
    db.commit()
    db.refresh(row)
    return row
