
import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, Text, Integer
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base
from app.models.mixins import SoftDeleteMixin, CustomFieldsMixin


class Lead(SoftDeleteMixin, CustomFieldsMixin, Base):
    __tablename__ = "leads"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id"),
        nullable=False
    )

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True
    )

    full_name: Mapped[str] = mapped_column(
        String(150),
        nullable=False
    )

    email: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True
    )

    phone: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True
    )

    source: Mapped[str | None] = mapped_column(
        String(1000),
        nullable=True
    )

    status: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
        default="New"
    )

    account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("accounts.id"),
        nullable=True
    )

    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True
    )

    # Explainable, tenant-local rule-based lead score (0-100).
    score: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0", index=True)
    engagement_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    score_label: Mapped[str] = mapped_column(String(20), nullable=False, default="Cold", server_default="Cold", index=True)
    score_breakdown: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    scored_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow
    )
