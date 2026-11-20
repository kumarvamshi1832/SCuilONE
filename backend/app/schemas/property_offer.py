from decimal import Decimal
from typing import Literal
from datetime import datetime, timezone
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, model_validator

class PropertyOfferCreate(BaseModel):
    property_match_id: UUID
    offered_price: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    terms: str | None = Field(default=None, max_length=5000)
    expires_at: datetime | None = None

    @model_validator(mode="after")
    def expiry_must_be_future(self):
        if self.expires_at is not None:
            if self.expires_at.tzinfo is not None:
                self.expires_at = self.expires_at.astimezone(timezone.utc).replace(tzinfo=None)
            if self.expires_at <= datetime.now(timezone.utc).replace(tzinfo=None):
                raise ValueError("Offer expiry must be in the future.")
        return self

class PropertyOfferResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    property_match_id: UUID
    parent_offer_id: UUID | None
    offered_price: Decimal
    price_frequency: str
    status: str
    offer_type: str
    terms: str | None
    response_notes: str | None
    created_by: UUID | None
    responded_by: UUID | None
    responded_at: object | None
    created_at: object
    updated_at: object
    expires_at: datetime | None = None
    owner_approved_by: UUID | None = None
    owner_approved_at: datetime | None = None
    hold_expires_at: datetime | None = None

class PropertyOfferDecision(BaseModel):
    decision: Literal["Accepted", "Rejected", "Countered", "Withdrawn"]
    response_notes: str | None = Field(default=None, max_length=5000)
    counter_price: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    counter_terms: str | None = Field(default=None, max_length=5000)
