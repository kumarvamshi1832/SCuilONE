import uuid
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class Project(Base):
    __tablename__ = "projects"

    __table_args__ = (
        Index("ix_projects_tenant_status", "tenant_id", "status"),
        Index("ix_projects_tenant_city", "tenant_id", "city"),
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

    developer_name: Mapped[str | None] = mapped_column(
        String(200),
        nullable=True,
    )

    project_type: Mapped[str] = mapped_column(
        String(50),
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

    amenities: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    total_buildings: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    total_units: Mapped[int | None] = mapped_column(
        Integer,
        nullable=True,
    )

    construction_status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="Planning",
    )

    start_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    expected_completion_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="Active",
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
