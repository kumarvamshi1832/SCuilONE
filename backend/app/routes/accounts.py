from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.core.dependencies import get_current_user
from app.core.permissions import require_permission

from app.models.account import Account
from app.models.lead import Lead
from app.models.user import User

from sqlalchemy import func

from app.models.contact import Contact
from app.models.deal import Deal

from app.schemas.account import AccountDetailsResponse

from app.schemas.account import (
    AccountCreate,
    AccountUpdate,
    AccountResponse
)


router = APIRouter(
    prefix="/api/v1/accounts",
    tags=["Accounts"]
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def validate_assigned_user(
    assigned_to: UUID | None,
    tenant_id: UUID,
    db: Session
):
    if assigned_to is None:
        return

    user = db.query(User).filter(
        User.id == assigned_to,
        User.tenant_id == tenant_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Assigned user does not belong to this tenant"
        )


@router.post(
    "/",
    response_model=AccountResponse,
    status_code=status.HTTP_201_CREATED,
    dependencies=[Depends(require_permission("account.create"))]
)
def create_account(
    data: AccountCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    validate_assigned_user(
        data.assigned_to,
        tenant_id,
        db
    )

    lead = None

    if data.lead_id is not None:
        lead = db.query(Lead).filter(
            Lead.id == data.lead_id,
            Lead.tenant_id == tenant_id
        ).first()

        if not lead:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Lead not found"
            )

        if lead.account_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This Lead is already linked to an Account"
            )

    account = Account(
        tenant_id=tenant_id,
        name=data.name,
        email=data.email,
        phone=data.phone,
        website=data.website,
        industry=data.industry,
        address=data.address,
        city=data.city,
        state=data.state,
        country=data.country,
        postal_code=data.postal_code,
        status=data.status,
        source=data.source,
        assigned_to=data.assigned_to,
        notes=data.notes
    )

    db.add(account)
    db.flush()

    if lead is not None:
        lead.account_id = account.id

    db.commit()
    db.refresh(account)

    return account


@router.post(
    "/{account_id}/leads/{lead_id}",
    status_code=status.HTTP_200_OK,
    dependencies=[Depends(require_permission("lead.update"))]
)
def link_lead_to_account(
    account_id: UUID,
    lead_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    account = db.query(Account).filter(
        Account.id == account_id,
        Account.tenant_id == tenant_id
    ).first()

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )

    lead = db.query(Lead).filter(
        Lead.id == lead_id,
        Lead.tenant_id == tenant_id
    ).first()

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )

    if lead.account_id == account.id:
        return {
            "message": "Lead is already linked to this Account",
            "account_id": str(account.id),
            "lead_id": str(lead.id)
        }

    if lead.account_id is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This Lead is already linked to another Account"
        )

    lead.account_id = account.id

    db.commit()

    return {
        "message": "Lead linked to Account successfully",
        "account_id": str(account.id),
        "account_name": account.name,
        "lead_id": str(lead.id),
        "lead_name": lead.full_name
    }


@router.get(
    "/",
    response_model=list[AccountResponse],
    dependencies=[Depends(require_permission("account.view"))]
)
def get_accounts(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    return db.query(Account).filter(
        Account.tenant_id == tenant_id
    ).all()



@router.get(
    "/my-accounts",
    response_model=list[AccountResponse],
    dependencies=[Depends(require_permission("account.view"))]
)
def get_my_accounts(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = UUID(current_user["user_id"])
    tenant_id = UUID(current_user["tenant_id"])

    accounts = db.query(Account).filter(
        Account.tenant_id == tenant_id,
        Account.assigned_to == user_id
    ).all()

    return accounts

@router.get(
    "/{account_id}",
    response_model=AccountDetailsResponse,
    dependencies=[Depends(require_permission("account.view"))]
)
def get_account(
    account_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    account = db.query(Account).filter(
        Account.id == account_id,
        Account.tenant_id == tenant_id
    ).first()

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )

    leads = db.query(Lead).filter(
        Lead.account_id == account.id,
        Lead.tenant_id == tenant_id
    ).all()

    contacts = db.query(Contact).filter(
        Contact.account_id == account.id,
        Contact.tenant_id == tenant_id
    ).all()

    deals = db.query(Deal).filter(
        Deal.account_id == account.id,
        Deal.tenant_id == tenant_id
    ).all()

    won_deals = [
        deal for deal in deals
        if deal.stage.strip().lower() == "won"
    ]

    total_revenue = sum(
        float(deal.amount or 0)
        for deal in won_deals
    )

    return {
        "id": account.id,
        "tenant_id": account.tenant_id,
        "name": account.name,
        "email": account.email,
        "phone": account.phone,
        "website": account.website,
        "industry": account.industry,
        "address": account.address,
        "city": account.city,
        "state": account.state,
        "country": account.country,
        "postal_code": account.postal_code,
        "status": account.status,
        "source": account.source,
        "assigned_to": account.assigned_to,
        "notes": account.notes,
        "created_at": account.created_at,
        "updated_at": account.updated_at,
        "leads": leads,
        "contacts": contacts,
        "deals": deals,
        "total_deals": len(deals),
        "won_deals": len(won_deals),
        "total_revenue": total_revenue
    }

@router.put(
    "/{account_id}",
    response_model=AccountResponse,
    dependencies=[Depends(require_permission("account.update"))]
)
def update_account(
    account_id: UUID,
    data: AccountUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    account = db.query(Account).filter(
        Account.id == account_id,
        Account.tenant_id == tenant_id
    ).first()

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )

    if data.assigned_to is not None:
        validate_assigned_user(
            data.assigned_to,
            tenant_id,
            db
        )

    update_data = data.model_dump(exclude_unset=True)

    for field, value in update_data.items():
        setattr(account, field, value)

    db.commit()
    db.refresh(account)

    return account


@router.delete(
    "/{account_id}",
    dependencies=[Depends(require_permission("account.delete"))]
)
def delete_account(
    account_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    account = db.query(Account).filter(
        Account.id == account_id,
        Account.tenant_id == tenant_id
    ).first()

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )

    db.delete(account)
    db.commit()

    return {
        "message": "Account deleted successfully"
    }
