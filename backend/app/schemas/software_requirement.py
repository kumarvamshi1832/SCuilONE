
from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


SoftwareType = Literal[
    "Web Application",
    "Mobile Application",
    "Website",
    "API Development",
    "Custom Software",
    "Enterprise Software",
    "Integration",
    "Maintenance",
    "Other",
]

RequirementStatus = Literal[
    "New",
    "Discovery",
    "Estimating",
    "Proposal",
    "Approved",
    "Rejected",
    "On Hold",
    "Converted",
    "Closed",
]


class SoftwareRequirementCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str = Field(min_length=1)
    software_type: SoftwareType

    deal_id: UUID | None = None
    lead_id: UUID | None = None
    account_id: UUID | None = None
    contact_id: UUID | None = None
    assigned_to: UUID | None = None

    platforms: str | None = None
    integrations: str | None = None

    min_budget: Decimal | None = Field(default=None, ge=0)
    max_budget: Decimal | None = Field(default=None, ge=0)
    currency: str = Field(default="INR", pattern=r"^[A-Z]{3}$")

    target_date: date | None = None
    priority: Literal["Low", "Medium", "High", "Critical"] = "Medium"
    status: RequirementStatus = "New"
    notes: str | None = None

    @model_validator(mode="after")
    def validate_requirement(self):
        if (
            self.lead_id is None
            and self.account_id is None
            and self.contact_id is None
            and self.deal_id is None
        ):
            raise ValueError(
                "Link the requirement to a Deal, Lead, Account, or Contact."
            )

        if (
            self.min_budget is not None
            and self.max_budget is not None
            and self.min_budget > self.max_budget
        ):
            raise ValueError(
                "Minimum budget cannot exceed maximum budget."
            )

        return self


class SoftwareRequirementUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = Field(default=None, min_length=1)
    software_type: SoftwareType | None = None

    deal_id: UUID | None = None
    lead_id: UUID | None = None
    account_id: UUID | None = None
    contact_id: UUID | None = None
    assigned_to: UUID | None = None

    platforms: str | None = None
    integrations: str | None = None

    min_budget: Decimal | None = Field(default=None, ge=0)
    max_budget: Decimal | None = Field(default=None, ge=0)
    currency: str | None = Field(default=None, pattern=r"^[A-Z]{3}$")

    target_date: date | None = None
    priority: Literal["Low", "Medium", "High", "Critical"] | None = None
    status: RequirementStatus | None = None
    notes: str | None = None


class SoftwareRequirementResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    created_by: UUID | None
    deal_id: UUID | None
    lead_id: UUID | None
    account_id: UUID | None
    contact_id: UUID | None
    assigned_to: UUID | None

    title: str
    description: str
    software_type: str
    platforms: str | None
    integrations: str | None

    min_budget: Decimal | None
    max_budget: Decimal | None
    currency: str
    target_date: date | None

    priority: str
    status: str
    notes: str | None

    created_at: datetime
    updated_at: datetime
