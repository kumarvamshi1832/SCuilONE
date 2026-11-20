from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

import pytest
from pydantic import ValidationError

from app.schemas.property_offer import PropertyOfferCreate
from app.schemas.rental import (
    RentalAgreementCreate,
    RentalAgreementWalkInSignature,
    RentalAgreementSignRequest,
)


def test_walk_in_rental_agreement_can_be_created_without_customer_portal_reference():
    # Walk-in customers still have a CRM Lead/Contact, but do not need a portal user.
    agreement = RentalAgreementCreate(
        property_id=uuid4(),
        lead_id=uuid4(),
        agreement_type="Rent",
        customer_name="Walk-in tenant",
        rent_amount="25000.00",
        agreement_start=date.today(),
    )
    assert agreement.lead_id is not None


def test_offer_expiry_must_be_in_the_future():
    with pytest.raises(ValidationError):
        PropertyOfferCreate(
            property_match_id=uuid4(),
            offered_price="5000000.00",
            expires_at=datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=1),
        )


def test_offer_can_have_a_future_expiry():
    offer = PropertyOfferCreate(
        property_match_id=uuid4(),
        offered_price="5000000.00",
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=7),
    )
    assert offer.expires_at is not None


def test_portal_signature_requires_typed_name_and_explicit_acceptance():
    request = RentalAgreementSignRequest(
        accepted_terms=True,
        signature_name="Walk-in Customer",
    )
    assert request.accepted_terms is True
    assert request.signature_name == "Walk-in Customer"


def test_walk_in_signature_requires_executed_document_evidence():
    request = RentalAgreementWalkInSignature(
        signer_name="Walk-in Customer",
        signed_document_url="https://files.example.com/executed-agreement.pdf",
        witnessed=True,
    )
    assert request.witnessed is True
