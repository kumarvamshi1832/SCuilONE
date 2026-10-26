
import uuid
from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


BUILDING_TYPES = {
    "Residential Tower",
    "Commercial Building",
    "Villa Block",
    "Office Block",
    "Other",
}

CONSTRUCTION_STATUSES = {
    "Planning",
    "Under Construction",
    "Completed",
    "On Hold",
}

BUILDING_STATUSES = {
    "Active",
    "Inactive",
    "Completed",
    "On Hold",
}


class BuildingBase(BaseModel):
    project_id: uuid.UUID
    name: str = Field(min_length=1, max_length=200)
    building_code: str | None = Field(default=None, max_length=50)
    building_type: str
    description: str | None = None
    total_floors: int = Field(ge=1, le=300)
    total_units: int = Field(default=0, ge=0)
    construction_status: str = "Planning"
    start_date: date | None = None
    expected_completion_date: date | None = None
    status: str = "Active"

    @model_validator(mode="after")
    def validate_building(self):
        if not self.name.strip():
            raise ValueError("Building name cannot be empty")

        if self.building_type not in BUILDING_TYPES:
            raise ValueError(
                f"Invalid building_type. Allowed values: {sorted(BUILDING_TYPES)}"
            )

        if self.construction_status not in CONSTRUCTION_STATUSES:
            raise ValueError(
                "Invalid construction_status. "
                f"Allowed values: {sorted(CONSTRUCTION_STATUSES)}"
            )

        if self.status not in BUILDING_STATUSES:
            raise ValueError(
                f"Invalid status. Allowed values: {sorted(BUILDING_STATUSES)}"
            )

        if (
            self.start_date
            and self.expected_completion_date
            and self.expected_completion_date < self.start_date
        ):
            raise ValueError(
                "Expected completion date cannot be before the start date"
            )

        return self


class BuildingCreate(BuildingBase):
    pass


class BuildingUpdate(BaseModel):
    project_id: uuid.UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=200)
    building_code: str | None = Field(default=None, max_length=50)
    building_type: str | None = None
    description: str | None = None
    total_floors: int | None = Field(default=None, ge=1, le=300)
    total_units: int | None = Field(default=None, ge=0)
    construction_status: str | None = None
    start_date: date | None = None
    expected_completion_date: date | None = None
    status: str | None = None

    @model_validator(mode="after")
    def validate_building(self):
        if self.name is not None and not self.name.strip():
            raise ValueError("Building name cannot be empty")

        if (
            self.building_type is not None
            and self.building_type not in BUILDING_TYPES
        ):
            raise ValueError("Invalid building_type")

        if (
            self.construction_status is not None
            and self.construction_status not in CONSTRUCTION_STATUSES
        ):
            raise ValueError("Invalid construction_status")

        if self.status is not None and self.status not in BUILDING_STATUSES:
            raise ValueError("Invalid status")

        if (
            self.start_date
            and self.expected_completion_date
            and self.expected_completion_date < self.start_date
        ):
            raise ValueError(
                "Expected completion date cannot be before the start date"
            )

        return self


class BuildingResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    tenant_id: uuid.UUID
    project_id: uuid.UUID
    created_by: uuid.UUID | None
    name: str
    building_code: str | None
    building_type: str
    description: str | None
    total_floors: int
    total_units: int
    construction_status: str
    start_date: date | None
    expected_completion_date: date | None
    status: str
    created_at: datetime
    updated_at: datetime
