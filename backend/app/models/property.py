import uuid
from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, Text, Numeric, Integer, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class Property(Base):
    __tablename__ = "properties"

    __table_args__ = (
        Index("ix_properties_tenant_status", "tenant_id", "status"),
        Index("ix_properties_tenant_city", "tenant_id", "city"),
        Index("ix_properties_tenant_assigned_to", "tenant_id", "assigned_to"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id"),
        nullable=False,
        index=True,
    )

    created_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    name: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    property_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    listing_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    address: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    city: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    state: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    country: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="India",
    )

    postal_code: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )

    price: Mapped[float] = mapped_column(
        Numeric(14, 2),
        nullable=False,
    )

    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="INR",
    )

    area: Mapped[float | None] = mapped_column(
        Numeric(12, 2),
        nullable=True,
    )

    area_unit: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="sqft",
    )

    bedrooms: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    bathrooms: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    furnishing: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="Unfurnished",
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="Available",
    )

    owner_name: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )

    developer_name: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )

    assigned_to: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
        index=True,
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
