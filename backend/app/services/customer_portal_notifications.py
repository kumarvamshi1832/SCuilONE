from uuid import UUID
from app.models.customer_portal_lifecycle import CustomerPortalNotification
from app.models.customer_booking_journey import CustomerBookingRequest


def notify_customer(db, tenant_id: UUID, portal_user_id: UUID, title: str, message: str,
                    notification_type: str = "general", related_module: str | None = None,
                    related_record_id: UUID | None = None) -> None:
    db.add(CustomerPortalNotification(
        tenant_id=tenant_id,
        portal_user_id=portal_user_id,
        title=title[:200],
        message=message,
        notification_type=notification_type,
        related_module=related_module,
        related_record_id=related_record_id,
        is_read=False,
    ))


def notify_booking_customer(db, tenant_id: UUID, booking_id: UUID, title: str, message: str,
                            notification_type: str = "booking_update", related_module: str = "bookings",
                            related_record_id: UUID | None = None) -> bool:
    request = db.query(CustomerBookingRequest).filter(
        CustomerBookingRequest.tenant_id == tenant_id,
        CustomerBookingRequest.booking_id == booking_id,
    ).first()
    if not request:
        return False
    notify_customer(db, tenant_id, request.portal_user_id, title, message,
                    notification_type, related_module, related_record_id or booking_id)
    return True
