
import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, Integer, Numeric, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class BuyerRequirement(Base):
    __tablename__ = "buyer_requirements"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id"),
        nullable=False,
    )

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leads.id"),
        nullable=True,
    )

    contact_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("contacts.id"),
        nullable=True,
    )

    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    requirement_type: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="Buy",
    )

    property_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    preferred_city: Mapped[str | None] = mapped_column(
        String(100),
        nullable=True,
    )

    preferred_location: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )

    min_budget: Mapped[float | None] = mapped_column(
        Numeric(14, 2),
        nullable=True,
    )

    max_budget: Mapped[float | None] = mapped_column(
        Numeric(14, 2),
        nullable=True,
    )

    bedrooms: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    min_area: Mapped[float | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )

    max_area: Mapped[float | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )

    area_unit: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="sqft",
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="New",
    )

    notes: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )

    __table_args__ = (
        Index("ix_buyer_requirements_tenant_status", "tenant_id", "status"),
        Index("ix_buyer_requirements_tenant_assigned", "tenant_id", "assigned_to"),
        Index("ix_buyer_requirements_tenant_lead", "tenant_id", "lead_id"),
        Index("ix_buyer_requirements_tenant_contact", "tenant_id", "contact_id"),
    )
