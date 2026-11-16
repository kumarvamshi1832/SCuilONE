"""Trash: list, restore and permanently delete soft-deleted leads, contacts, accounts and deals."""
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_active_user
from app.core.permissions import require_permission
from app.models.account import Account
from app.models.contact import Contact
from app.models.deal import Deal
from app.models.lead import Lead
from app.models.mixins import restore_record
from app.models.user import User
from app.services.audit_service import log_audit

router = APIRouter(prefix="/api/v1/trash", tags=["Trash"])

Entity = Literal["lead", "contact", "account", "deal"]
MODELS = {"lead": Lead, "contact": Contact, "account": Account, "deal": Deal}


def _label(entity: str, rec) -> str:
    return rec.name if entity == "deal" else (getattr(rec, "full_name", None) or getattr(rec, "name", None) or str(rec.id))


def _deleted_query(db: Session, entity: str, tenant_id: UUID):
    model = MODELS[entity]
    return (
        db.query(model)
        .execution_options(include_deleted=True)
        .filter(model.tenant_id == tenant_id, model.deleted_at.isnot(None))
    )


@router.get("/{entity}")
def list_trash(
    entity: Entity,
    skip: int = Query(default=0, ge=0),
    limit: int = Query(default=25, ge=1, le=100),
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("trash.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    model = MODELS[entity]
    rows = _deleted_query(db, entity, tenant_id).order_by(model.deleted_at.desc()).offset(skip).limit(limit).all()
    user_ids = {r.deleted_by for r in rows if r.deleted_by}
    names = {u.id: u.full_name for u in db.query(User.id, User.full_name).filter(User.id.in_(user_ids)).all()} if user_ids else {}
    return [
        {"id": r.id, "entity": entity, "label": _label(entity, r), "deleted_at": r.deleted_at,
         "deleted_by": r.deleted_by, "deleted_by_name": names.get(r.deleted_by)}
        for r in rows
    ]


def _get_deleted(db: Session, entity: str, tenant_id: UUID, record_id: UUID):
    model = MODELS[entity]
    rec = _deleted_query(db, entity, tenant_id).filter(model.id == record_id).first()
    if not rec:
        raise HTTPException(status_code=404, detail=f"Deleted {entity} not found")
    return rec


@router.post("/{entity}/{record_id}/restore")
def restore(
    entity: Entity,
    record_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("trash.restore")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(str(current_user["tenant_id"]))
    rec = _get_deleted(db, entity, tenant_id, record_id)
    restore_record(rec)
    log_audit(db, tenant_id, current_user["user_id"], "RESTORE", entity, rec.id,
              description=f"Restored {entity} '{_label(entity, rec)}' from trash")
    db.commit()
    return {"id": rec.id, "entity": entity, "restored": True}


@router.delete("/{entity}/{record_id}", status_code=status.HTTP_204_NO_CONTENT)
def purge(
    entity: Entity,
    record_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("trash.purge")),
    db: Session = Depends(get_db),
):
    """Permanently remove a record that is already in the trash. Fails if other records still depend on it."""
    tenant_id = UUID(str(current_user["tenant_id"]))
    rec = _get_deleted(db, entity, tenant_id, record_id)
    label = _label(entity, rec)
    try:
        db.delete(rec)
        log_audit(db, tenant_id, current_user["user_id"], "PURGE", entity, record_id,
                  description=f"Permanently deleted {entity} '{label}'")
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail=f"This {entity} is still referenced by other records and cannot be permanently deleted.")
