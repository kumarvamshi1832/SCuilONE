import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class BuildingImage(Base):
    __tablename__ = "building_images"

    __table_args__ = (
        Index(
            "ix_building_images_tenant_building",
            "tenant_id",
            "building_id",
        ),
        Index(
            "ix_building_images_building_primary",
            "building_id",
            "is_primary",
        ),
        Index(
            "uq_building_images_one_primary",
            "building_id",
            unique=True,
            postgresql_where=text("is_primary IS TRUE"),
        ),
        CheckConstraint(
            "sort_order >= 0",
            name="ck_building_images_sort_order_nonnegative",
        ),
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

    building_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("buildings.id", ondelete="CASCADE"),
        nullable=False,
    )

    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("users.id"),
        nullable=True,
    )

    image_url: Mapped[str] = mapped_column(
        String(2048),
        nullable=False,
    )

    public_id: Mapped[str] = mapped_column(
        String(255),
        nullable=False,
        unique=True,
    )

    image_type: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="Exterior",
    )

    is_primary: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
    )

    sort_order: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        nullable=False,
        default=datetime.utcnow,
    )
