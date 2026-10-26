
import logging
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission

from app.models.deal import Deal
from app.models.booking import Booking
from app.models.lead import Lead
from app.models.contact import Contact
from app.models.account import Account
from app.models.user import User
from app.models.pipeline import Pipeline, PipelineStage

from app.schemas.deal import DealCreate, DealUpdate, DealResponse
from app.services.notification_service import notify_assignment
from app.services.workflow_engine import dispatch_workflows
from app.services.audit_service import log_audit


logger = logging.getLogger(__name__)

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


def run_deal_workflows(
    db: Session,
    tenant_id: UUID,
    deal: Deal,
    trigger_event: str,
    event_id: str,
    changed_fields: set = None
):
    try:
        dispatch_workflows(
            db=db,
            tenant_id=tenant_id,
            module_name="deals",
            trigger_event=trigger_event,
            record=deal,
            event_id=event_id,
            changed_fields=changed_fields
        )
        db.commit()

    except Exception:
        db.rollback()
        logger.exception(
            "Workflow dispatch failed for deal %s, event %s",
            deal.id,
            trigger_event
        )


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

    return lead

def validate_booking(
    booking_id: UUID,
    tenant_id: UUID,
    db: Session,
) -> Booking:
    booking = (
        db.query(Booking)
        .filter(
            Booking.id == booking_id,
            Booking.tenant_id == tenant_id,
        )
        .first()
    )

    if booking is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Booking not found in this tenant.",
        )

    return booking


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

    return contact


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

    return account


def validate_lead_account(
    lead: Lead,
    account_id: UUID
):
    if lead.account_id != account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Lead does not belong to the selected account"
        )


def validate_contact_account(
    contact: Contact,
    account_id: UUID
):
    if contact.account_id != account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Contact does not belong to the selected account"
        )


def validate_pipeline_stage(
    pipeline_id: UUID | None,
    pipeline_stage_id: UUID | None,
    tenant_id: UUID,
    db: Session
):
    if pipeline_id is None and pipeline_stage_id is None:
        return None

    if pipeline_id is None or pipeline_stage_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Both pipeline_id and pipeline_stage_id are required"
        )

    pipeline = db.query(Pipeline).filter(
        Pipeline.id == pipeline_id,
        Pipeline.tenant_id == tenant_id
    ).first()

    if not pipeline:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Pipeline not found or does not belong to this tenant"
        )

    if not pipeline.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selected pipeline is inactive"
        )

    pipeline_stage = db.query(PipelineStage).filter(
        PipelineStage.id == pipeline_stage_id,
        PipelineStage.pipeline_id == pipeline_id
    ).first()

    if not pipeline_stage:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Stage does not belong to the selected pipeline"
        )

    if not pipeline_stage.is_active:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Selected pipeline stage is inactive"
        )

    return pipeline_stage


def deal_audit_data(deal: Deal):
    return {
        "name": deal.name,
        "lead_id": deal.lead_id,
        "booking_id": deal.booking_id,
        "contact_id": deal.contact_id,
        "account_id": deal.account_id,
        "assigned_to": deal.assigned_to,
        "amount": deal.amount,
        "stage": deal.stage,
        "pipeline_id": deal.pipeline_id,
        "pipeline_stage_id": deal.pipeline_stage_id,
        "expected_close_date": deal.expected_close_date,
        "description": deal.description,
        "created_by": deal.created_by,
    }


