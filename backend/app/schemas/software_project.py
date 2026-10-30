
from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


SoftwareProjectStatus = Literal[
    "Planned",
    "Active",
    "On Hold",
    "Completed",
    "Cancelled",
]

SoftwareProjectPriority = Literal[
    "Low",
    "Medium",
    "High",
    "Critical",
]


class SoftwareProjectCreate(BaseModel):
    software_contract_id: UUID

    project_number: str | None = Field(
        default=None,
        min_length=1,
        max_length=50,
    )

    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=200,
    )

    description: str | None = None
    project_manager_id: UUID | None = None

    priority: SoftwareProjectPriority = "Medium"

    start_date: date | None = None
    target_end_date: date | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def validate_project(self):
        if self.name is not None and not self.name.strip():
            raise ValueError("Project name cannot be blank.")

        if (
            self.start_date is not None
            and self.target_end_date is not None
            and self.target_end_date < self.start_date
        ):
            raise ValueError(
                "Target end date cannot be before start date."
            )

        return self


class SoftwareProjectUpdate(BaseModel):
    name: str | None = Field(
        default=None,
        min_length=1,
        max_length=200,
    )

    description: str | None = None
    project_manager_id: UUID | None = None
    priority: SoftwareProjectPriority | None = None
    status: SoftwareProjectStatus | None = None

    start_date: date | None = None
    target_end_date: date | None = None
    actual_end_date: date | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def validate_project(self):
        if self.name is not None and not self.name.strip():
            raise ValueError("Project name cannot be blank.")

        values = self.model_dump(exclude_unset=True)

        if (
            values.get("start_date") is not None
            and values.get("target_end_date") is not None
            and values["target_end_date"] < values["start_date"]
        ):
            raise ValueError(
                "Target end date cannot be before start date."
            )

        if (
            values.get("actual_end_date") is not None
            and values.get("start_date") is not None
            and values["actual_end_date"] < values["start_date"]
        ):
            raise ValueError(
                "Actual end date cannot be before start date."
            )

        return self


class SoftwareProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    created_by: UUID | None
    software_contract_id: UUID
    deal_id: UUID | None
    project_manager_id: UUID | None

    project_number: str
    name: str
    description: str | None
    scope_of_work: str
    deliverables: str

    status: SoftwareProjectStatus
    priority: SoftwareProjectPriority
    progress_percentage: int = Field(
    default=0,
    ge=0,
    le=100,
)

    budget: Decimal
    currency: str

    start_date: date | None
    target_end_date: date | None
    actual_end_date: date | None

    contract_snapshot: dict | None
    notes: str | None

    created_at: datetime
    updated_at: datetime
