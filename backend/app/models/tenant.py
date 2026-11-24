import uuid
from datetime import datetime

from sqlalchemy import Boolean, CheckConstraint, DateTime, Index, String, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base

REAL_ESTATE_BUSINESS_TYPES = ("real_estate_company", "real_estate_agency")


class Tenant(Base):
    __tablename__ = "tenants"
    __table_args__ = (
        CheckConstraint(
            "business_type IS NULL OR business_type IN ('real_estate_company', 'real_estate_agency')",
            name="ck_tenants_business_type_valid",
        ),
        Index("ix_tenants_industry_business_type", "industry", "business_type"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )

    name: Mapped[str] = mapped_column(
        String(150),
        nullable=False,
    )

    industry: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
    )

    # Distinguishes Real Estate Company vs Real Estate Agency; NULL for other industries.
    business_type: Mapped[str | None] = mapped_column(
        String(40),
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="Active",
        server_default="Active",
    )

    is_platform: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    billing_email: Mapped[str | None] = mapped_column(
        String(255),
        nullable=True,
    )

    billing_phone: Mapped[str | None] = mapped_column(
        String(30),
        nullable=True,
    )

    billing_address: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    gst_number: Mapped[str | None] = mapped_column(
        String(40),
        nullable=True,
    )

    trial_used: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    email_reminders_opt_out: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )

    unsubscribe_token: Mapped[str | None] = mapped_column(
        String(120),
        unique=True,
        nullable=True,
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
    )

    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=datetime.utcnow,
        onupdate=datetime.utcnow,
    )