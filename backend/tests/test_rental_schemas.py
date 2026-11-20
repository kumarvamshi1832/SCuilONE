from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.property import PropertyCreate
from app.schemas.buyer_requirement import BuyerRequirementCreate
from app.schemas.rental import RentalAgreementCreate, RentalExitDecision


def test_rent_and_lease_property_pricing_defaults_to_monthly():
    for listing_type in ("Rent", "Lease"):
        prop = PropertyCreate(
            name="Unit A", property_type="Apartment", listing_type=listing_type,
            address="Miyapur", city="Hyderabad", state="Telangana",
            price=Decimal("25000"),
        )
        assert prop.price_frequency == "Monthly"


def test_sale_property_pricing_is_one_time():
    prop = PropertyCreate(
        name="Plot A", property_type="Plot", listing_type="Sale",
        address="Miyapur", city="Hyderabad", state="Telangana",
        price=Decimal("8500000"),
    )
    assert prop.price_frequency == "One-time"
    with pytest.raises(ValidationError):
        PropertyCreate(
            name="Plot A", property_type="Plot", listing_type="Sale",
            address="Miyapur", city="Hyderabad", state="Telangana",
            price=Decimal("8500000"), price_frequency="Monthly",
        )


def test_buyer_requirement_lease_defaults_to_monthly_budget_frequency():
    requirement = BuyerRequirementCreate(
        requirement_type="Lease", property_type="Commercial", contact_id=uuid4()
    )
    assert requirement.budget_frequency == "Monthly"


def test_rental_agreement_requires_customer_reference():
    with pytest.raises(ValidationError):
        RentalAgreementCreate(
            property_id=uuid4(), agreement_type="Rent", customer_name="Ravi",
            rent_amount=Decimal("25000"), agreement_start=date(2026, 12, 1),
        )


def test_rental_agreement_rejects_lockin_longer_than_fixed_term():
    with pytest.raises(ValidationError):
        RentalAgreementCreate(
            property_id=uuid4(), contact_id=uuid4(), agreement_type="Rent",
            customer_name="Ravi", rent_amount=Decimal("25000"),
            agreement_start=date(2026, 12, 1), agreement_end=date(2027, 10, 31),
            lock_in_months=12,
        )


def test_exit_decision_exposes_explicit_lockin_and_notice_waivers():
    decision = RentalExitDecision(
        decision="Approved", early_exit_approved=True,
        notice_period_waived=True, early_exit_charge=Decimal("25000"),
    )
    assert decision.early_exit_approved is True
    assert decision.notice_period_waived is True