@router.post(
    "/",
    response_model=DealResponse,
    status_code=status.HTTP_201_CREATED
)
def create_deal(
    data: DealCreate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("deal.create")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

    if (data.lead_id or data.contact_id) and not data.account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is required when Lead or Contact is selected"
        )

    lead = None
    contact = None
    account = None

    if data.account_id:
        account = validate_account(data.account_id, tenant_id, db)

    if data.lead_id:
        lead = validate_lead(data.lead_id, tenant_id, db)

    booking = None

    if data.booking_id:
        booking = validate_booking(data.booking_id, tenant_id, db)

        if (
            data.lead_id is not None
            and booking.lead_id is not None
            and data.lead_id != booking.lead_id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The selected booking belongs to a different lead.",
            )

    if data.contact_id:
        contact = validate_contact(data.contact_id, tenant_id, db)
    if data.account_id and lead:
        validate_lead_account(lead, data.account_id)

    if data.account_id and contact:
        validate_contact_account(contact, data.account_id)

    assigned_to = data.assigned_to

    if assigned_to is None:
        if lead is not None and lead.assigned_to is not None:
            assigned_to = lead.assigned_to
        elif contact is not None and contact.assigned_to is not None:
            assigned_to = contact.assigned_to
        elif account is not None and account.assigned_to is not None:
            assigned_to = account.assigned_to

    if assigned_to is not None:
        validate_assigned_user(assigned_to, tenant_id, db)

    pipeline_stage = validate_pipeline_stage(
        data.pipeline_id,
        data.pipeline_stage_id,
        tenant_id,
        db
    )

    deal = Deal(
        tenant_id=tenant_id,
        created_by=user_id,
        name=data.name,
        lead_id=data.lead_id,
        booking_id=data.booking_id,
        contact_id=data.contact_id,
        account_id=data.account_id,
        assigned_to=assigned_to,
        amount=data.amount,
        stage=pipeline_stage.name if pipeline_stage else data.stage,
        pipeline_id=data.pipeline_id,
        pipeline_stage_id=data.pipeline_stage_id,
        expected_close_date=data.expected_close_date,
        description=data.description
    )

    try:
        db.add(deal)
        db.flush()

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="create",
            module="deals",
            record_id=deal.id,
            description=f"Created deal {deal.name}",
            after_data=deal_audit_data(deal),
        )

        db.commit()
        db.refresh(deal)

    except Exception:
        db.rollback()
        raise

    if deal.assigned_to is not None:
        try:
            notify_assignment(
                db=db,
                tenant_id=tenant_id,
                recipient_user_id=deal.assigned_to,
                actor_user_id=user_id,
                title="New deal assigned to you",
                message=f'Deal "{deal.name}" has been assigned to you.',
                related_module="deals",
                related_record_id=deal.id,
            )
        except Exception:
            db.rollback()
            logger.exception(
                "Failed to notify deal assignee. Deal ID: %s",
                deal.id
            )

    run_deal_workflows(
        db=db,
        tenant_id=tenant_id,
        deal=deal,
        trigger_event="record_created",
        event_id=str(deal.id)
    )

    db.refresh(deal)
    return deal


@router.get(
    "/",
    response_model=list[DealResponse]
)
def get_deals(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("deal.view")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(str(current_user["tenant_id"]))

    return db.query(Deal).filter(
        Deal.tenant_id == tenant_id
    ).all()


@router.get(
    "/my-deals",
    response_model=list[DealResponse]
)
def get_my_deals(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("deal.view")),
    db: Session = Depends(get_db)
):
    user_id = UUID(str(current_user["user_id"]))
    tenant_id = UUID(str(current_user["tenant_id"]))

    return db.query(Deal).filter(
        Deal.tenant_id == tenant_id,
        Deal.assigned_to == user_id
    ).all()


