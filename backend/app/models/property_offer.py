import uuid
from datetime import datetime
from decimal import Decimal
from sqlalchemy import Integer, DateTime, ForeignKey, Index, Numeric, String, Text, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database.connection import Base

class PropertyOffer(Base):
    __tablename__ = "property_offers"
    __table_args__ = (
        Index("ix_property_offers_tenant_match_created", "tenant_id", "property_match_id", "created_at"),
        Index("ix_property_offers_tenant_status", "tenant_id", "status"),
        CheckConstraint("offered_price > 0", name="ck_property_offers_price_positive"),
    )
    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    tenant_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("tenants.id", ondelete="CASCADE"), nullable=False)
    property_match_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("property_matches.id", ondelete="RESTRICT"), nullable=True)
    parent_offer_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("property_offers.id", ondelete="RESTRICT"), nullable=True)
    offered_price: Mapped[Decimal] = mapped_column(Numeric(14,2), nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    owner_approved_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    owner_approved_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    hold_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    price_frequency: Mapped[str] = mapped_column(String(20), nullable=False, default="One-time", server_default="One-time")
    status: Mapped[str] = mapped_column(String(24), nullable=False, default="Submitted")
    offer_type: Mapped[str] = mapped_column(String(24), nullable=False, default="Buyer")
    terms: Mapped[str | None] = mapped_column(Text, nullable=True)
    response_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    responded_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    responded_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    property_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("properties.id", ondelete="SET NULL"), nullable=True)
    source_agency_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("agencies.id", ondelete="SET NULL"), nullable=True)
    agency_connection_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("company_agency_connections.id", ondelete="SET NULL"), nullable=True)
    agency_lead_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("agency_leads.id", ondelete="SET NULL"), nullable=True)
    submitted_by_side: Mapped[str] = mapped_column(String(20), nullable=False, default="company", server_default="company")
    version_number: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    customer_name: Mapped[str | None] = mapped_column(String(150), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(DateTime, nullable=False, default=datetime.utcnow, onupdate=datetime.utcnow)
