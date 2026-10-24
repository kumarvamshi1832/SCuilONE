
from datetime import date, datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


PROJECT_TYPES = {
    "Residential",
    "Commercial",
    "Mixed Use",
    "Industrial",
    "Land Development",
}

CONSTRUCTION_STATUSES = {
    "Planning",
    "Under Construction",
    "Completed",
    "On Hold",
}

PROJECT_STATUSES = {
    "Active",
    "Inactive",
    "Completed",
    "On Hold",
}


class ProjectBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    developer_name: str | None = Field(default=None, max_length=200)
    project_type: str = Field(max_length=50)
    description: str | None = None
    address: str = Field(min_length=1)
    city: str = Field(min_length=1, max_length=100)
    state: str = Field(min_length=1, max_length=100)
    country: str = Field(default="India", max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    amenities: str | None = None
    total_buildings: int | None = Field(default=None, ge=0)
    total_units: int | None = Field(default=None, ge=0)
    construction_status: str = "Planning"
    start_date: date | None = None
    expected_completion_date: date | None = None
    status: str = "Active"

    @model_validator(mode="after")
    def validate_project_fields(self):
        if self.project_type not in PROJECT_TYPES:
            raise ValueError("Invalid project type.")

        if self.construction_status not in CONSTRUCTION_STATUSES:
            raise ValueError("Invalid construction status.")

        if self.status not in PROJECT_STATUSES:
            raise ValueError("Invalid project status.")

        if (
            self.start_date
            and self.expected_completion_date
            and self.expected_completion_date < self.start_date
        ):
            raise ValueError(
                "Expected completion date cannot be before start date."
            )

        if not self.name.strip():
            raise ValueError("Project name cannot be blank.")

        if not self.address.strip():
            raise ValueError("Address cannot be blank.")

        if not self.city.strip() or not self.state.strip():
            raise ValueError("City and state cannot be blank.")

        return self


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    developer_name: str | None = Field(default=None, max_length=200)
    project_type: str | None = Field(default=None, max_length=50)
    description: str | None = None
    address: str | None = Field(default=None, min_length=1)
    city: str | None = Field(default=None, max_length=100)
    state: str | None = Field(default=None, max_length=100)
    country: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=20)
    amenities: str | None = None
    total_buildings: int | None = Field(default=None, ge=0)
    total_units: int | None = Field(default=None, ge=0)
    construction_status: str | None = None
    start_date: date | None = None
    expected_completion_date: date | None = None
    status: str | None = None

    @model_validator(mode="after")
    def validate_project_fields(self):
        if self.project_type is not None and self.project_type not in PROJECT_TYPES:
            raise ValueError("Invalid project type.")

        if (
            self.construction_status is not None
            and self.construction_status not in CONSTRUCTION_STATUSES
        ):
            raise ValueError("Invalid construction status.")

        if self.status is not None and self.status not in PROJECT_STATUSES:
            raise ValueError("Invalid project status.")

        if self.name is not None and not self.name.strip():
            raise ValueError("Project name cannot be blank.")

        if self.address is not None and not self.address.strip():
            raise ValueError("Address cannot be blank.")

        if self.city is not None and not self.city.strip():
            raise ValueError("City cannot be blank.")

        if self.state is not None and not self.state.strip():
            raise ValueError("State cannot be blank.")

        values = self.model_dump(exclude_unset=True)

        if (
            values.get("start_date") is not None
            and values.get("expected_completion_date") is not None
            and values["expected_completion_date"] < values["start_date"]
        ):
            raise ValueError(
                "Expected completion date cannot be before start date."
            )

        return self


class ProjectResponse(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    created_by: UUID | None
    created_at: datetime
    updated_at: datetime
