from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from app.database.connection import SessionLocal
from app.core.dependencies import get_current_user
from app.core.permissions import require_permission
from app.models.lead import Lead
from app.schemas.lead import LeadCreate, LeadUpdate, LeadResponse
from app.models.user import User

router = APIRouter(
    prefix="/api/v1/leads",
    tags=["Leads"]
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
    response_model=LeadResponse,
    status_code=status.HTTP_201_CREATED
)
def create_lead(
    data: LeadCreate,
    current_user: dict = Depends(get_current_user),
    permission=Depends(require_permission("lead.create")),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]
    validate_assigned_user(
    data.assigned_to,
    tenant_id,
    db
)

    lead = Lead(
        tenant_id=tenant_id,
        full_name=data.full_name,
        email=data.email,
        phone=data.phone,
        source=data.source,
        status=data.status,
        assigned_to=data.assigned_to,
        notes=data.notes
    )

    db.add(lead)
    db.commit()
    db.refresh(lead)

    return lead


@router.get(
    "/",
    response_model=list[LeadResponse]
)
def get_leads(
    current_user: dict = Depends(get_current_user),
    _=Depends(require_permission("lead.view")),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    leads = db.query(Lead).filter(
        Lead.tenant_id == tenant_id
    ).all()

    return leads


@router.get(
    "/my-leads",
    response_model=list[LeadResponse]
)
def get_my_leads(
    current_user: dict = Depends(get_current_user),
    _=Depends(require_permission("lead.view")),
    db: Session = Depends(get_db)
):
    user_id = UUID(current_user["user_id"])
    tenant_id = UUID(current_user["tenant_id"])

    leads = db.query(Lead).filter(
        Lead.tenant_id == tenant_id,
        Lead.assigned_to == user_id
    ).all()

    return leads

@router.get(
    "/{lead_id}",
    response_model=LeadResponse
)
def get_lead(
    lead_id: UUID,
    current_user: dict = Depends(get_current_user),
    _=Depends(require_permission("lead.view")),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    lead = db.query(Lead).filter(
        Lead.id == lead_id,
        Lead.tenant_id == tenant_id
    ).first()

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )

    return lead

@router.put(
    "/{lead_id}",
    response_model=LeadResponse
)
def update_lead(
    lead_id: UUID,
    data: LeadUpdate,
    current_user: dict = Depends(get_current_user),
    _=Depends(require_permission("lead.update")),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]
    if data.assigned_to is not None:
        validate_assigned_user(
            data.assigned_to,
            tenant_id,
            db
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

    if data.full_name is not None:
        lead.full_name = data.full_name

    if data.email is not None:
        lead.email = data.email

    if data.phone is not None:
        lead.phone = data.phone

    if data.source is not None:
        lead.source = data.source

    if data.status is not None:
        lead.status = data.status

    if data.assigned_to is not None:
        lead.assigned_to = data.assigned_to

    if data.notes is not None:
        lead.notes = data.notes

    db.commit()
    db.refresh(lead)

    return lead



@router.delete(
    "/{lead_id}",
    status_code=status.HTTP_204_NO_CONTENT
)
def delete_lead(
    lead_id: UUID,
    current_user: dict = Depends(get_current_user),
    _=Depends(require_permission("lead.delete")),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    lead = db.query(Lead).filter(
        Lead.id == lead_id,
        Lead.tenant_id == tenant_id
    ).first()

    if not lead:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Lead not found"
        )

    db.delete(lead)
    db.commit()

    return