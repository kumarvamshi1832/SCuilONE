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


class ProjectTimeSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_tracked_minutes: int = 0
    total_tracked_hours: float = 0.0
    approved_billable_minutes: int = 0
    approved_billable_hours: float = 0.0
    non_billable_minutes: int = 0
    non_billable_hours: float = 0.0


class ProjectDeliverySummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    total_tasks: int = 0
    completed_tasks: int = 0
    open_tasks: int = 0
    task_completion_percentage: int = Field(default=0, ge=0, le=100)

    total_sprints: int = 0
    completed_sprints: int = 0
    active_sprints: int = 0
    sprint_completion_percentage: int = Field(default=0, ge=0, le=100)

    total_milestones: int = 0
    completed_milestones: int = 0
    milestone_completion_percentage: int = Field(default=0, ge=0, le=100)


class ProjectTimeSummaryResponse(ProjectTimeSummary):
    project_id: UUID
    project_number: str
    name: str


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

    # Breakdown of tasks, sprints, and contract milestones
    total_tasks: int = 0
    completed_tasks: int = 0
    open_tasks: int = 0
    task_completion_percentage: int = Field(default=0, ge=0, le=100)
    total_sprints: int = 0
    completed_sprints: int = 0
    active_sprints: int = 0
    sprint_completion_percentage: int = Field(default=0, ge=0, le=100)
    total_milestones: int = 0
    completed_milestones: int = 0
    milestone_completion_percentage: int = Field(default=0, ge=0, le=100)
    delivery_summary: ProjectDeliverySummary = Field(
        default_factory=ProjectDeliverySummary
    )

    budget: Decimal
    currency: str

    start_date: date | None
    target_end_date: date | None
    actual_end_date: date | None

    contract_snapshot: dict | None
    notes: str | None

    # Project-level total time tracking summary
    total_tracked_minutes: int = 0
    total_tracked_hours: float = 0.0
    approved_billable_minutes: int = 0
    approved_billable_hours: float = 0.0
    non_billable_minutes: int = 0
    non_billable_hours: float = 0.0
    time_summary: ProjectTimeSummary = Field(default_factory=ProjectTimeSummary)

    created_at: datetime
    updated_at: datetime