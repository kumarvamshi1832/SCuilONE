import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base


class ActivityLink(Base):
    __tablename__ = "activity_links"

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "activity_id",
            "module",
            "record_id",
            name="uq_activity_links_activity_target",
        ),
        Index(
            "ix_activity_links_tenant_module_record",
            "tenant_id",
            "module",
            "record_id",
        ),
        Index(
            "ix_activity_links_tenant_activity",
            "tenant_id",
            "activity_id",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id"),
        nullable=False,
    )

    activity_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("activities.id", ondelete="CASCADE"),
        nullable=False,
    )

    module: Mapped[str] = mapped_column(String(50), nullable=False)

    record_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime, nullable=False, default=datetime.utcnow
    )

    activity: Mapped["Activity"] = relationship(
        "Activity", back_populates="related_records"
    )
