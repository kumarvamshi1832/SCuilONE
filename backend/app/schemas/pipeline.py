from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PipelineStageCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    position: int = Field(default=1, ge=1)
    is_closed_won: bool = False
    is_closed_lost: bool = False
    is_active: bool = True

    @model_validator(mode="after")
    def validate_closed_status(self):
        if self.is_closed_won and self.is_closed_lost:
            raise ValueError(
                "A stage cannot be both Closed Won and Closed Lost"
            )
        return self


class PipelineStageUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    position: int | None = Field(default=None, ge=1)
    is_closed_won: bool | None = None
    is_closed_lost: bool | None = None
    is_active: bool | None = None

    @model_validator(mode="after")
    def validate_closed_status(self):
        if self.is_closed_won is True and self.is_closed_lost is True:
            raise ValueError(
                "A stage cannot be both Closed Won and Closed Lost"
            )
        return self


class PipelineStageResponse(BaseModel):
    id: UUID
    pipeline_id: UUID
    name: str
    position: int
    is_closed_won: bool
    is_closed_lost: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PipelineCreate(BaseModel):
    name: str = Field(min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=500)
    is_default: bool = False
    is_active: bool = True
    stages: list[PipelineStageCreate] = Field(default_factory=list)


class PipelineUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=150)
    description: str | None = Field(default=None, max_length=500)
    is_default: bool | None = None
    is_active: bool | None = None


class PipelineResponse(BaseModel):
    id: UUID
    tenant_id: UUID
    name: str
    description: str | None
    is_default: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)