
from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


IMAGE_TYPES = {"Exterior", "Interior", "Floor Plan", "Amenities", "Other"}


class BuildingImageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    building_id: UUID
    image_url: str
    image_type: str
    is_primary: bool
    sort_order: int
    uploaded_by: UUID | None = None
    created_at: datetime


class BuildingImageUpdate(BaseModel):
    image_type: str | None = None
    is_primary: bool | None = None
    sort_order: int | None = Field(default=None, ge=0)


class BuildingImageReorder(BaseModel):
    image_ids: list[UUID]
