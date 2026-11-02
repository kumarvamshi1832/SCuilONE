import uuid

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.database.connection import Base


class DocumentSequence(Base):
    """Gap-free running numbers per tenant, e.g. INV-2026 -> 1, 2, 3."""

    __tablename__ = "document_sequences"

    tenant_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("tenants.id"),
        primary_key=True,
    )

    sequence_key: Mapped[str] = mapped_column(
        String(60),
        primary_key=True,
    )

    last_value: Mapped[int] = mapped_column(
        Integer,
        nullable=False,
        default=0,
    )
