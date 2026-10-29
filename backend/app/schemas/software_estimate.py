
from datetime import date, datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    StringConstraints,
    model_validator,
)
from typing import Annotated


EstimateStatus = Literal[
    "Draft",
    "Sent",
    "Accepted",
    "Rejected",
    "Expired",
    "Withdrawn",
]


CurrencyCode = Annotated[
    str,
    StringConstraints(pattern=r"^[A-Z]{3}$"),
]


class SoftwareEstimateItemCreate(BaseModel):
    item_name: str = Field(min_length=1, max_length=200)
    description: str | None = None

    quantity: Decimal = Field(gt=0, max_digits=12, decimal_places=2)
    unit_price: Decimal = Field(ge=0, max_digits=14, decimal_places=2)

    discount_percent: Decimal = Field(
        default=Decimal("0"),
        ge=0,
        le=100,
        max_digits=5,
        decimal_places=2,
    )

    tax_percent: Decimal = Field(
        default=Decimal("0"),
        ge=0,
        le=100,
        max_digits=5,
        decimal_places=2,
    )

    sort_order: int = Field(default=0, ge=0)


class SoftwareEstimateItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    estimate_id: UUID
    item_name: str
    description: str | None
    quantity: Decimal
    unit_price: Decimal
    discount_percent: Decimal
    tax_percent: Decimal
    line_subtotal: Decimal
    line_discount: Decimal
    line_tax: Decimal
    line_total: Decimal
    sort_order: int
    created_at: datetime
    updated_at: datetime


class SoftwareEstimateCreate(BaseModel):
    software_requirement_id: UUID

    title: str = Field(min_length=1, max_length=200)
    description: str | None = None

    assigned_to: UUID | None = None

    estimate_number: str | None = Field(
        default=None,
        min_length=1,
        max_length=50,
    )

    currency: CurrencyCode = "INR"
    issue_date: date = Field(default_factory=date.today)
    expiry_date: date | None = None

    status: EstimateStatus = "Draft"

    discount_amount: Decimal = Field(
        default=Decimal("0"),
        ge=0,
        max_digits=14,
        decimal_places=2,
    )

    terms_and_conditions: str | None = None
    notes: str | None = None

    items: list[SoftwareEstimateItemCreate] = Field(min_length=1)

    @model_validator(mode="after")
    def validate_dates(self):
        if self.expiry_date and self.expiry_date < self.issue_date:
            raise ValueError("Expiry date cannot be before issue date")
        return self


class SoftwareEstimateUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    assigned_to: UUID | None = None

    currency: CurrencyCode | None = None
    issue_date: date | None = None
    expiry_date: date | None = None

    status: EstimateStatus | None = None

    discount_amount: Decimal | None = Field(
        default=None,
        ge=0,
        max_digits=14,
        decimal_places=2,
    )

    terms_and_conditions: str | None = None
    notes: str | None = None

    items: list[SoftwareEstimateItemCreate] | None = Field(
        default=None,
        min_length=1,
    )


class SoftwareEstimateResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    created_by: UUID | None
    software_requirement_id: UUID
    deal_id: UUID | None = None
    lead_id: UUID | None
    account_id: UUID | None
    contact_id: UUID | None
    assigned_to: UUID | None

    estimate_number: str
    title: str
    description: str | None

    currency: str
    issue_date: date
    expiry_date: date | None

    subtotal: Decimal
    discount_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal

    status: str
    terms_and_conditions: str | None
    notes: str | None

    created_at: datetime
    updated_at: datetime

    items: list[SoftwareEstimateItemResponse] = Field(default_factory=list)
