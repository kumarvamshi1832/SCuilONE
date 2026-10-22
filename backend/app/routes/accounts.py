import logging
from uuid import UUID, uuid4
from app.services.notification_service import notify_assignment
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission

from app.models.account import Account
from app.models.lead import Lead
from app.models.user import User
from app.models.contact import Contact
from app.models.deal import Deal

from app.schemas.account import (
    AccountCreate,
    AccountUpdate,
    AccountResponse,
    AccountDetailsResponse
)

from app.services.workflow_engine import dispatch_workflows


logger = logging.getLogger(__name__)

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



def run_account_workflows(
    db: Session,
    tenant_id: UUID,
    account: Account,
    trigger_event: str,
    event_id: str,
    changed_fields: set = None
):
    try:
        dispatch_workflows(
            db=db,
            tenant_id=tenant_id,
            module_name="accounts",
            trigger_event=trigger_event,
            record=account,
            event_id=event_id,
            changed_fields=changed_fields
        )
        db.commit()

    except Exception:
        db.rollback()
        logger.exception(
            "Workflow dispatch failed for account %s, event %s",
            account.id,
            trigger_event
        )



@router.post(
    "/",
    response_model=AccountResponse,
    status_code=status.HTTP_201_CREATED
)
def create_account(
    data: AccountCreate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("account.create")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

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

    # Use the selected Lead's salesperson when no assignee was selected.
    assigned_to = data.assigned_to

    if assigned_to is None and lead is not None:
        assigned_to = lead.assigned_to

    validate_assigned_user(
        assigned_to,
        tenant_id,
        db
    )

    account = Account(
        tenant_id=tenant_id,
        created_by=user_id,
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
        assigned_to=assigned_to,
        notes=data.notes
    )

    try:
        db.add(account)
        db.flush()

        if lead is not None:
            lead.account_id = account.id

        db.commit()
        db.refresh(account)

    except Exception:
        db.rollback()
        raise

    # Notify the assigned salesperson after the Account is saved.
    if account.assigned_to is not None:
        try:
            notify_assignment(
                db=db,
                tenant_id=tenant_id,
                recipient_user_id=account.assigned_to,
                actor_user_id=user_id,
                title="New account assigned to you",
                message=(
                    f'Account "{account.name}" '
                    f'has been assigned to you.'
                ),
                related_module="accounts",
                related_record_id=account.id,
            )
        except Exception:
            db.rollback()
            logger.exception(
                "Failed to notify account assignee. Account ID: %s",
                account.id
            )

    run_account_workflows(
        db=db,
        tenant_id=tenant_id,
        account=account,
        trigger_event="record_created",
        event_id=str(account.id)
    )

    db.refresh(account)
    return account


@router.post(
    "/{account_id}/leads/{lead_id}",
    status_code=status.HTTP_200_OK
)
def link_lead_to_account(
    account_id: UUID,
    lead_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("lead.update")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(str(current_user["tenant_id"]))

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
    response_model=list[AccountResponse]
)
def get_accounts(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("account.view")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(str(current_user["tenant_id"]))

    return db.query(Account).filter(
        Account.tenant_id == tenant_id
    ).all()


@router.get(
    "/my-accounts",
    response_model=list[AccountResponse]
)
def get_my_accounts(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("account.view")),
    db: Session = Depends(get_db)
):
    user_id = UUID(str(current_user["user_id"]))
    tenant_id = UUID(str(current_user["tenant_id"]))

    return db.query(Account).filter(
        Account.tenant_id == tenant_id,
        Account.assigned_to == user_id
    ).all()


@router.get(
    "/{account_id}",
    response_model=AccountDetailsResponse
)
def get_account(
    account_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("account.view")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(str(current_user["tenant_id"]))

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
        if deal.stage and deal.stage.strip().lower() in (
            "won",
            "closed won"
        )
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
    response_model=AccountResponse
)
def update_account(
    account_id: UUID,
    data: AccountUpdate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("account.update")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

    account = db.query(Account).filter(
        Account.id == account_id,
        Account.tenant_id == tenant_id
    ).first()

    if not account:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Account not found"
        )

    creator_user_id = account.created_by
    previous_assigned_to = account.assigned_to

    if data.assigned_to is not None:
        validate_assigned_user(
            data.assigned_to,
            tenant_id,
            db
        )

    update_data = data.model_dump(exclude_unset=True)
    changed_values = {}

    for field, new_value in update_data.items():
        old_value = getattr(account, field, None)

        if old_value != new_value:
            changed_values[field] = (old_value, new_value)

    if not changed_values:
        return account

    changed_fields = set(changed_values.keys())

    try:
        for field, (_, new_value) in changed_values.items():
            setattr(account, field, new_value)

        db.commit()
        db.refresh(account)

    except Exception:
        db.rollback()
        raise

    # Notify the new assignee when assigned or reassigned.
    if (
        account.assigned_to is not None
        and account.assigned_to != previous_assigned_to
        and account.assigned_to != user_id
    ):
        try:
            notify_assignment(
                db=db,
                tenant_id=tenant_id,
                recipient_user_id=account.assigned_to,
                actor_user_id=user_id,
                title="Account assigned to you",
                message=(
                    f'Account "{account.name}" '
                    f'has been assigned to you.'
                ),
                related_module="accounts",
                related_record_id=account.id,
            )
        except Exception:
            db.rollback()
            logger.exception(
                "Failed to notify account assignee. Account ID: %s",
                account.id
            )

    # Notify the assigned salesperson when the creator updates the account.
    if (
        creator_user_id is not None
        and creator_user_id == user_id
        and account.assigned_to is not None
        and account.assigned_to != user_id
    ):
        changed_field_names = ", ".join(sorted(changed_fields))

        try:
            notify_assignment(
                db=db,
                tenant_id=tenant_id,
                recipient_user_id=account.assigned_to,
                actor_user_id=user_id,
                title="Assigned account updated",
                message=(
                    f'The account creator updated your assigned '
                    f'account "{account.name}". '
                    f"Changed fields: {changed_field_names}."
                ),
                related_module="accounts",
                related_record_id=account.id,
                notification_type="account_update",
            )
        except Exception:
            db.rollback()
            logger.exception(
                "Failed to notify account assignee about creator update. "
                "Account ID: %s",
                account.id
            )

    # Notify the creator when another user updates the account.
    elif (
        creator_user_id is not None
        and creator_user_id != user_id
    ):
        if "assigned_to" in changed_values:
            message = (
                f'Account "{account.name}" was reassigned.'
            )
        else:
            message = (
                f'Account "{account.name}" was updated.'
            )

        try:
            notify_assignment(
                db=db,
                tenant_id=tenant_id,
                recipient_user_id=creator_user_id,
                actor_user_id=user_id,
                title="Account updated",
                message=message,
                related_module="accounts",
                related_record_id=account.id,
                notification_type="account_update",
            )
        except Exception:
            db.rollback()
            logger.exception(
                "Failed to notify account creator. Account ID: %s",
                account.id
            )

    # Preserve the existing workflow dispatch.
    event_base = (
        f"{account.id}:{account.updated_at.isoformat()}"
        if getattr(account, "updated_at", None)
        else f"{account.id}:{uuid4()}"
    )

    run_account_workflows(
        db=db,
        tenant_id=tenant_id,
        account=account,
        trigger_event="record_updated",
        event_id=f"{event_base}:record_updated"
    )

    run_account_workflows(
        db=db,
        tenant_id=tenant_id,
        account=account,
        trigger_event="field_changed",
        event_id=f"{event_base}:field_changed",
        changed_fields=changed_fields
    )

    db.refresh(account)
    return account


@router.delete(
    "/{account_id}"
)
def delete_account(
    account_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("account.delete")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(str(current_user["tenant_id"]))

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
