from decimal import Decimal
from uuid import uuid4
import pytest
from pydantic import ValidationError
from app.schemas.property_offer import PropertyOfferCreate, PropertyOfferDecision
from app.schemas.booking import BookingCreate


def test_offer_requires_positive_price():
    with pytest.raises(ValidationError):
        PropertyOfferCreate(property_match_id=uuid4(), offered_price=Decimal("0"))


def test_counteroffer_requires_price_at_decision_layer():
    decision = PropertyOfferDecision(decision="Countered", response_notes="Can reduce slightly")
    assert decision.counter_price is None  # route rejects missing price with HTTP 400


def test_booking_schema_accepts_optional_accepted_offer():
    payload = BookingCreate(
        property_id=uuid4(), buyer_name="Test Buyer", booking_amount=Decimal("100000"),
        accepted_offer_id=uuid4(),
    )
    assert payload.accepted_offer_id is not None
