from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID

from app.database.connection import SessionLocal
from app.core.dependencies import get_current_user
from app.core.permissions import require_permission

from app.models.deal import Deal
from app.models.lead import Lead
from app.models.contact import Contact
from app.models.account import Account
from app.models.user import User

from app.schemas.deal import DealCreate, DealUpdate, DealResponse


router = APIRouter(
    prefix="/api/v1/deals",
    tags=["Deals"]
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def validate_assigned_user(
    assigned_to: UUID,
    tenant_id: UUID,
    db: Session
):
    user = db.query(User).filter(
        User.id == assigned_to,
        User.tenant_id == tenant_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigned user does not belong to this tenant"
        )


def validate_lead(
    lead_id: UUID,
    tenant_id: UUID,
    db: Session
):
    lead = db.query(Lead).filter(
        Lead.id == lead_id,
        Lead.tenant_id == tenant_id
    ).first()

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lead not found or does not belong to this tenant"
        )


def validate_contact(
    contact_id: UUID,
    tenant_id: UUID,
    db: Session
):
    contact = db.query(Contact).filter(
        Contact.id == contact_id,
        Contact.tenant_id == tenant_id
    ).first()

    if not contact:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contact not found or does not belong to this tenant"
        )


def validate_account(
    account_id: UUID,
    tenant_id: UUID,
    db: Session
):
    account = db.query(Account).filter(
        Account.id == account_id,
        Account.tenant_id == tenant_id
    ).first()

    if not account:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account not found or does not belong to this tenant"
        )


@router.post(
    "/",
    response_model=DealResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("deal.create"))]
)
def create_deal(
    data: DealCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    tenant_id = current_user["tenant_id"]

    if data.lead_id:
        validate_lead(
            data.lead_id,
            tenant_id,
            db
        )

    if data.contact_id:
        validate_contact(
            data.contact_id,
            tenant_id,
            db
        )

    if data.account_id:
        validate_account(
            data.account_id,
            tenant_id,
            db
        )

    if data.assigned_to:
        validate_assigned_user(
            data.assigned_to,
            tenant_id,
            db
        )

    deal = Deal(
        tenant_id=tenant_id,
        name=data.name,
        lead_id=data.lead_id,
        contact_id=data.contact_id,
        account_id=data.account_id,
        assigned_to=data.assigned_to,
        amount=data.amount,
        stage=data.stage,
        expected_close_date=data.expected_close_date,
        description=data.description
    )

    db.add(deal)
    db.commit()
    db.refresh(deal)

    return deal


@router.get(
    "/",
    response_model=list[DealResponse],
    dependencies=[Depends(require_permission("deal.view"))]
)
def get_deals(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    tenant_id = current_user["tenant_id"]

    deals = db.query(Deal).filter(
        Deal.tenant_id == tenant_id
    ).all()

    return deals


@router.get(
    "/{deal_id}",
    response_model=DealResponse,
    dependencies=[Depends(require_permission("deal.view"))]
)
def get_deal(
    deal_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    tenant_id = current_user["tenant_id"]

    deal = db.query(Deal).filter(
        Deal.id == deal_id,
        Deal.tenant_id == tenant_id
    ).first()

    if not deal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deal not found"
        )

    return deal


@router.put(
    "/{deal_id}",
    response_model=DealResponse,
    dependencies=[Depends(require_permission("deal.update"))]
)
def update_deal(
    deal_id: UUID,
    data: DealUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    tenant_id = current_user["tenant_id"]

    deal = db.query(Deal).filter(
        Deal.id == deal_id,
        Deal.tenant_id == tenant_id
    ).first()

    if not deal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deal not found"
        )

    update_data = data.model_dump(
        exclude_unset=True
    )

    if "lead_id" in update_data and update_data["lead_id"] is not None:
        validate_lead(
            update_data["lead_id"],
            tenant_id,
            db
        )

    if "contact_id" in update_data and update_data["contact_id"] is not None:
        validate_contact(
            update_data["contact_id"],
            tenant_id,
            db
        )

    if "account_id" in update_data and update_data["account_id"] is not None:
        validate_account(
            update_data["account_id"],
            tenant_id,
            db
        )

    if "assigned_to" in update_data and update_data["assigned_to"] is not None:
        validate_assigned_user(
            update_data["assigned_to"],
            tenant_id,
            db
        )

    for field, value in update_data.items():
        setattr(deal, field, value)

    db.commit()
    db.refresh(deal)

    return deal


@router.delete(
    "/{deal_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    dependencies=[Depends(require_permission("deal.delete"))]
)
def delete_deal(
    deal_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):

    tenant_id = current_user["tenant_id"]

    deal = db.query(Deal).filter(
        Deal.id == deal_id,
        Deal.tenant_id == tenant_id
    ).first()

    if not deal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deal not found"
        )

    db.delete(deal)
    db.commit()

    return None