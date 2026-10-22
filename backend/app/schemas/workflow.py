
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


WorkflowModule = Literal["leads", "contacts", "accounts", "deals"]
TriggerEvent = Literal[
    "record_created",
    "record_updated",
    "field_changed",
]
ConditionLogic = Literal["AND", "OR"]

ConditionOperator = Literal[
    "is",
    "is_not",
    "contains",
    "does_not_contain",
    "greater_than",
    "greater_than_or_equal",
    "less_than",
    "less_than_or_equal",
    "is_empty",
    "is_not_empty",
]


class WorkflowCondition(BaseModel):
    field: str = Field(min_length=1, max_length=100)
    operator: ConditionOperator
    value: Any = None



class WorkflowAction(BaseModel):
    action_type: Literal[
        "assign_owner",
        "update_field",
        "create_task",
        "send_notification",
    ]

    user_id: UUID | None = None
    recipient: Literal[
        "assigned_user",
        "record_creator",
        "workflow_creator",
    ] | None = None

    field: str | None = Field(default=None, min_length=1, max_length=100)
    value: Any = None

    title: str | None = Field(default=None, max_length=200)
    description: str | None = Field(default=None, max_length=2000)
    priority: Literal["Low", "Medium", "High"] = "Medium"
    due_in_days: int | None = Field(default=None, ge=0, le=365)

    message: str | None = Field(default=None, max_length=2000)

    @model_validator(mode="after")
    def validate_action(self):
        if self.action_type == "assign_owner" and self.user_id is None:
            raise ValueError("assign_owner requires user_id")

        if self.action_type == "update_field":
            if not self.field:
                raise ValueError("update_field requires field")
            if self.value is None:
                raise ValueError("update_field requires a non-null value")

        if self.action_type == "create_task" and not self.title:
            raise ValueError("create_task requires title")

        if self.action_type == "send_notification":
            if not self.message:
                raise ValueError("send_notification requires message")

            if self.user_id is not None and self.recipient is not None:
                raise ValueError(
                    "Specify either user_id or recipient, not both"
                )

        return self


class WorkflowCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    module_name: WorkflowModule
    trigger_event: TriggerEvent
    condition_logic: ConditionLogic = "AND"
    conditions: list[WorkflowCondition] = Field(default_factory=list)
    actions: list[WorkflowAction] = Field(min_length=1, max_length=20)
    is_active: bool = False

    @model_validator(mode="after")
    def validate_conditions(self):
        if self.trigger_event == "field_changed" and not self.conditions:
            raise ValueError(
                "field_changed requires at least one condition"
            )
        return self


class WorkflowUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=2000)
    module_name: WorkflowModule | None = None
    trigger_event: TriggerEvent | None = None
    condition_logic: ConditionLogic | None = None
    conditions: list[WorkflowCondition] | None = None
    actions: list[WorkflowAction] | None = Field(
        default=None,
        min_length=1,
        max_length=20,
    )

    @model_validator(mode="after")
    def validate_conditions(self):
        event = self.trigger_event
        conditions = self.conditions

        if event == "field_changed" and conditions == []:
            raise ValueError(
                "field_changed requires at least one condition"
            )

        return self


class WorkflowResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    created_by: UUID | None
    name: str
    description: str | None
    module_name: str
    trigger_event: str
    condition_logic: str
    conditions: list[dict[str, Any]]
    actions: list[dict[str, Any]]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class WorkflowExecutionResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    workflow_id: UUID | None
    workflow_name: str
    module_name: str
    record_id: UUID
    trigger_event: str
    status: str
    conditions_matched: bool | None
    action_results: list[dict[str, Any]]
    error_message: str | None
    idempotency_key: str | None
    started_at: datetime
    completed_at: datetime | None

    model_config = ConfigDict(from_attributes=True)