@router.get(
    "/{deal_id}",
    response_model=DealResponse
)
def get_deal(
    deal_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("deal.view")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(str(current_user["tenant_id"]))

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
    response_model=DealResponse
)
def update_deal(
    deal_id: UUID,
    data: DealUpdate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("deal.update")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    user_id = UUID(str(current_user["user_id"]))

    deal = db.query(Deal).filter(
        Deal.id == deal_id,
        Deal.tenant_id == tenant_id
    ).first()

    if not deal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deal not found"
        )

    creator_user_id = deal.created_by
    previous_assigned_to = deal.assigned_to

    update_data = data.model_dump(exclude_unset=True)

    new_account_id = update_data.get(
        "account_id",
        deal.account_id
    )
    new_lead_id = update_data.get(
        "lead_id",
        deal.lead_id
    )

    new_booking_id = update_data.get(
        "booking_id",
        deal.booking_id
    )
    new_contact_id = update_data.get(
        "contact_id",
        deal.contact_id
    )
    new_pipeline_id = update_data.get(
        "pipeline_id",
        deal.pipeline_id
    )
    new_pipeline_stage_id = update_data.get(
        "pipeline_stage_id",
        deal.pipeline_stage_id
    )

    if (new_lead_id or new_contact_id) and not new_account_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Account is required when Lead or Contact is selected"
        )

    lead = None
    contact = None

    if new_account_id:
        validate_account(new_account_id, tenant_id, db)

    if new_lead_id:
        lead = validate_lead(new_lead_id, tenant_id, db)

    booking = None

    if new_booking_id:
        booking = validate_booking(new_booking_id, tenant_id, db)

        if (
            new_lead_id is not None
            and booking.lead_id is not None
            and new_lead_id != booking.lead_id
        ):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="The selected booking belongs to a different lead.",
            )

    if new_contact_id:
        contact = validate_contact(new_contact_id, tenant_id, db)
    if new_account_id and lead:
        validate_lead_account(lead, new_account_id)

    if new_account_id and contact:
        validate_contact_account(contact, new_account_id)

    if (
        "assigned_to" in update_data
        and update_data["assigned_to"] is not None
    ):
        validate_assigned_user(
            update_data["assigned_to"],
            tenant_id,
            db
        )

    pipeline_fields_updated = (
        "pipeline_id" in update_data
        or "pipeline_stage_id" in update_data
    )

    if pipeline_fields_updated:
        pipeline_stage = validate_pipeline_stage(
            new_pipeline_id,
            new_pipeline_stage_id,
            tenant_id,
            db
        )

        if pipeline_stage:
            update_data["stage"] = pipeline_stage.name

        elif (
            new_pipeline_id is None
            and new_pipeline_stage_id is None
        ):
            update_data["stage"] = update_data.get(
                "stage",
                deal.stage
            )

    elif (
        "stage" in update_data
        and deal.pipeline_id is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Update pipeline_stage_id to change the stage "
                "of a pipeline-linked deal"
            )
        )

    changed_fields = set()

    for field, new_value in update_data.items():
        old_value = getattr(deal, field, None)

        if old_value != new_value:
            changed_fields.add(field)

    if not changed_fields:
        return deal

    before_data = {
        field: getattr(deal, field, None)
        for field in changed_fields
    }

    try:
        for field in changed_fields:
            setattr(deal, field, update_data[field])

        db.flush()

        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=user_id,
            action="update",
            module="deals",
            record_id=deal.id,
            description=f"Updated deal {deal.name}",
            before_data=before_data,
            after_data={
                field: getattr(deal, field, None)
                for field in changed_fields
            },
        )

        db.commit()
        db.refresh(deal)

    except Exception:
        db.rollback()
        raise

    try:
        current_assigned_to = deal.assigned_to

        if (
            current_assigned_to is not None
            and current_assigned_to != previous_assigned_to
            and current_assigned_to != user_id
        ):
            notify_assignment(
                db=db,
                tenant_id=tenant_id,
                recipient_user_id=current_assigned_to,
                actor_user_id=user_id,
                title="Deal assigned to you",
                message=f'Deal "{deal.name}" has been assigned to you.',
                related_module="deals",
                related_record_id=deal.id,
                notification_type="assignment"
            )

        if (
            creator_user_id is not None
            and user_id == creator_user_id
            and current_assigned_to is not None
            and current_assigned_to != creator_user_id
        ):
            changed_fields_text = ", ".join(sorted(changed_fields))

            notify_assignment(
                db=db,
                tenant_id=tenant_id,
                recipient_user_id=current_assigned_to,
                actor_user_id=user_id,
                title="Assigned deal updated",
                message=(
                    f'The deal "{deal.name}" you are assigned to '
                    f'was updated by its creator. '
                    f"Changed fields: {changed_fields_text}."
                ),
                related_module="deals",
                related_record_id=deal.id,
                notification_type="deal_update"
            )

        elif (
            creator_user_id is not None
            and user_id != creator_user_id
        ):
            if "stage" in changed_fields:
                message = (
                    f'The deal "{deal.name}" stage was changed '
                    f"to {deal.stage} by another user."
                )
            else:
                changed_fields_text = ", ".join(sorted(changed_fields))

                message = (
                    f'The deal "{deal.name}" was updated by '
                    f"another user. Changed fields: "
                    f"{changed_fields_text}."
                )

            notify_assignment(
                db=db,
                tenant_id=tenant_id,
                recipient_user_id=creator_user_id,
                actor_user_id=user_id,
                title="Deal updated",
                message=message,
                related_module="deals",
                related_record_id=deal.id,
                notification_type="deal_update"
            )

    except Exception:
        db.rollback()
        logger.exception(
            "Failed to create deal update notifications for deal %s",
            deal.id
        )

    event_base = f"{deal.id}:{uuid4()}"

    run_deal_workflows(
        db=db,
        tenant_id=tenant_id,
        deal=deal,
        trigger_event="record_updated",
        event_id=f"{event_base}:record_updated"
    )

    run_deal_workflows(
        db=db,
        tenant_id=tenant_id,
        deal=deal,
        trigger_event="field_changed",
        event_id=f"{event_base}:field_changed",
        changed_fields=changed_fields
    )

    db.refresh(deal)
    return deal


@router.delete(
    "/{deal_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_deal(
    deal_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("deal.delete")),
    db: Session = Depends(get_db)
):
    tenant_id = UUID(str(current_user["tenant_id"]))

    deal = db.query(Deal).filter(
        Deal.id == deal_id,
        Deal.tenant_id == tenant_id
    ).first()

    if not deal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deal not found"
        )

    try:
        log_audit(
            db=db,
            tenant_id=tenant_id,
            user_id=UUID(str(current_user["user_id"])),
            action="delete",
            module="deals",
            record_id=deal.id,
            description=f"Deleted deal {deal.name}",
            before_data=deal_audit_data(deal),
        )

        db.delete(deal)
        db.commit()

    except Exception:
        db.rollback()
        raise

    return None
