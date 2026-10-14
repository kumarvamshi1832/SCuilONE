
from datetime import datetime
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, Field, ConfigDict, model_validator


ModuleName = Literal["leads", "contacts", "accounts", "deals"]
FieldType = Literal[
    "text",
    "textarea",
    "number",
    "email",
    "phone",
    "date",
    "dropdown",
    "checkbox",
]


class FormFieldCreate(BaseModel):
    field_label: str = Field(min_length=1, max_length=150)
    field_key: str = Field(
        min_length=1,
        max_length=100,
        pattern=r"^[a-z][a-z0-9_]*$",
    )
    field_type: FieldType
    is_required: bool = False
    options: list[str] | None = None
    validation_rules: dict[str, Any] | None = None
    display_order: int = 0

    @model_validator(mode="after")
    def validate_options(self):
        if self.field_type == "dropdown" and not self.options:
            raise ValueError("Dropdown fields must have at least one option")

        if self.field_type != "dropdown" and self.options:
            raise ValueError("Options are only supported for dropdown fields")

        return self


class FormTemplateCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    module_name: ModuleName
    description: str | None = None
    fields: list[FormFieldCreate] = Field(default_factory=list)


class FormFieldResponse(FormFieldCreate):
    id: UUID
    template_id: UUID
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class FormTemplateResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    module_name: str
    description: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime
    fields: list[FormFieldResponse] = []

    model_config = ConfigDict(from_attributes=True)


class FormTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = None
    is_active: bool | None = None


class CustomFormSubmissionCreate(BaseModel):
    template_id: UUID
    module_name: ModuleName
    record_id: UUID
    values: dict[str, Any]