"""Problem 18: Full End-to-End API Journey Tests for All Six Customer Journeys.

Covers:
1. Sale – Portal customer
2. Sale – Walk-in customer
3. Rent – Portal customer
4. Rent – Walk-in customer
5. Lease – Portal customer
6. Lease – Walk-in customer

Each test exercises the real FastAPI routes, database records, property availability,
holds, agreements, payments, verifications, and handover states.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _create_property(
    db: Session,
    tenant_id,
    created_by,
    *,
    name: str,
    listing_type: str,
    price: Decimal,
    price_frequency: str,
    security_deposit: Decimal | None = None,
    minimum_term_months: int | None = None,
    maximum_term_months: int | None = None,
):
    from app.models.property import Property

    prop = Property(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        created_by=created_by,
        name=name,
        property_type="Apartment",
        listing_type=listing_type,
        address="100 Jubilee Hills",
        city="Hyderabad",
        state="Telangana",
        country="India",
        price=price,
        price_frequency=price_frequency,
        security_deposit=security_deposit,
        minimum_term_months=minimum_term_months,
        maximum_term_months=maximum_term_months,
        currency="INR",
        status="Available",
    )
    db.add(prop)
    db.commit()
    db.refresh(prop)
    return prop


def _create_requirement_match_visit(
    db: Session,
    tenant_id,
    created_by,
    prop_id,
    *,
    requirement_type: str,
    lead_id=None,
    contact_id=None,
    with_completed_visit: bool = False,
):
    from app.models.buyer_requirement import BuyerRequirement
    from app.models.property_match import PropertyMatch
    from app.models.site_visit import SiteVisit

    req = BuyerRequirement(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        created_by=created_by,
        lead_id=lead_id,
        contact_id=contact_id,
        requirement_type=requirement_type,
        budget_frequency="One-time" if requirement_type == "Buy" else "Monthly",
        property_type="Apartment",
        status="Matched",
    )
    db.add(req)
    db.flush()

    match = PropertyMatch(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        buyer_requirement_id=req.id,
        property_id=prop_id,
        assigned_to=created_by,
        created_by=created_by,
        status="Matched",
    )
    db.add(match)
    db.flush()

    visit = None
    if with_completed_visit:
        visit = SiteVisit(
            id=uuid.uuid4(),
            tenant_id=tenant_id,
            property_match_id=match.id,
            scheduled_start=_utc_now() - timedelta(days=1),
            scheduled_end=_utc_now() - timedelta(days=1) + timedelta(hours=1),
            status="Completed",
            created_by=created_by,
        )
        db.add(visit)

    db.commit()
    return req, match, visit


# ---------------------------------------------------------------------------
# Journey 1: Sale – Portal Customer
# ---------------------------------------------------------------------------
def test_e2e_journey_1_sale_portal_customer(db_session: Session, seed_world, api_client_factory):
    from app.models.booking import Booking
    from app.models.buyer_requirement import BuyerRequirement
    from app.models.customer_booking_journey import CustomerPortalJourneyFile
    from app.models.customer_portal_lifecycle import PropertyHandover
    from app.models.lead import Lead
    from app.models.payment import Payment
    from app.models.property import Property

    t1 = seed_world["t1"]
    prop = _create_property(
        db_session, t1["tenant"].id, t1["staff"].id,
        name="Skyline Sale 101", listing_type="Sale",
        price=Decimal("5000000.00"), price_frequency="One-time",
    )
    req, match, visit = _create_requirement_match_visit(
        db_session, t1["tenant"].id, t1["staff"].id, prop.id,
        requirement_type="Buy", lead_id=t1["lead_portal"].id, contact_id=t1["contact"].id,
        with_completed_visit=True,
    )

    portal_client = api_client_factory(portal_ctx=t1["portal_ctx"])
    staff_client = api_client_factory(staff_ctx=t1["staff_ctx"])

    # 1. Customer submits Interested feedback
    r = portal_client.post(f"/api/v1/customer-portal/site-visits/{visit.id}/feedback", json={
        "rating": 5, "feedback": "Great apartment", "decision": "Interested",
    })
    assert r.status_code == 201, r.text

    # 2. Customer requests booking -> immediate temporary hold placed (Problem 2)
    r = portal_client.post(f"/api/v1/customer-portal/site-visits/{visit.id}/booking-requests", json={
        "payment_preference": "Full Payment", "notes": "Ready to buy",
    })
    assert r.status_code == 201, r.text
    req_data = r.json()
    req_id = req_data["id"]
    assert req_data["status"] == "Requested"
    assert req_data["hold_expires_at"] is not None
    db_session.refresh(prop)
    assert prop.status == "Reserved"

    # 3. Staff approves request -> creates Pending Booking and transitions hold
    r = staff_client.post(f"/api/v1/customer-booking-workflow/requests/{req_id}/decision", json={
        "decision": "Approve",
        "agreed_price": "5000000.00",
        "booking_amount": "500000.00",
        "payment_preference": "Full Payment",
        "notes": "Approved",
    })
    assert r.status_code == 200, r.text
    booking_id = r.json()["booking_id"]
    assert booking_id is not None

    # 4. Customer submits buyer & nominee details
    r = portal_client.put(f"/api/v1/customer-portal/booking-requests/{req_id}/buyer-details", json={
        "buyer_name": t1["contact"].full_name,
        "buyer_phone": "+919876543210",
        "buyer_email": t1["contact"].email,
        "buyer_address": "Hyderabad",
        "nominees": [{"nominee_name": "Spouse Name", "relationship": "Spouse", "allocation_percentage": "100.00"}],
    })
    assert r.status_code == 200, r.text

    # 5. Staff prepares agreement -> Customer acknowledges -> Signed file recorded -> Staff verifies
    r = staff_client.post(f"/api/v1/customer-booking-workflow/requests/{req_id}/agreement", json={
        "agreement_text": "Sale Agreement Terms and Conditions for Skyline Sale 101 full text.",
    })
    assert r.status_code == 200, r.text

    r = portal_client.post(f"/api/v1/customer-portal/booking-requests/{req_id}/agreement/acknowledge", json={
        "full_name": t1["contact"].full_name, "confirm": True,
    })
    assert r.status_code == 200, r.text

    signed_file = CustomerPortalJourneyFile(
        id=uuid.uuid4(),
        tenant_id=t1["tenant"].id,
        portal_user_id=t1["portal_user"].id,
        booking_request_id=uuid.UUID(req_id),
        purpose="Signed Agreement",
        agreement_version=1,
        filename="signed.pdf",
        content_type="application/pdf",
        file_size=1024,
        storage_public_id=f"test/{uuid.uuid4().hex}",
        file_url="https://example.com/signed.pdf",
    )
    db_session.add(signed_file)
    db_session.commit()

    r = staff_client.post(f"/api/v1/customer-booking-workflow/requests/{req_id}/agreement/verify", json={
        "verified": True, "signed_file_id": str(signed_file.id), "notes": "Verified copy",
    })
    assert r.status_code == 200, r.text

    # 6. Customer submits booking token payment -> Staff verifies payment
    r = portal_client.post(f"/api/v1/customer-portal/booking-requests/{req_id}/payments", json={
        "amount": "500000.00", "payment_method": "Bank Transfer", "transaction_reference": "TXN-PORTAL-001",
    })
    assert r.status_code == 201, r.text
    pay1_id = uuid.UUID(r.json()["id"])
    pay1 = db_session.query(Payment).filter(Payment.id == pay1_id).first()
    pay1.status = "Verified"
    pay1.verified_by = t1["staff"].id
    pay1.verified_at = _utc_now()
    db_session.commit()

    # 7. Customer final-confirms booking
    r = portal_client.post(f"/api/v1/customer-portal/booking-requests/{req_id}/confirm")
    assert r.status_code == 200, r.text
    assert r.json()["booking_status"] == "Confirmed"

    # 8. Customer submits remaining balance -> verified -> Staff completes sale
    r = portal_client.post(f"/api/v1/customer-portal/booking-requests/{req_id}/payments", json={
        "amount": "4500000.00", "payment_method": "Bank Transfer", "transaction_reference": "TXN-PORTAL-002",
    })
    assert r.status_code == 201, r.text
    pay2 = db_session.query(Payment).filter(Payment.id == uuid.UUID(r.json()["id"])).first()
    pay2.status = "Verified"
    pay2.verified_by = t1["staff"].id
    pay2.verified_at = _utc_now()
    db_session.commit()

    r = staff_client.post(f"/api/v1/bookings/{booking_id}/complete")
    assert r.status_code == 200, r.text
    db_session.refresh(prop)
    assert prop.status == "Sold"
    assert db_session.query(Lead).filter(Lead.id == t1["lead_portal"].id).first().status == "Converted"
    assert db_session.query(BuyerRequirement).filter(BuyerRequirement.id == req.id).first().status == "Closed"

    # 9. Portal handover lifecycle (Problem 4)
    r = staff_client.post(f"/api/v1/customer-booking-workflow/bookings/{booking_id}/handover", json={
        "scheduled_at": (_utc_now() + timedelta(days=2)).isoformat(),
        "checklist": ["Keys handed over", "Sale deed transferred"],
        "property_condition": "Excellent",
        "keys_handed_over": "2 main door keys, 1 mailbox key",
    })
    assert r.status_code == 201, r.text
    handover_id = r.json()["id"]
    assert r.json()["handover_mode"] == "Portal"

    # Cannot complete before customer acknowledgement
    r = staff_client.patch(f"/api/v1/customer-booking-workflow/handovers/{handover_id}", json={
        "status": "Completed",
        "checklist": [
            {"item": "Keys handed over", "completed": True},
            {"item": "Sale deed transferred", "completed": True},
        ],
    })
    assert r.status_code == 409

    # Customer acknowledges possession
    r = portal_client.post(f"/api/v1/customer-portal/handovers/{handover_id}/acknowledge", json={
        "confirm_possession": True, "notes": "Received keys and documents",
    })
    assert r.status_code == 200, r.text

    # Staff completes handover
    r = staff_client.patch(f"/api/v1/customer-booking-workflow/handovers/{handover_id}", json={
        "status": "Completed",
        "checklist": [
            {"item": "Keys handed over", "completed": True},
            {"item": "Sale deed transferred", "completed": True},
        ],
    })
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Completed"
    assert r.json()["completed_at"] is not None


# ---------------------------------------------------------------------------
# Journey 2: Sale – Walk-in Customer (No Portal Account)
# ---------------------------------------------------------------------------
def test_e2e_journey_2_sale_walkin_customer(db_session: Session, seed_world, api_client_factory):
    from app.models.payment import Payment

    t1 = seed_world["t1"]
    prop = _create_property(
        db_session, t1["tenant"].id, t1["staff"].id,
        name="Walkin Villa 202", listing_type="Sale",
        price=Decimal("4000000.00"), price_frequency="One-time",
    )
    req, _match, _visit = _create_requirement_match_visit(
        db_session, t1["tenant"].id, t1["staff"].id, prop.id,
        requirement_type="Buy", lead_id=t1["lead_walkin"].id, contact_id=t1["walkin_contact"].id,
    )
    staff_client = api_client_factory(staff_ctx=t1["staff_ctx"])

    # 1. Staff creates walk-in Sale booking -> temporary hold created (Problem 1)
    r = staff_client.post("/api/v1/bookings/", json={
        "property_id": str(prop.id),
        "buyer_name": t1["walkin_contact"].full_name,
        "buyer_email": t1["walkin_contact"].email,
        "buyer_phone": t1["walkin_contact"].phone,
        "lead_id": str(t1["lead_walkin"].id),
        "buyer_requirement_id": str(req.id),
        "booking_amount": "400000.00",
        "agreed_price": "4000000.00",
    })
    assert r.status_code == 201, r.text
    b_data = r.json()
    booking_id = b_data["id"]
    assert b_data["hold_created_at"] is not None
    assert b_data["hold_expires_at"] is not None
    db_session.refresh(prop)
    assert prop.status == "Reserved"

    # 2. Record & verify full payment, confirm booking, complete sale
    payment = Payment(
        id=uuid.uuid4(),
        tenant_id=t1["tenant"].id,
        booking_id=uuid.UUID(booking_id),
        amount=Decimal("4000000.00"),
        payment_method="Bank Transfer",
        transaction_reference="TXN-WALKIN-SALE-001",
        status="Verified",
        verified_by=t1["staff"].id,
        verified_at=_utc_now(),
        created_by=t1["staff"].id,
    )
    db_session.add(payment)
    db_session.commit()

    r = staff_client.patch(f"/api/v1/bookings/{booking_id}", json={"status": "Confirmed"})
    assert r.status_code == 200, r.text
    assert r.json()["hold_expires_at"] is None

    r = staff_client.post(f"/api/v1/bookings/{booking_id}/complete")
    assert r.status_code == 200, r.text
    db_session.refresh(prop)
    assert prop.status == "Sold"

    # 3. Walk-in handover WITHOUT portal account (Problem 3)
    r = staff_client.post(f"/api/v1/customer-booking-workflow/bookings/{booking_id}/handover", json={
        "scheduled_at": (_utc_now() + timedelta(days=1)).isoformat(),
        "checklist": ["Keys delivered", "Original documents handed over"],
        "property_condition": "Good",
        "keys_handed_over": "3 sets of keys",
        "documents_transferred": ["Sale Deed", "OC Certificate"],
        "handover_remarks": "In-person walk-in handover",
    })
    assert r.status_code == 201, r.text
    h_data = r.json()
    handover_id = h_data["id"]
    assert h_data["handover_mode"] == "Walk-in"
    assert h_data["portal_user_id"] is None
    assert h_data["customer_name"] == t1["walkin_contact"].full_name

    # Staff records walk-in customer possession acknowledgement
    r = staff_client.post(f"/api/v1/customer-booking-workflow/handovers/{handover_id}/walk-in-acknowledge", json={
        "acknowledged_by_customer_name": t1["walkin_contact"].full_name,
        "confirm_possession": True,
        "notes": "Signed physical handover receipt",
    })
    assert r.status_code == 200, r.text
    assert r.json()["staff_acknowledged_at"] is not None

    # Staff completes walk-in handover
    r = staff_client.patch(f"/api/v1/customer-booking-workflow/handovers/{handover_id}", json={
        "status": "Completed",
        "checklist": [
            {"item": "Keys delivered", "completed": True},
            {"item": "Original documents handed over", "completed": True},
        ],
    })
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Completed"


# ---------------------------------------------------------------------------
# Journey 3: Rent – Portal Customer
# ---------------------------------------------------------------------------
def test_e2e_journey_3_rent_portal_customer(db_session: Session, seed_world, api_client_factory):
    from app.models.buyer_requirement import BuyerRequirement
    from app.models.lead import Lead

    t1 = seed_world["t1"]
    prop = _create_property(
        db_session, t1["tenant"].id, t1["staff"].id,
        name="Greenview Rent 303", listing_type="Rent",
        price=Decimal("30000.00"), price_frequency="Monthly",
        security_deposit=Decimal("60000.00"),
    )
    req, match, _ = _create_requirement_match_visit(
        db_session, t1["tenant"].id, t1["staff"].id, prop.id,
        requirement_type="Rent", lead_id=t1["lead_portal"].id, contact_id=t1["contact"].id,
    )

    portal_client = api_client_factory(portal_ctx=t1["portal_ctx"])
    staff_client = api_client_factory(staff_ctx=t1["staff_ctx"])

    # 1. Customer views eligible rental properties
    r = portal_client.get("/api/v1/customer-portal/rental-properties?listing_type=Rent")
    assert r.status_code == 200, r.text
    assert any(item["id"] == str(prop.id) for item in r.json())

    # 2. Customer submits portal Rent booking request -> immediate temporary hold
    start = date.today() + timedelta(days=5)
    r = portal_client.post("/api/v1/customer-portal/rental-booking-requests", json={
        "property_id": str(prop.id),
        "buyer_requirement_id": str(req.id),
        "property_match_id": str(match.id),
        "desired_start_date": start.isoformat(),
        "duration_months": 12,
        "customer_notes": "Moving in next week",
    })
    assert r.status_code == 201, r.text
    req_id = r.json()["id"]
    assert r.json()["status"] == "Requested"
    assert r.json()["hold_expires_at"] is not None
    db_session.refresh(prop)
    assert prop.status == "Reserved"

    # 3. Staff approves request with commercial terms -> creates rental agreement
    r = staff_client.post(f"/api/v1/rentals/booking-requests/{req_id}/decision", json={
        "decision": "Approve",
        "approved_rent_amount": "30000.00",
        "approved_deposit_amount": "60000.00",
        "duration_months": 12,
        "terms_notes": "Standard 12-month residential rent",
    })
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "Approved"

    r = staff_client.post(f"/api/v1/rentals/booking-requests/{req_id}/create-agreement")
    assert r.status_code == 201, r.text
    agreement_id = r.json()["id"]
    assert r.json()["lead_id"] == str(t1["lead_portal"].id)

    # 4. Send for signature -> Portal customer signs -> Deposit submitted & verified -> Activate
    r = staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/send-for-signature", json={
        "agreement_document_url": "https://example.com/rent-agreement.pdf",
    })
    assert r.status_code == 200, r.text

    r = portal_client.post(f"/api/v1/customer-portal/rental-agreements/{agreement_id}/sign", json={
        "accepted_terms": True, "signature_name": t1["contact"].full_name,
    })
    assert r.status_code == 200, r.text

    r = portal_client.post(f"/api/v1/customer-portal/rental-agreements/{agreement_id}/payments", json={
        "payment_type": "Deposit", "amount": "60000.00",
        "payment_method": "UPI", "transaction_reference": "DEP-PORTAL-RENT-1",
    })
    assert r.status_code == 201, r.text
    dep_id = r.json()["id"]

    r = staff_client.post(f"/api/v1/rentals/payments/{dep_id}/decision", json={"decision": "Verified"})
    assert r.status_code == 200, r.text

    r = staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/activate", json={
        "signed_at": _utc_now().isoformat(),
    })
    assert r.status_code == 200, r.text
    db_session.refresh(prop)
    assert prop.status == "Rented"
    assert db_session.query(Lead).filter(Lead.id == t1["lead_portal"].id).first().status == "Rented"
    assert db_session.query(BuyerRequirement).filter(BuyerRequirement.id == req.id).first().status == "Closed"

    # 5. Rent payment with schedule_id & verify
    sched_r = staff_client.get(f"/api/v1/rentals/agreements/{agreement_id}/schedule")
    assert sched_r.status_code == 200
    first_sched_id = sched_r.json()[0]["id"]

    r = portal_client.post(f"/api/v1/customer-portal/rental-agreements/{agreement_id}/payments", json={
        "schedule_id": first_sched_id, "payment_type": "Rent", "amount": "30000.00",
        "payment_method": "UPI", "transaction_reference": "RENT-M1-PORTAL",
    })
    assert r.status_code == 201, r.text
    r = staff_client.post(f"/api/v1/rentals/payments/{r.json()['id']}/decision", json={"decision": "Verified"})
    assert r.status_code == 200, r.text


# ---------------------------------------------------------------------------
# Journey 4: Rent – Walk-in Customer (No Portal Account)
# ---------------------------------------------------------------------------
def test_e2e_journey_4_rent_walkin_customer(db_session: Session, seed_world, api_client_factory):
    t1 = seed_world["t1"]
    prop = _create_property(
        db_session, t1["tenant"].id, t1["staff"].id,
        name="Oakwood Walkin Rent 404", listing_type="Rent",
        price=Decimal("25000.00"), price_frequency="Monthly",
        security_deposit=Decimal("50000.00"),
    )
    req, match, _ = _create_requirement_match_visit(
        db_session, t1["tenant"].id, t1["staff"].id, prop.id,
        requirement_type="Rent", lead_id=t1["lead_walkin"].id, contact_id=t1["walkin_contact"].id,
    )
    staff_client = api_client_factory(staff_ctx=t1["staff_ctx"])

    # 1. Staff creates walk-in Rent booking request (no portal account)
    r = staff_client.post("/api/v1/rentals/booking-requests", json={
        "property_id": str(prop.id),
        "buyer_requirement_id": str(req.id),
        "property_match_id": str(match.id),
        "customer_name": t1["walkin_contact"].full_name,
        "customer_phone": t1["walkin_contact"].phone,
        "proposed_rent_amount": "25000.00",
        "proposed_deposit_amount": "50000.00",
        "desired_start_date": date.today().isoformat(),
    })
    assert r.status_code == 201, r.text
    req_id = r.json()["id"]
    assert r.json()["channel"] == "Walk-in"
    assert r.json()["portal_user_id"] is None
    assert r.json()["lead_id"] == str(t1["lead_walkin"].id)
    db_session.refresh(prop)
    assert prop.status == "Reserved"

    # 2. Approve -> Create Agreement -> Send -> Walk-in Sign -> Deposit -> Activate
    r = staff_client.post(f"/api/v1/rentals/booking-requests/{req_id}/decision", json={
        "decision": "Approve", "approved_rent_amount": "25000.00", "approved_deposit_amount": "50000.00",
    })
    assert r.status_code == 200, r.text

    r = staff_client.post(f"/api/v1/rentals/booking-requests/{req_id}/create-agreement")
    assert r.status_code == 201, r.text
    agreement_id = r.json()["id"]

    assert staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/send-for-signature", json={
        "agreement_document_url": "https://example.com/walkin-rent.pdf",
    }).status_code == 200

    assert staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/record-walk-in-signature", json={
        "signer_name": t1["walkin_contact"].full_name,
        "signed_document_url": "https://example.com/walkin-rent-signed.pdf",
        "witnessed": True,
    }).status_code == 200

    dep = staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/payments", json={
        "payment_type": "Deposit", "amount": "50000.00",
        "payment_method": "Bank Transfer", "transaction_reference": "DEP-WALKIN-RENT-1",
    })
    assert dep.status_code == 201, dep.text
    assert staff_client.post(f"/api/v1/rentals/payments/{dep.json()['id']}/decision", json={"decision": "Verified"}).status_code == 200

    act = staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/activate", json={"signed_at": _utc_now().isoformat()})
    assert act.status_code == 200, act.text
    db_session.refresh(prop)
    assert prop.status == "Rented"


# ---------------------------------------------------------------------------
# Journey 5: Lease – Portal Customer
# ---------------------------------------------------------------------------
def test_e2e_journey_5_lease_portal_customer(db_session: Session, seed_world, api_client_factory):
    from app.models.lead import Lead

    t1 = seed_world["t1"]
    prop = _create_property(
        db_session, t1["tenant"].id, t1["staff"].id,
        name="TechPark Lease Suite 505", listing_type="Lease",
        price=Decimal("120000.00"), price_frequency="Monthly",
        security_deposit=Decimal("360000.00"),
        minimum_term_months=12, maximum_term_months=60,
    )
    req, match, _ = _create_requirement_match_visit(
        db_session, t1["tenant"].id, t1["staff"].id, prop.id,
        requirement_type="Lease", lead_id=t1["lead_portal"].id, contact_id=t1["contact"].id,
    )

    portal_client = api_client_factory(portal_ctx=t1["portal_ctx"])
    staff_client = api_client_factory(staff_ctx=t1["staff_ctx"])

    # Lease must require fixed term
    bad = portal_client.post("/api/v1/customer-portal/rental-booking-requests", json={
        "property_id": str(prop.id), "desired_start_date": date.today().isoformat(),
    })
    assert bad.status_code == 400

    # Valid fixed-term Lease request
    r = portal_client.post("/api/v1/customer-portal/rental-booking-requests", json={
        "property_id": str(prop.id),
        "buyer_requirement_id": str(req.id),
        "property_match_id": str(match.id),
        "desired_start_date": date.today().isoformat(),
        "duration_months": 36,
    })
    assert r.status_code == 201, r.text
    req_id = r.json()["id"]
    assert r.json()["booking_type"] == "Lease"
    db_session.refresh(prop)
    assert prop.status == "Reserved"

    assert staff_client.post(f"/api/v1/rentals/booking-requests/{req_id}/decision", json={
        "decision": "Approve", "approved_rent_amount": "120000.00", "approved_deposit_amount": "360000.00",
        "duration_months": 36, "lock_in_months": 12,
    }).status_code == 200

    ag = staff_client.post(f"/api/v1/rentals/booking-requests/{req_id}/create-agreement")
    assert ag.status_code == 201, ag.text
    agreement_id = ag.json()["id"]

    assert staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/send-for-signature", json={
        "agreement_document_url": "https://example.com/lease.pdf",
    }).status_code == 200

    assert portal_client.post(f"/api/v1/customer-portal/rental-agreements/{agreement_id}/sign", json={
        "accepted_terms": True, "signature_name": t1["contact"].full_name,
    }).status_code == 200

    dep = portal_client.post(f"/api/v1/customer-portal/rental-agreements/{agreement_id}/payments", json={
        "payment_type": "Deposit", "amount": "360000.00",
        "payment_method": "Bank Transfer", "transaction_reference": "DEP-LEASE-PORTAL-1",
    })
    assert dep.status_code == 201, dep.text
    assert staff_client.post(f"/api/v1/rentals/payments/{dep.json()['id']}/decision", json={"decision": "Verified"}).status_code == 200

    act = staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/activate", json={"signed_at": _utc_now().isoformat()})
    assert act.status_code == 200, act.text
    db_session.refresh(prop)
    # Problem 11 & 12: Lease sets property status to Leased and lead status to Leased!
    assert prop.status == "Leased"
    assert db_session.query(Lead).filter(Lead.id == t1["lead_portal"].id).first().status == "Leased"


# ---------------------------------------------------------------------------
# Journey 6: Lease – Walk-in Customer (No Portal Account)
# ---------------------------------------------------------------------------
def test_e2e_journey_6_lease_walkin_customer(db_session: Session, seed_world, api_client_factory):
    from app.models.lead import Lead

    t1 = seed_world["t1"]
    prop = _create_property(
        db_session, t1["tenant"].id, t1["staff"].id,
        name="Commercial Lease Unit 606", listing_type="Lease",
        price=Decimal("200000.00"), price_frequency="Monthly",
        security_deposit=Decimal("600000.00"),
        minimum_term_months=12, maximum_term_months=60,
    )
    req, match, _ = _create_requirement_match_visit(
        db_session, t1["tenant"].id, t1["staff"].id, prop.id,
        requirement_type="Lease", lead_id=t1["lead_walkin"].id, contact_id=t1["walkin_contact"].id,
    )
    staff_client = api_client_factory(staff_ctx=t1["staff_ctx"])

    r = staff_client.post("/api/v1/rentals/booking-requests", json={
        "property_id": str(prop.id),
        "buyer_requirement_id": str(req.id),
        "property_match_id": str(match.id),
        "customer_name": t1["walkin_contact"].full_name,
        "proposed_rent_amount": "200000.00",
        "proposed_deposit_amount": "600000.00",
        "desired_start_date": date.today().isoformat(),
        "duration_months": 24,
        "lock_in_months": 6,
    })
    assert r.status_code == 201, r.text
    req_id = r.json()["id"]
    assert r.json()["booking_type"] == "Lease"
    assert r.json()["channel"] == "Walk-in"

    assert staff_client.post(f"/api/v1/rentals/booking-requests/{req_id}/decision", json={
        "decision": "Approve", "approved_rent_amount": "200000.00", "approved_deposit_amount": "600000.00",
        "duration_months": 24, "lock_in_months": 6,
    }).status_code == 200

    ag = staff_client.post(f"/api/v1/rentals/booking-requests/{req_id}/create-agreement")
    assert ag.status_code == 201, ag.text
    agreement_id = ag.json()["id"]

    assert staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/send-for-signature", json={
        "agreement_document_url": "https://example.com/walkin-lease.pdf",
    }).status_code == 200
    assert staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/record-walk-in-signature", json={
        "signer_name": t1["walkin_contact"].full_name,
        "signed_document_url": "https://example.com/walkin-lease-signed.pdf",
        "witnessed": True,
    }).status_code == 200

    dep = staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/payments", json={
        "payment_type": "Deposit", "amount": "600000.00",
        "payment_method": "Bank Transfer", "transaction_reference": "DEP-WALKIN-LEASE-1",
    })
    assert dep.status_code == 201, dep.text
    assert staff_client.post(f"/api/v1/rentals/payments/{dep.json()['id']}/decision", json={"decision": "Verified"}).status_code == 200

    act = staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/activate", json={"signed_at": _utc_now().isoformat()})
    assert act.status_code == 200, act.text
    db_session.refresh(prop)
    assert prop.status == "Leased"
    assert db_session.query(Lead).filter(Lead.id == t1["lead_walkin"].id).first().status == "Leased"
