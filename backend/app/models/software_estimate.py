from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.software_estimate_item import SoftwareEstimateItem
import uuid
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID

from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base


class SoftwareEstimate(Base):


    items: Mapped[list["SoftwareEstimateItem"]] = relationship(
    "SoftwareEstimateItem",
    back_populates="estimate",
    cascade="all, delete-orphan",
    order_by="SoftwareEstimateItem.sort_order",
)
    
    __tablename__ = "software_estimates"

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

    software_requirement_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("software_requirements.id"),
        nullable=False,
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

    estimate_number: Mapped[str] = mapped_column(
        String(50),
        nullable=False,
    )

    title: Mapped[str] = mapped_column(
        String(200),
        nullable=False,
    )

    description: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    currency: Mapped[str] = mapped_column(
        String(3),
        nullable=False,
        default="INR",
    )

    issue_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        default=date.today,
    )

    expiry_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    subtotal: Mapped[float] = mapped_column(
        Numeric(14, 2),
        nullable=False,
        default=0,
    )

    discount_amount: Mapped[float] = mapped_column(
        Numeric(14, 2),
        nullable=False,
        default=0,
    )

    tax_amount: Mapped[float] = mapped_column(
        Numeric(14, 2),
        nullable=False,
        default=0,
    )

    total_amount: Mapped[float] = mapped_column(
        Numeric(14, 2),
        nullable=False,
        default=0,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="Draft",
    )

    terms_and_conditions: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
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
        UniqueConstraint(
            "tenant_id",
            "estimate_number",
            name="uq_software_estimates_tenant_number",
        ),
        Index(
            "ix_software_estimates_tenant_status",
            "tenant_id",
            "status",
        ),
        Index(
            "ix_software_estimates_tenant_requirement",
            "tenant_id",
            "software_requirement_id",
        ),
        Index(
            "ix_software_estimates_tenant_account",
            "tenant_id",
            "account_id",
        ),
        
    )
