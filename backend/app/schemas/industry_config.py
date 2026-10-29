from typing import Any

from pydantic import BaseModel, ConfigDict, Field


class IndustryConfigUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    enabled_modules: list[str] | None = Field(default=None, max_length=100)
    settings: dict[str, Any] | None = None
    dashboard_widgets: list[str] | None = Field(default=None, max_length=100)
    report_widgets: list[str] | None = Field(default=None, max_length=100)
    custom_labels: dict[str, str] | None = None
