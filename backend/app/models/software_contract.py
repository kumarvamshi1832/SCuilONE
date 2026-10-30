import uuid
from datetime import date, datetime

from sqlalchemy import (
    Date,
    DateTime,
    ForeignKey,
    Index,
    JSON,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database.connection import Base


class SoftwareContract(Base):
    __tablename__ = "software_contracts"

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

    software_estimate_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("software_estimates.id"),
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

    contract_number: Mapped[str] = mapped_column(
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

    contract_value: Mapped[float] = mapped_column(
        Numeric(14, 2),
        nullable=False,
        default=0,
    )

    issue_date: Mapped[date] = mapped_column(
        Date,
        nullable=False,
        default=date.today,
    )

    start_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    end_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    signed_date: Mapped[date | None] = mapped_column(
        Date,
        nullable=True,
    )

    status: Mapped[str] = mapped_column(
        String(30),
        nullable=False,
        default="Draft",
    )

    # Statement of Work
    scope_of_work: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    deliverables: Mapped[str] = mapped_column(
        Text,
        nullable=False,
    )

    exclusions: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    assumptions: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    acceptance_criteria: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    payment_terms: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    terms_and_conditions: Mapped[str | None] = mapped_column(
        Text,
        nullable=True,
    )

    # Snapshot of the accepted estimate's line items
    estimate_snapshot: Mapped[dict | None] = mapped_column(
    JSON,
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


    payment_milestones: Mapped[list["SoftwareContractMilestone"]] = relationship(
        "SoftwareContractMilestone",
        cascade="all, delete-orphan",
        order_by="SoftwareContractMilestone.sequence",
    )

    __table_args__ = (
        UniqueConstraint(
            "tenant_id",
            "contract_number",
            name="uq_software_contracts_tenant_number",
        ),
        UniqueConstraint(
            "tenant_id",
            "software_estimate_id",
            name="uq_software_contracts_tenant_estimate",
        ),
        Index(
            "ix_software_contracts_tenant_status",
            "tenant_id",
            "status",
        ),
        Index(
            "ix_software_contracts_tenant_account",
            "tenant_id",
            "account_id",
        ),
        Index(
            "ix_software_contracts_tenant_estimate",
            "tenant_id",
            "software_estimate_id",
        ),
    )
