
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class NotificationResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    recipient_user_id: UUID
    workflow_id: UUID | None
    title: str
    message: str
    notification_type: str
    related_module: str | None
    related_record_id: UUID | None
    is_read: bool
    created_at: datetime


class NotificationListResponse(BaseModel):
    items: list[NotificationResponse]
    total: int
    unread_count: int
    limit: int
    offset: int


class NotificationReadResponse(BaseModel):
    message: str
    notification_id: UUID | None = None
    is_read: bool
