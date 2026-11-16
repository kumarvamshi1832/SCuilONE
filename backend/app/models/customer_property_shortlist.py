import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class CustomerPropertyShortlist(Base):
    __tablename__ = "customer_property_shortlists"
    __table_args__ = (
        UniqueConstraint(
            "tenant_id", "portal_user_id", "buyer_requirement_id", "property_match_id",
            name="uq_customer_shortlist_portal_requirement_match",
        ),
        Index("ix_customer_shortlists_tenant_portal_requirement", "tenant_id", "portal_user_id", "buyer_requirement_id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    portal_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("customer_portal_users.id", ondelete="CASCADE"), nullable=False)
    buyer_requirement_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("buyer_requirements.id", ondelete="CASCADE"), nullable=False)
    property_match_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("property_matches.id", ondelete="CASCADE"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
