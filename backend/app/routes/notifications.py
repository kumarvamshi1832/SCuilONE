
from uuid import UUID

from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.models.notification import Notification
from app.schemas.notification import (
    NotificationListResponse,
    NotificationResponse,
    NotificationReadResponse,
)


router = APIRouter(
    prefix="/api/v1/notifications",
    tags=["Notifications"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_user_notification_query(db: Session, current_user: dict):
    tenant_id = UUID(current_user["tenant_id"])
    user_id = UUID(current_user["user_id"])

    return db.query(Notification).filter(
        Notification.tenant_id == tenant_id,
        Notification.recipient_user_id == user_id,
    )


@router.get(
    "/",
    response_model=NotificationListResponse,
)
def list_notifications(
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    query = get_user_notification_query(db, current_user)

    total = query.count()

    unread_count = query.filter(
        Notification.is_read.is_(False)
    ).count()

    items = (
        query
        .order_by(Notification.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )

    return {
        "items": items,
        "total": total,
        "unread_count": unread_count,
        "limit": limit,
        "offset": offset,
    }


@router.get("/unread-count")
def get_unread_count(
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    unread_count = get_user_notification_query(
        db, current_user
    ).filter(
        Notification.is_read.is_(False)
    ).count()

    return {"unread_count": unread_count}


@router.patch(
    "/read-all",
    response_model=NotificationReadResponse,
)
def mark_all_notifications_read(
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    try:
        query = get_user_notification_query(db, current_user)

        updated_count = query.filter(
            Notification.is_read.is_(False)
        ).update(
            {Notification.is_read: True},
            synchronize_session=False,
        )

        db.commit()

        return {
            "message": f"Marked {updated_count} notifications as read",
            "notification_id": None,
            "is_read": True,
        }

    except Exception:
        db.rollback()
        raise


@router.patch(
    "/{notification_id}/read",
    response_model=NotificationReadResponse,
)
def mark_notification_read(
    notification_id: UUID,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    notification = get_user_notification_query(
        db, current_user
    ).filter(
        Notification.id == notification_id
    ).first()

    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found",
        )

    try:
        notification.is_read = True
        db.commit()

        return {
            "message": "Notification marked as read",
            "notification_id": notification.id,
            "is_read": True,
        }

    except Exception:
        db.rollback()
        raise
