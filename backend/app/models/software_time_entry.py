import uuid
from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class SoftwareTimeEntry(Base):
    __tablename__ = "software_time_entries"

    __table_args__ = (
        CheckConstraint(
            "duration_minutes IS NULL OR duration_minutes > 0",
            name="ck_software_time_entries_positive_duration",
        ),
        CheckConstraint(
            "source IN ('manual', 'timer')",
            name="ck_software_time_entries_source",
        ),
        Index(
            "ix_software_time_entries_tenant_activity",
            "tenant_id",
            "activity_id",
        ),
        Index(
            "ix_software_time_entries_tenant_user_date",
            "tenant_id",
            "user_id",
            "work_date",
        ),
        Index(
            "uq_software_time_entries_one_active_timer_per_user",
            "tenant_id",
            "user_id",
            unique=True,
            postgresql_where=text("source = 'timer' AND stopped_at IS NULL"),
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("tenants.id"), nullable=False, index=True
    )
    activity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    duration_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    work_date: Mapped[date] = mapped_column(Date, nullable=False, default=date.today)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_billable: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    billing_status: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="Unreviewed",
        server_default=text("'Unreviewed'"),
    )
    source: Mapped[str] = mapped_column(String(10), nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    stopped_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )
