
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class SoftwareRequirement(Base):
    __tablename__ = "software_requirements"

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

    deal_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("deals.id"),
        nullable=True,
        index=True,
    )

    lead_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("leads.id"),
        nullable=True,
    )

    account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("accounts.id"),
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

    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    description: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    software_type: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    platforms: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    integrations: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    min_budget: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 2),
        nullable=True,
    )

    max_budget: Mapped[Decimal | None] = mapped_column(
        Numeric(14, 2),
        nullable=True,
    )

    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="INR",
    )

    target_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    priority: Mapped[str] = mapped_column(
        String(20),
        nullable=False,
        default="Medium",
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
        Index(
            "ix_software_requirements_tenant_status",
            "tenant_id",
            "status",
        ),
        Index(
            "ix_software_requirements_tenant_lead",
            "tenant_id",
            "lead_id",
        ),
        Index(
            "ix_software_requirements_tenant_account",
            "tenant_id",
            "account_id",
        ),
        Index(
            "ix_software_requirements_tenant_assigned",
            "tenant_id",
            "assigned_to",
        ),
    )
