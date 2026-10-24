
from uuid import UUID
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


PropertyImageType = Literal[
    "Exterior",
    "Interior",
    "Floor Plan",
    "Amenities",
    "Other",
]


class PropertyImageUpdate(BaseModel):
    image_type: PropertyImageType | None = None
    is_primary: bool | None = None
    sort_order: int | None = Field(default=None, ge=0)


class PropertyImageResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    property_id: UUID
    uploaded_by: UUID | None
    image_url: str
    public_id: str
    image_type: str
    is_primary: bool
    sort_order: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PropertyImageReorderItem(BaseModel):
    id: UUID
    sort_order: int = Field(ge=0)


class PropertyImageReorderRequest(BaseModel):
    images: list[PropertyImageReorderItem] = Field(
        min_length=1,
        max_length=50,
    )
