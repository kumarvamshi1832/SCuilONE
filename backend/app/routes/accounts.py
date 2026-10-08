from uuid import UUID
from app.models.lead import Lead
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.core.dependencies import get_current_user
from app.core.permissions import require_permission
from app.models.account import Account
from app.models.user import User
from app.schemas.account import AccountCreate, AccountUpdate, AccountResponse


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
    tenant_id,
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

    accounts = db.query(Account).filter(
        Account.tenant_id == tenant_id
    ).all()

    return accounts


@router.get(
    "/{account_id}",
    response_model=AccountResponse,
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

    return account


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