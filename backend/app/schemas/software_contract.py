
from datetime import date, datetime
from decimal import Decimal
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)


ContractStatus = Literal[
    "Draft",
    "Sent",
    "Under Review",
    "Signed",
    "Active",
    "Completed",
    "Terminated",
    "Expired",
]

CurrencyCode = Annotated[
    str,
    StringConstraints(pattern=r"^[A-Z]{3}$"),
]


class SoftwareContractCreate(BaseModel):
    software_estimate_id: UUID

    contract_number: str | None = Field(
        default=None,
        min_length=1,
        max_length=50,
    )
    title: str | None = Field(
        default=None,
        min_length=1,
        max_length=200,
    )
    description: str | None = None
    assigned_to: UUID | None = None

    issue_date: date | None = None
    start_date: date | None = None
    end_date: date | None = None

    scope_of_work: str = Field(min_length=1)
    deliverables: str = Field(min_length=1)
    exclusions: str | None = None
    assumptions: str | None = None
    acceptance_criteria: str | None = None
    payment_terms: str | None = None
    terms_and_conditions: str | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def validate_dates(self):
        if (
            self.start_date is not None
            and self.end_date is not None
            and self.end_date < self.start_date
        ):
            raise ValueError("End date cannot be before start date")

        return self


class SoftwareContractUpdate(BaseModel):
    contract_number: str | None = Field(
        default=None,
        min_length=1,
        max_length=50,
    )
    title: str | None = Field(
        default=None,
        min_length=1,
        max_length=200,
    )
    description: str | None = None
    assigned_to: UUID | None = None

    issue_date: date | None = None
    start_date: date | None = None
    end_date: date | None = None
    signed_date: date | None = None

    status: ContractStatus | None = None

    scope_of_work: str | None = Field(default=None, min_length=1)
    deliverables: str | None = Field(default=None, min_length=1)
    exclusions: str | None = None
    assumptions: str | None = None
    acceptance_criteria: str | None = None
    payment_terms: str | None = None
    terms_and_conditions: str | None = None
    notes: str | None = None

    @model_validator(mode="after")
    def validate_supplied_dates(self):
        if (
            self.start_date is not None
            and self.end_date is not None
            and self.end_date < self.start_date
        ):
            raise ValueError("End date cannot be before start date")

        return self


class SoftwareContractResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    created_by: UUID | None
    software_estimate_id: UUID
    deal_id: UUID | None
    lead_id: UUID | None
    account_id: UUID | None
    contact_id: UUID | None
    assigned_to: UUID | None

    contract_number: str
    title: str
    description: str | None

    currency: str
    contract_value: Decimal

    issue_date: date
    start_date: date | None
    end_date: date | None
    signed_date: date | None

    status: str

    scope_of_work: str
    deliverables: str
    exclusions: str | None
    assumptions: str | None
    acceptance_criteria: str | None
    payment_terms: str | None
    terms_and_conditions: str | None

    estimate_snapshot: dict[str, Any] | None
    notes: str | None

    created_at: datetime
    updated_at: datetime
