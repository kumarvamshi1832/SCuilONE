
from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    model_validator,
)


SprintStatus = Literal[
    "Planned",
    "Active",
    "Completed",
    "Cancelled",
]


class SoftwareSprintCreate(BaseModel):
    software_project_id: UUID
    name: str = Field(min_length=1, max_length=150)
    goal: str | None = None
    start_date: date
    end_date: date
    status: SprintStatus = "Planned"

    @model_validator(mode="after")
    def validate_sprint(self):
        self.name = self.name.strip()

        if not self.name:
            raise ValueError("Sprint name cannot be blank")

        if self.end_date < self.start_date:
            raise ValueError(
                "End date cannot be before start date"
            )

        return self



class SoftwareSprintUpdate(BaseModel):
    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=150,
    )
    goal: str | None = None
    start_date: date | None = None
    end_date: date | None = None
    status: SprintStatus | None = None

    @model_validator(mode="after")
    def validate_sprint(self):
        if self.name is not None:
            self.name = self.name.strip()

            if not self.name:
                raise ValueError("Sprint name cannot be blank")

        if "start_date" in self.model_fields_set and self.start_date is None:
            raise ValueError("Start date cannot be null")

        if "end_date" in self.model_fields_set and self.end_date is None:
            raise ValueError("End date cannot be null")

        if (
            self.start_date is not None
            and self.end_date is not None
            and self.end_date < self.start_date
        ):
            raise ValueError("End date cannot be before start date")

        return self


class SoftwareSprintResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    software_project_id: UUID
    created_by: UUID | None
    name: str
    goal: str | None
    status: SprintStatus
    start_date: date
    end_date: date
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
