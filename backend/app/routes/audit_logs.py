
from datetime import datetime, time, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_active_user
from app.core.permissions import require_permission
from app.models.audit_log import AuditLog


router = APIRouter(
    prefix="/api/v1/audit-logs",
    tags=["Audit Logs"],
)


@router.get(
    "/",
    dependencies=[Depends(require_permission("audit.view"))],
)
def list_audit_logs(
    module: str | None = Query(default=None, max_length=100),
    action: str | None = Query(default=None, max_length=50),
    record_id: str | None = Query(default=None, max_length=100),
    start_date: datetime | None = Query(default=None),
    end_date: datetime | None = Query(default=None),
    page: int = Query(default=1, ge=1),
    page_size: int = Query(default=25, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: dict = Depends(require_active_user),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(
            status_code=400,
            detail="start_date must be before or equal to end_date",
        )

    tenant_id = UUID(str(current_user["tenant_id"]))

    query = db.query(AuditLog).filter(
        AuditLog.tenant_id == tenant_id
    )

    if module:
        query = query.filter(AuditLog.module == module)

    if action:
        query = query.filter(AuditLog.action == action)

    if record_id:
        query = query.filter(AuditLog.record_id == record_id)

    if start_date:
        query = query.filter(AuditLog.created_at >= start_date)

    if end_date:
        query = query.filter(
            AuditLog.created_at < end_date + timedelta(microseconds=1)
        )

    total = query.count()

    logs = (
        query.order_by(AuditLog.created_at.desc(), AuditLog.id.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    return {
        "items": [
            {
                "id": str(log.id),
                "user_id": str(log.user_id) if log.user_id else None,
                "action": log.action,
                "module": log.module,
                "record_id": log.record_id,
                "description": log.description,
                "before_data": log.before_data,
                "after_data": log.after_data,
                "created_at": log.created_at.isoformat()
                if log.created_at else None,
            }
            for log in logs
        ],
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
        },
    }
