from datetime import datetime
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.core.dependencies import require_active_user
from app.core.industry_modules import require_enabled_module
from app.core.permissions import require_permission
from app.database.connection import SessionLocal
from app.models.property_match import PropertyMatch
from app.models.property_offer import PropertyOffer
from app.schemas.property_offer import PropertyOfferCreate, PropertyOfferDecision, PropertyOfferResponse
from app.services.audit_service import log_audit

router = APIRouter(prefix="/api/v1/property-offers", tags=["Property Offers"], dependencies=[Depends(require_enabled_module("buyer_requirements"))])
def get_db():
    db=SessionLocal()
    try: yield db
    finally: db.close()
def identity(user):
    try: return UUID(str(user["tenant_id"])), UUID(str(user["user_id"]))
    except (KeyError,ValueError,TypeError): raise HTTPException(401,"Invalid authenticated user context")
def get_offer(db, offer_id, tenant_id):
    row=db.query(PropertyOffer).filter(PropertyOffer.id==offer_id,PropertyOffer.tenant_id==tenant_id).first()
    if not row: raise HTTPException(404,"Offer not found")
    return row

@router.post("/", response_model=PropertyOfferResponse, status_code=201)
def create_offer(payload: PropertyOfferCreate, db: Session=Depends(get_db), user=Depends(require_active_user), _p=Depends(require_permission("buyer_requirement.update"))):
    tenant_id,user_id=identity(user)
    match=db.query(PropertyMatch).filter(PropertyMatch.id==payload.property_match_id,PropertyMatch.tenant_id==tenant_id).first()
    if not match: raise HTTPException(404,"Property match not found in this tenant")
    row=PropertyOffer(tenant_id=tenant_id,property_match_id=match.id,offered_price=payload.offered_price,terms=payload.terms,created_by=user_id,status="Submitted",offer_type="Buyer")
    db.add(row); db.flush()
    log_audit(db,tenant_id,user_id,action="CREATE",module="property_offers",record_id=row.id,description="Buyer offer submitted",after_data={"offered_price":str(row.offered_price),"property_match_id":str(row.property_match_id),"status":row.status})
    db.commit(); db.refresh(row); return row

@router.get("/", response_model=list[PropertyOfferResponse])
def list_offers(property_match_id: UUID|None=None, db: Session=Depends(get_db), user=Depends(require_active_user), _p=Depends(require_permission("buyer_requirement.view"))):
    tenant_id,_=identity(user); q=db.query(PropertyOffer).filter(PropertyOffer.tenant_id==tenant_id)
    if property_match_id: q=q.filter(PropertyOffer.property_match_id==property_match_id)
    return q.order_by(PropertyOffer.created_at.asc()).all()

@router.get("/{offer_id}/thread", response_model=list[PropertyOfferResponse])
def offer_thread(offer_id: UUID, db: Session=Depends(get_db), user=Depends(require_active_user), _p=Depends(require_permission("buyer_requirement.view"))):
    tenant_id,_=identity(user); offer=get_offer(db,offer_id,tenant_id)
    return db.query(PropertyOffer).filter(PropertyOffer.tenant_id==tenant_id,PropertyOffer.property_match_id==offer.property_match_id).order_by(PropertyOffer.created_at.asc()).all()

@router.post("/{offer_id}/decision", response_model=PropertyOfferResponse)
def decide_offer(offer_id: UUID, payload: PropertyOfferDecision, db: Session=Depends(get_db), user=Depends(require_active_user), _p=Depends(require_permission("buyer_requirement.update"))):
    tenant_id,user_id=identity(user); row=get_offer(db,offer_id,tenant_id)
    if row.status not in ("Submitted","Countered"):
        raise HTTPException(409,"Only submitted or countered offers can receive a decision")
    if payload.decision=="Countered" and payload.counter_price is None:
        raise HTTPException(400,"counter_price is required for a counteroffer")
    row.status=payload.decision; row.response_notes=payload.response_notes; row.responded_by=user_id; row.responded_at=datetime.utcnow(); row.updated_at=datetime.utcnow()
    db.flush()
    if payload.decision=="Countered":
        counter=PropertyOffer(tenant_id=tenant_id,property_match_id=row.property_match_id,parent_offer_id=row.id,offered_price=payload.counter_price,terms=payload.counter_terms or row.terms,created_by=user_id,status="Submitted",offer_type="Seller")
        db.add(counter)
    log_audit(db,tenant_id,user_id,action="UPDATE",module="property_offers",record_id=row.id,description=f"Offer {payload.decision.lower()}",after_data={"status":row.status,"response_notes":row.response_notes,"counter_price":str(payload.counter_price) if payload.counter_price else None})
    db.commit(); db.refresh(row); return row
