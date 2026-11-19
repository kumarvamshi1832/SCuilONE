from decimal import Decimal
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field

class PropertyOfferCreate(BaseModel):
    property_match_id: UUID
    offered_price: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    terms: str | None = Field(default=None, max_length=5000)

class PropertyOfferResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    tenant_id: UUID
    property_match_id: UUID
    parent_offer_id: UUID | None
    offered_price: Decimal
    status: str
    offer_type: str
    terms: str | None
    response_notes: str | None
    created_by: UUID | None
    responded_by: UUID | None
    responded_at: object | None
    created_at: object
    updated_at: object

class PropertyOfferDecision(BaseModel):
    decision: Literal["Accepted", "Rejected", "Countered", "Withdrawn"]
    response_notes: str | None = Field(default=None, max_length=5000)
    counter_price: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    counter_terms: str | None = Field(default=None, max_length=5000)
