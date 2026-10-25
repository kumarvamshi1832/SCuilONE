
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class SiteVisit(Base):
    __tablename__ = "site_visits"

    __table_args__ = (
        Index("ix_site_visits_tenant_match", "tenant_id", "property_match_id"),
        Index("ix_site_visits_tenant_assigned_start", "tenant_id", "assigned_to", "scheduled_start"),
        Index("ix_site_visits_tenant_status", "tenant_id", "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False
    )
    property_match_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("property_matches.id", ondelete="CASCADE"),
        nullable=False,
    )
    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )

    scheduled_start: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    scheduled_end: Mapped[datetime] = mapped_column(DateTime, nullable=False)
    status: Mapped[str] = mapped_column(
        String(30), nullable=False, default="Scheduled"
    )
    outcome: Mapped[str | None] = mapped_column(String(40), nullable=True)
    buyer_feedback: Mapped[str | None] = mapped_column(Text, nullable=True)
    interest_level: Mapped[str | None] = mapped_column(String(30), nullable=True)
    follow_up_required: Mapped[bool] = mapped_column(
        nullable=False, default=False
    )
    follow_up_date: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    cancellation_reason: Mapped[str | None] = mapped_column(
        Text, nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
