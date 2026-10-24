
from uuid import UUID
from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator


PropertyType = Literal[
    "Apartment",
    "Independent House",
    "Villa",
    "Plot",
    "Commercial",
    "Office",
    "Shop",
    "Warehouse",
    "Other",
]

ListingType = Literal["Sale", "Rent"]

PropertyStatus = Literal[
    "Available",
    "Reserved",
    "Sold",
    "Rented",
    "Inactive",
]

FurnishingType = Literal[
    "Unfurnished",
    "Semi-Furnished",
    "Furnished",
]


class PropertyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    property_type: PropertyType
    listing_type: ListingType
    description: str | None = None

    address: str = Field(min_length=1)
    city: str = Field(min_length=1, max_length=100)
    state: str = Field(min_length=1, max_length=100)
    country: str = Field(default="India", max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)

    price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)
    currency: str = Field(default="INR", min_length=3, max_length=3)

    area: Decimal | None = Field(
        default=None,
        gt=0,
        max_digits=12,
        decimal_places=2,
    )
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


class PropertyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    property_type: PropertyType | None = None
    listing_type: ListingType | None = None
    description: str | None = None

    address: str | None = Field(default=None, min_length=1)
    city: str | None = Field(default=None, min_length=1, max_length=100)
    state: str | None = Field(default=None, min_length=1, max_length=100)
    country: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)

    price: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=14,
        decimal_places=2,
    )
    currency: str | None = Field(default=None, min_length=3, max_length=3)

    area: Decimal | None = Field(
        default=None,
        gt=0,
        max_digits=12,
        decimal_places=2,
    )
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


class PropertyResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    created_by: UUID | None
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
