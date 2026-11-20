
from uuid import UUID
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

PropertyType = Literal[
    "Apartment",
    "Independent House",
    "flat",
    "Villa",
    "Plot",
    "Commercial",
    "Office",
    "Shop",
    "Warehouse",
    "Other",
]
ListingType = Literal["Sale", "Rent", "Lease"]
PropertyStatus = Literal["Available", "Reserved", "Sold", "Rented", "Inactive"]
FurnishingType = Literal["Unfurnished", "Semi-Furnished", "Furnished"]


class PropertyCreate(BaseModel):
    building_id: UUID | None = None
    unit_number: str | None = Field(default=None, max_length=50)

    name: str = Field(min_length=1, max_length=200)
    property_type: PropertyType
    listing_type: ListingType
    description: str | None = None
    address: str = Field(min_length=1)
    city: str = Field(min_length=1, max_length=100)
    state: str = Field(min_length=1, max_length=100)
    country: str = Field(default="India", max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    price: Decimal = Field(gt=0, max_digits=14, decimal_places=2)
    minimum_acceptable_price: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    require_owner_approval: bool = False
    hold_on_offer_acceptance: bool = False
    offer_hold_hours: int = Field(default=48, ge=1, le=720)
    price_frequency: Literal["One-time", "Monthly", "Quarterly", "Yearly"] | None = None
    security_deposit: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    minimum_term_months: int | None = Field(default=None, ge=1, le=600)
    maximum_term_months: int | None = Field(default=None, ge=1, le=600)
    currency: str = Field(default="INR", min_length=3, max_length=3)
    area: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    area_unit: Literal["sqft", "sqm", "sqyd", "acre"] = "sqft"
    bedrooms: int | None = Field(default=None, ge=0, le=100)
    bathrooms: int | None = Field(default=None, ge=0, le=100)
    furnishing: FurnishingType = "Unfurnished"
    status: PropertyStatus = "Available"
    owner_name: str | None = Field(default=None, max_length=200)
    developer_name: str | None = Field(default=None, max_length=200)
    assigned_to: UUID | None = None

    @field_validator("name", "address", "city", "state")
    @classmethod
    def validate_required_text(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be empty.")
        return value

    @field_validator("unit_number")
    @classmethod
    def validate_unit_number(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("Unit number cannot be empty.")
        return value

    @model_validator(mode="after")
    def validate_building_unit(self):
        if self.building_id is not None and self.unit_number is None:
            raise ValueError("Unit number is required when a building is selected.")
        expected = "One-time" if self.listing_type == "Sale" else "Monthly"
        if self.price_frequency is None:
            self.price_frequency = expected
        if self.listing_type == "Sale" and self.price_frequency != "One-time":
            raise ValueError("Sale listings must use One-time pricing.")
        if self.listing_type in ("Rent", "Lease") and self.price_frequency == "One-time":
            raise ValueError("Rent and Lease listings must use a recurring price frequency.")
        if self.minimum_term_months and self.maximum_term_months and self.minimum_term_months > self.maximum_term_months:
            raise ValueError("Minimum term cannot exceed maximum term.")
        return self


class PropertyUpdate(BaseModel):
    building_id: UUID | None = None
    unit_number: str | None = Field(default=None, max_length=50)

    name: str | None = Field(default=None, min_length=1, max_length=200)
    property_type: PropertyType | None = None
    listing_type: ListingType | None = None
    description: str | None = None
    address: str | None = Field(default=None, min_length=1)
    city: str | None = Field(default=None, min_length=1, max_length=100)
    state: str | None = Field(default=None, min_length=1, max_length=100)
    country: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    price: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    minimum_acceptable_price: Decimal | None = Field(default=None, gt=0, max_digits=14, decimal_places=2)
    require_owner_approval: bool | None = None
    hold_on_offer_acceptance: bool | None = None
    offer_hold_hours: int | None = Field(default=None, ge=1, le=720)
    price_frequency: Literal["One-time", "Monthly", "Quarterly", "Yearly"] | None = None
    security_deposit: Decimal | None = Field(default=None, ge=0, max_digits=14, decimal_places=2)
    minimum_term_months: int | None = Field(default=None, ge=1, le=600)
    maximum_term_months: int | None = Field(default=None, ge=1, le=600)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    area: Decimal | None = Field(default=None, gt=0, max_digits=12, decimal_places=2)
    area_unit: Literal["sqft", "sqm", "sqyd", "acre"] | None = None
    bedrooms: int | None = Field(default=None, ge=0, le=100)
    bathrooms: int | None = Field(default=None, ge=0, le=100)
    furnishing: FurnishingType | None = None
    status: PropertyStatus | None = None
    owner_name: str | None = Field(default=None, max_length=200)
    developer_name: str | None = Field(default=None, max_length=200)
    assigned_to: UUID | None = None

    @field_validator("name", "address", "city", "state")
    @classmethod
    def validate_optional_text(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("This field cannot be empty.")
        return value

    @field_validator("unit_number")
    @classmethod
    def validate_optional_unit_number(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("Unit number cannot be empty.")
        return value


class PropertyResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    created_by: UUID | None
    building_id: UUID | None
    unit_number: str | None
    name: str
    property_type: str
    listing_type: str
    description: str | None
    address: str
    city: str
    state: str
    country: str
    postal_code: str | None
    price: Decimal
    minimum_acceptable_price: Decimal | None = None
    require_owner_approval: bool = False
    hold_on_offer_acceptance: bool = False
    offer_hold_hours: int = 48
    offer_hold_expires_at: datetime | None = None
    price_frequency: str
    security_deposit: Decimal | None
    minimum_term_months: int | None
    maximum_term_months: int | None
    currency: str
    area: Decimal | None
    area_unit: str
    bedrooms: int | None
    bathrooms: int | None
    furnishing: str
    status: str
    owner_name: str | None
    developer_name: str | None
    assigned_to: UUID | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
