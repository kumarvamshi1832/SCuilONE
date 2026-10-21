import logging
from uuid import UUID

from sqlalchemy.orm import Session

from app.models.notification import Notification
from app.models.user import User
from app.services.email_service import send_notification_email

logger = logging.getLogger(__name__)


def notify_assignment(
    db: Session,
    tenant_id: UUID,
    recipient_user_id: UUID | None,
    actor_user_id: UUID,
    title: str,
    message: str,
    related_module: str,
    related_record_id: UUID,
    notification_type: str = "assignment",
) -> None:
    logger.info(
        "NOTIFY_ASSIGNMENT CALLED: module=%s, recipient=%s, actor=%s, title=%s",
        related_module,
        recipient_user_id,
        actor_user_id,
        title,
    )
        
    if recipient_user_id is None:
        return

    if recipient_user_id == actor_user_id:
        return

    try:
        recipient = db.query(User).filter(
            User.id == recipient_user_id,
            User.tenant_id == tenant_id,
        ).first()

        if recipient is None:
            logger.warning(
                "Notification skipped: recipient "
                "does not belong to the tenant."
            )
            return

        notification = Notification(
            tenant_id=tenant_id,
            recipient_user_id=recipient.id,
            workflow_id=None,
            title=title[:200],
            message=message,
            notification_type=notification_type,
            related_module=related_module,
            related_record_id=related_record_id,
            is_read=False,
        )

        db.add(notification)
        db.commit()

    except Exception:
        db.rollback()
        logger.exception(
            "Failed to create in-app notification."
        )
        return

    recipient_email = getattr(recipient, "email", None)
    
    print(
    f"### EMAIL DEBUG: module={related_module}, "
    f"type={notification_type}, "
    f"recipient_id={recipient.id}, "
    f"email={recipient_email!r} ###",
    flush=True,
)
    logger.info(
        "NOTIFICATION EMAIL CHECK: module=%s, type=%s, "
    "recipient_id=%s, recipient_email=%r, title=%s",
    related_module,
    notification_type,
    recipient.id,
    recipient_email,
    title,
)

    if not recipient_email:
        logger.warning(
            "Notification email skipped: user %s has no email address.",
            recipient.id
        )
        return

    try:
        logger.info(
            "CALLING SEND_NOTIFICATION_EMAIL for %s",
            recipient_email,
            )
        send_notification_email(
            recipient_email=recipient_email,
            title=title,
            message_text=message,
        )
        print("### CALLING SMTP EMAIL FUNCTION ###", flush=True)
    except Exception:
        logger.exception(
            "In-app notification was saved, but email delivery failed "
            "for user %s.",
            recipient.id
        )
