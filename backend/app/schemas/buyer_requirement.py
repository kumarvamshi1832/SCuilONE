
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class BuyerRequirementBase(BaseModel):
    requirement_type: Literal["Buy", "Rent"] = "Buy"
    property_type: str = Field(min_length=1, max_length=50)
    preferred_city: str | None = Field(default=None, max_length=100)
    preferred_location: str | None = Field(default=None, max_length=200)
    min_budget: Decimal | None = Field(default=None, ge=0)
    max_budget: Decimal | None = Field(default=None, ge=0)
    bedrooms: int | None = Field(default=None, ge=0, le=100)
    min_area: Decimal | None = Field(default=None, ge=0)
    max_area: Decimal | None = Field(default=None, ge=0)
    area_unit: str = Field(default="sqft", min_length=1, max_length=20)
    status: Literal["New", "Qualified", "Matched", "Closed"] = "New"
    notes: str | None = None

    @model_validator(mode="after")
    def validate_ranges(self):
        if (
            self.min_budget is not None
            and self.max_budget is not None
            and self.min_budget > self.max_budget
        ):
            raise ValueError("Minimum budget cannot exceed maximum budget.")

        if (
            self.min_area is not None
            and self.max_area is not None
            and self.min_area > self.max_area
        ):
            raise ValueError("Minimum area cannot exceed maximum area.")

        return self


class BuyerRequirementCreate(BuyerRequirementBase):
    lead_id: UUID | None = None
    contact_id: UUID | None = None
    assigned_to: UUID | None = None

    @model_validator(mode="after")
    def validate_customer_link(self):
        if self.lead_id is None and self.contact_id is None:
            raise ValueError("Link the requirement to an existing Lead or Contact.")
        return self


class BuyerRequirementUpdate(BaseModel):
    requirement_type: Literal["Buy", "Rent"] | None = None
    property_type: str | None = Field(default=None, min_length=1, max_length=50)
    preferred_city: str | None = Field(default=None, max_length=100)
    preferred_location: str | None = Field(default=None, max_length=200)
    min_budget: Decimal | None = Field(default=None, ge=0)
    max_budget: Decimal | None = Field(default=None, ge=0)
    bedrooms: int | None = Field(default=None, ge=0, le=100)
    min_area: Decimal | None = Field(default=None, ge=0)
    max_area: Decimal | None = Field(default=None, ge=0)
    area_unit: str | None = Field(default=None, min_length=1, max_length=20)
    status: Literal["New", "Qualified", "Matched", "Closed"] | None = None
    notes: str | None = None
    lead_id: UUID | None = None
    contact_id: UUID | None = None
    assigned_to: UUID | None = None

    @model_validator(mode="after")
    def validate_ranges(self):
        if (
            self.min_budget is not None
            and self.max_budget is not None
            and self.min_budget > self.max_budget
        ):
            raise ValueError("Minimum budget cannot exceed maximum budget.")

        if (
            self.min_area is not None
            and self.max_area is not None
            and self.min_area > self.max_area
        ):
            raise ValueError("Minimum area cannot exceed maximum area.")

        return self


class BuyerRequirementResponse(BuyerRequirementBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    created_by: UUID | None
    lead_id: UUID | None
    contact_id: UUID | None
    assigned_to: UUID | None
    created_at: object
    updated_at: object
