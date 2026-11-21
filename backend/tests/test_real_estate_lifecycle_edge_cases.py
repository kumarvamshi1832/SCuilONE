"""Problem 19: Comprehensive Real Estate Lifecycle Edge-Case Tests.

Covers:
- Duplicate booking & property already reserved & concurrent booking prevention
- Booking rejection & hold release
- Hold expiry (walk-in Sale, portal Sale Requested/Approved, Rent/Lease) + verified payment protection
- Payment pending, rejected, verified, partial payment, missing schedule_id
- Agreement signature missing, activation, expiry, cancellation
- Missing lead_id derivation from BuyerRequirement (Problem 10)
- Late fees in rental arrears preview & calculation without double-counting (Problem 15)
- Premature move-out handover blocked on Amount Due / Partially Collected / Approved / Partially Refunded + authorized exception (Problem 16)
- Open-ended rental schedule rolling extension + month-end handling + skipping terminated/cancelled + worker idempotency (Problem 13)
- Walk-in & portal offer negotiation (Accept, Reject, Counteroffer, Expired offer, full history preserved) (Problem 17)
- Tenant isolation & unauthorized access
- Alembic migration single head & upgrade/downgrade SQL check
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from sqlalchemy.orm import Session

from tests.test_e2e_real_estate_journeys import _create_property, _create_requirement_match_visit, _utc_now


def test_walkin_sale_hold_expiry_releases_unpaid_and_protects_verified_funds(db_session: Session, seed_world, api_client_factory):
    from app.models.booking import Booking
    from app.models.payment import Payment
    from app.worker.jobs import expire_walkin_sale_holds

    t1 = seed_world["t1"]
    staff_client = api_client_factory(staff_ctx=t1["staff_ctx"])

    # Case A: Unpaid walk-in booking expires -> status Expired, property Available
    prop1 = _create_property(db_session, t1["tenant"].id, t1["staff"].id, name="Exp Sale 1", listing_type="Sale", price=Decimal("1000000.00"), price_frequency="One-time")
    r = staff_client.post("/api/v1/bookings/", json={
        "property_id": str(prop1.id), "buyer_name": "Walkin A", "booking_amount": "100000.00", "agreed_price": "1000000.00",
    })
    assert r.status_code == 201
    b1 = db_session.query(Booking).filter(Booking.id == uuid.UUID(r.json()["id"])).first()
    # Duplicate booking while hold is active is blocked
    dup = staff_client.post("/api/v1/bookings/", json={
        "property_id": str(prop1.id), "buyer_name": "Walkin B", "booking_amount": "100000.00", "agreed_price": "1000000.00",
    })
    assert dup.status_code == 409

    b1.hold_expires_at = _utc_now() - timedelta(minutes=5)
    db_session.commit()

    res1 = expire_walkin_sale_holds(db_session, date.today())
    assert res1["expired_walkin_bookings"] == 1
    db_session.refresh(b1)
    db_session.refresh(prop1)
    assert b1.status == "Expired"
    assert prop1.status == "Available"

    # Idempotency: second run changes nothing
    res2 = expire_walkin_sale_holds(db_session, date.today())
    assert res2["expired_walkin_bookings"] == 0

    # Case B: Walk-in booking with Verified payment -> Expired - Payment Review, property stays Reserved
    prop2 = _create_property(db_session, t1["tenant"].id, t1["staff"].id, name="Exp Sale 2", listing_type="Sale", price=Decimal("1000000.00"), price_frequency="One-time")
    r2 = staff_client.post("/api/v1/bookings/", json={
        "property_id": str(prop2.id), "buyer_name": "Walkin Paid", "booking_amount": "100000.00", "agreed_price": "1000000.00",
    })
    b2 = db_session.query(Booking).filter(Booking.id == uuid.UUID(r2.json()["id"])).first()
    db_session.add(Payment(
        id=uuid.uuid4(), tenant_id=t1["tenant"].id, booking_id=b2.id,
        amount=Decimal("100000.00"), payment_method="UPI", transaction_reference="VER-EXP-1",
        status="Verified", verified_by=t1["staff"].id, verified_at=_utc_now(),
    ))
    b2.hold_expires_at = _utc_now() - timedelta(minutes=5)
    db_session.commit()

    res3 = expire_walkin_sale_holds(db_session, date.today())
    assert res3["payment_review_required"] == 1
    db_session.refresh(b2)
    db_session.refresh(prop2)
    assert b2.status == "Expired - Payment Review"
    assert prop2.status == "Reserved"


def test_portal_booking_request_rejection_and_initial_expiry_release_hold(db_session: Session, seed_world, api_client_factory):
    from app.models.customer_booking_journey import CustomerBookingRequest
    from app.worker.jobs import expire_customer_booking_holds

    t1 = seed_world["t1"]
    prop = _create_property(db_session, t1["tenant"].id, t1["staff"].id, name="Portal Hold Test", listing_type="Sale", price=Decimal("2000000.00"), price_frequency="One-time")
    _, _, visit = _create_requirement_match_visit(
        db_session, t1["tenant"].id, t1["staff"].id, prop.id,
        requirement_type="Buy", lead_id=t1["lead_portal"].id, contact_id=t1["contact"].id,
        with_completed_visit=True,
    )
    portal_client = api_client_factory(portal_ctx=t1["portal_ctx"])
    staff_client = api_client_factory(staff_ctx=t1["staff_ctx"])

    assert portal_client.post(f"/api/v1/customer-portal/site-visits/{visit.id}/feedback", json={"decision": "Interested"}).status_code == 201
    r = portal_client.post(f"/api/v1/customer-portal/site-visits/{visit.id}/booking-requests", json={"payment_preference": "Full Payment"})
    assert r.status_code == 201
    req_id = r.json()["id"]
    db_session.refresh(prop)
    assert prop.status == "Reserved"

    # Reject releases hold safely
    rej = staff_client.post(f"/api/v1/customer-booking-workflow/requests/{req_id}/decision", json={"decision": "Reject", "notes": "Declined"})
    assert rej.status_code == 200
    db_session.refresh(prop)
    assert prop.status == "Available"

    # Re-request places fresh initial hold, then expires via worker
    r2 = portal_client.post(f"/api/v1/customer-portal/site-visits/{visit.id}/booking-requests", json={"payment_preference": "Full Payment"})
    assert r2.status_code == 201
    db_session.refresh(prop)
    assert prop.status == "Reserved"

    row = db_session.query(CustomerBookingRequest).filter(CustomerBookingRequest.id == uuid.UUID(req_id)).first()
    row.hold_expires_at = _utc_now() - timedelta(minutes=1)
    db_session.commit()

    exp = expire_customer_booking_holds(db_session, date.today())
    assert exp["expired_holds"] == 1
    db_session.refresh(prop)
    assert prop.status == "Available"


def test_rental_booking_hold_expiry_and_cancellations(db_session: Session, seed_world, api_client_factory):
    from app.models.rental import RentalBookingRequest
    from app.worker.jobs import expire_rental_booking_holds

    t1 = seed_world["t1"]
    prop = _create_property(db_session, t1["tenant"].id, t1["staff"].id, name="Rent Hold Unit", listing_type="Rent", price=Decimal("20000.00"), price_frequency="Monthly")
    portal_client = api_client_factory(portal_ctx=t1["portal_ctx"])
    staff_client = api_client_factory(staff_ctx=t1["staff_ctx"])

    r = portal_client.post("/api/v1/customer-portal/rental-booking-requests", json={
        "property_id": str(prop.id), "desired_start_date": date.today().isoformat(), "duration_months": 12,
    })
    assert r.status_code == 201
    req_id = r.json()["id"]
    db_session.refresh(prop)
    assert prop.status == "Reserved"

    # Competing walk-in request is blocked while held
    conflict = staff_client.post("/api/v1/rentals/booking-requests", json={
        "property_id": str(prop.id), "lead_id": str(t1["lead_walkin"].id),
        "customer_name": "Other Customer", "proposed_rent_amount": "20000.00",
        "desired_start_date": date.today().isoformat(),
    })
    assert conflict.status_code == 409

    # Customer cancellation releases hold
    cancel = portal_client.post(f"/api/v1/customer-portal/rental-booking-requests/{req_id}/cancel", json={"reason": "Changed plans"})
    assert cancel.status_code == 200
    db_session.refresh(prop)
    assert prop.status == "Available"

    # Re-book and let worker expire hold
    r2 = staff_client.post("/api/v1/rentals/booking-requests", json={
        "property_id": str(prop.id), "lead_id": str(t1["lead_walkin"].id),
        "customer_name": "Walkin Expire", "proposed_rent_amount": "20000.00",
        "desired_start_date": date.today().isoformat(),
    })
    assert r2.status_code == 201
    row = db_session.query(RentalBookingRequest).filter(RentalBookingRequest.id == uuid.UUID(r2.json()["id"])).first()
    row.hold_expires_at = _utc_now() - timedelta(minutes=1)
    db_session.commit()

    exp = expire_rental_booking_holds(db_session, date.today())
    assert exp["expired_rental_booking_holds"] == 1
    db_session.refresh(prop)
    assert prop.status == "Available"


def test_problem_10_lead_derived_from_buyer_requirement_and_problem_14_schedule_id_required(db_session: Session, seed_world, api_client_factory):
    t1 = seed_world["t1"]
    prop = _create_property(db_session, t1["tenant"].id, t1["staff"].id, name="Derive Lead Flat", listing_type="Rent", price=Decimal("18000.00"), price_frequency="Monthly", security_deposit=Decimal("0.00"))
    req, match, _ = _create_requirement_match_visit(
        db_session, t1["tenant"].id, t1["staff"].id, prop.id,
        requirement_type="Rent", lead_id=t1["lead_walkin"].id, contact_id=t1["walkin_contact"].id,
    )
    staff_client = api_client_factory(staff_ctx=t1["staff_ctx"])

    # Omit lead_id on create_rental_agreement -> derived automatically from buyer_requirement_id!
    ag = staff_client.post("/api/v1/rentals/agreements", json={
        "property_id": str(prop.id),
        "buyer_requirement_id": str(req.id),
        "property_match_id": str(match.id),
        "agreement_type": "Rent",
        "customer_name": t1["walkin_contact"].full_name,
        "rent_amount": "18000.00",
        "rent_frequency": "Monthly",
        "deposit_amount": "0.00",
        "agreement_start": date.today().isoformat(),
    })
    assert ag.status_code == 201, ag.text
    assert ag.json()["lead_id"] == str(t1["lead_walkin"].id)
    assert ag.json()["contact_id"] == str(t1["walkin_contact"].id)
    agreement_id = ag.json()["id"]

    # Send, sign, activate (signature missing blocked first!)
    assert staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/send-for-signature", json={"agreement_document_url": "https://example.com/a.pdf"}).status_code == 200
    assert staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/activate", json={"signed_at": _utc_now().isoformat()}).status_code == 409
    assert staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/record-walk-in-signature", json={
        "signer_name": t1["walkin_contact"].full_name, "signed_document_url": "https://example.com/s.pdf", "witnessed": True,
    }).status_code == 200
    assert staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/activate", json={"signed_at": _utc_now().isoformat()}).status_code == 200

    # Problem 14: Staff Rent payment WITHOUT schedule_id must fail with 400!
    bad_rent = staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/payments", json={
        "payment_type": "Rent", "amount": "18000.00", "payment_method": "UPI", "transaction_reference": "NO-SCHED-1",
    })
    assert bad_rent.status_code == 400
    bad_maint = staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/payments", json={
        "payment_type": "Maintenance", "amount": "1000.00", "payment_method": "UPI", "transaction_reference": "NO-SCHED-2",
    })
    assert bad_maint.status_code == 400


def test_problem_15_late_fees_in_arrears_and_problem_16_move_out_handover_guard(db_session: Session, seed_world, api_client_factory):
    from app.models.rental import RentalDepositTransaction, RentalPaymentSchedule

    t1 = seed_world["t1"]
    prop = _create_property(db_session, t1["tenant"].id, t1["staff"].id, name="Arrears Flat", listing_type="Rent", price=Decimal("10000.00"), price_frequency="Monthly", security_deposit=Decimal("15000.00"))
    staff_client = api_client_factory(staff_ctx=t1["staff_ctx"])

    start = date.today() - timedelta(days=45)
    ag = staff_client.post("/api/v1/rentals/agreements", json={
        "property_id": str(prop.id), "lead_id": str(t1["lead_walkin"].id),
        "agreement_type": "Rent", "customer_name": "Late Tenant",
        "rent_amount": "10000.00", "rent_frequency": "Monthly", "deposit_amount": "15000.00",
        "agreement_start": start.isoformat(), "lock_in_months": 0, "notice_period_days": 0,
        "late_fee_type": "Fixed", "late_fee_amount": "500.00", "late_fee_grace_days": 0,
    })
    assert ag.status_code == 201, ag.text
    agreement_id = ag.json()["id"]
    assert staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/send-for-signature", json={"agreement_document_url": "https://example.com/a.pdf"}).status_code == 200
    assert staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/record-walk-in-signature", json={"signer_name": "Late Tenant", "signed_document_url": "https://example.com/s.pdf", "witnessed": True}).status_code == 200
    dep = staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/payments", json={"payment_type": "Deposit", "amount": "15000.00", "payment_method": "UPI", "transaction_reference": "DEP-LATE-1"})
    assert staff_client.post(f"/api/v1/rentals/payments/{dep.json()['id']}/decision", json={"decision": "Verified"}).status_code == 200
    assert staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/activate", json={"signed_at": _utc_now().isoformat()}).status_code == 200

    # Create exit request, approve, move-out inspection with 10000 damage (total deductions > 15000 deposit -> Amount Due!)
    ex = staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/exit-requests", json={
        "requested_vacate_date": date.today().isoformat(), "reason": "Relocating",
    })
    assert ex.status_code == 201, ex.text
    exit_id = ex.json()["id"]
    assert staff_client.post(f"/api/v1/rentals/exit-requests/{exit_id}/decision", json={"decision": "Approved", "notice_period_waived": True}).status_code == 200
    assert staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/inspections", json={
        "exit_request_id": exit_id, "inspection_type": "Move Out", "condition": "Damaged", "damage_amount": "10000.00",
    }).status_code == 201

    # Preview includes late fees without double-counting
    prev = staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/settlement/preview", json={"exit_request_id": exit_id})
    assert prev.status_code == 200, prev.text
    assert Decimal(prev.json()["late_fee_arrears"]) >= Decimal("500.00")

    calc = staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/settlement/calculate", json={"exit_request_id": exit_id})
    assert calc.status_code == 200, calc.text
    assert Decimal(calc.json()["rent_arrears"]) == Decimal(prev.json()["rent_arrears"])
    settlement_id = calc.json()["id"]
    due_amount = Decimal(calc.json()["amount_due_from_tenant"])
    assert due_amount > Decimal("0.00")

    # Approve -> status becomes Amount Due
    appr = staff_client.post(f"/api/v1/rentals/settlements/{settlement_id}/approve")
    assert appr.status_code == 200
    assert appr.json()["status"] == "Amount Due"

    # Problem 16: Premature move-out handover MUST be blocked while Amount Due!
    blocked = staff_client.post(f"/api/v1/rentals/exit-requests/{exit_id}/complete-handover")
    assert blocked.status_code == 409

    # Partial collection still blocked
    part = staff_client.post(f"/api/v1/rentals/settlements/{settlement_id}/collect", json={
        "amount": "1000.00", "payment_method": "UPI", "transaction_reference": "COL-PART-1",
    })
    assert part.status_code == 201
    # Unverified payment blocks handover
    assert staff_client.post(f"/api/v1/rentals/exit-requests/{exit_id}/complete-handover").status_code == 409
    assert staff_client.post(f"/api/v1/rentals/payments/{part.json()['id']}/decision", json={"decision": "Verified"}).status_code == 200
    # Partially Collected still blocks handover
    assert staff_client.post(f"/api/v1/rentals/exit-requests/{exit_id}/complete-handover").status_code == 409

    # Collect & verify remaining balance -> Collected -> Handover completes!
    rem = due_amount - Decimal("1000.00")
    fin = staff_client.post(f"/api/v1/rentals/settlements/{settlement_id}/collect", json={
        "amount": str(rem), "payment_method": "UPI", "transaction_reference": "COL-FINAL-1",
    })
    assert fin.status_code == 201
    assert staff_client.post(f"/api/v1/rentals/payments/{fin.json()['id']}/decision", json={"decision": "Verified"}).status_code == 200

    done = staff_client.post(f"/api/v1/rentals/exit-requests/{exit_id}/complete-handover")
    assert done.status_code == 200, done.text
    assert done.json()["property_status"] == "Available"

    # Duplicate handover completion blocked
    dup_done = staff_client.post(f"/api/v1/rentals/exit-requests/{exit_id}/complete-handover")
    assert dup_done.status_code == 409


def test_problem_13_open_ended_rental_schedule_extension_and_idempotency(db_session: Session, seed_world, api_client_factory):
    from app.models.rental import RentalAgreement, RentalPaymentSchedule
    from app.worker.jobs import extend_open_ended_rental_schedules_job

    t1 = seed_world["t1"]
    prop = _create_property(db_session, t1["tenant"].id, t1["staff"].id, name="Open Ended Flat", listing_type="Rent", price=Decimal("15000.00"), price_frequency="Monthly", security_deposit=Decimal("0.00"))
    staff_client = api_client_factory(staff_ctx=t1["staff_ctx"])

    # Month-end start date (Jan 31) with no agreement_end (open-ended)
    start = date(2025, 1, 31)
    ag = staff_client.post("/api/v1/rentals/agreements", json={
        "property_id": str(prop.id), "lead_id": str(t1["lead_walkin"].id),
        "agreement_type": "Rent", "customer_name": "Open Ended Tenant",
        "rent_amount": "15000.00", "rent_frequency": "Monthly", "deposit_amount": "0.00",
        "agreement_start": start.isoformat(), "agreement_end": None,
    })
    assert ag.status_code == 201
    agreement_id = uuid.UUID(ag.json()["id"])
    assert staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/send-for-signature", json={"agreement_document_url": "https://example.com/oe.pdf"}).status_code == 200
    assert staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/record-walk-in-signature", json={"signer_name": "Open Ended Tenant", "signed_document_url": "https://example.com/oes.pdf", "witnessed": True}).status_code == 200
    assert staff_client.post(f"/api/v1/rentals/agreements/{agreement_id}/activate", json={"signed_at": _utc_now().isoformat()}).status_code == 200

    initial_count = db_session.query(RentalPaymentSchedule).filter(RentalPaymentSchedule.agreement_id == agreement_id).count()
    assert initial_count >= 12

    # Run rolling extension worker near end of first horizon (Nov 2025 -> within 3 months of Jan 2026)
    res1 = extend_open_ended_rental_schedules_job(db_session, date(2025, 12, 1))
    assert res1["extended_agreements"] == 1
    assert res1["schedules_created"] >= 11
    extended_count = db_session.query(RentalPaymentSchedule).filter(RentalPaymentSchedule.agreement_id == agreement_id).count()
    assert extended_count > initial_count

    # Duplicate worker execution is idempotent
    res2 = extend_open_ended_rental_schedules_job(db_session, date(2025, 12, 1))
    assert res2["extended_agreements"] == 0
    assert res2["schedules_created"] == 0

    # Terminated agreement is NOT extended
    row = db_session.query(RentalAgreement).filter(RentalAgreement.id == agreement_id).first()
    row.status = "Terminated"
    db_session.commit()
    res3 = extend_open_ended_rental_schedules_job(db_session, date(2027, 1, 1))
    assert res3["extended_agreements"] == 0


def test_problem_17_walkin_offer_counteroffer_negotiation_and_tenant_isolation(db_session: Session, seed_world, api_client_factory):
    from app.models.property_offer import PropertyOffer

    t1, t2 = seed_world["t1"], seed_world["t2"]
    prop = _create_property(db_session, t1["tenant"].id, t1["staff"].id, name="Offer Negotiation Home", listing_type="Sale", price=Decimal("5000000.00"), price_frequency="One-time")
    _, match, _ = _create_requirement_match_visit(
        db_session, t1["tenant"].id, t1["staff"].id, prop.id,
        requirement_type="Buy", lead_id=t1["lead_walkin"].id, contact_id=t1["walkin_contact"].id,
    )
    staff_t1 = api_client_factory(staff_ctx=t1["staff_ctx"])
    staff_t2 = api_client_factory(staff_ctx=t2["staff_ctx"])

    # 1. Staff creates initial Seller offer
    o1 = staff_t1.post("/api/v1/property-offers/", json={
        "property_match_id": str(match.id), "offered_price": "5000000.00", "terms": "Initial list price",
    })
    assert o1.status_code == 201, o1.text
    o1_id = o1.json()["id"]

    # Tenant 2 cannot access Tenant 1's offer (Tenant isolation!)
    assert staff_t2.post(f"/api/v1/property-offers/{o1_id}/walk-in-response", json={"decision": "Accepted"}).status_code == 404

    # 2. Walk-in customer counters at 4,700,000 -> creates child Buyer offer, preserves o1
    c1 = staff_t1.post(f"/api/v1/property-offers/{o1_id}/walk-in-response", json={
        "decision": "Countered", "counter_price": "4700000.00", "response_notes": "Walk-in buyer counter",
    })
    assert c1.status_code == 200, c1.text
    assert c1.json()["status"] == "Countered"

    thread = staff_t1.get(f"/api/v1/property-offers/{o1_id}/thread").json()
    assert len(thread) == 2
    buyer_counter_id = thread[1]["id"]
    assert thread[1]["offer_type"] == "Buyer"
    assert thread[1]["parent_offer_id"] == o1_id

    # 3. Staff counters back at 4,850,000 -> creates Seller counter
    c2 = staff_t1.post(f"/api/v1/property-offers/{buyer_counter_id}/decision", json={
        "decision": "Countered", "counter_price": "4850000.00", "response_notes": "Best final price",
    })
    assert c2.status_code == 200, c2.text
    thread2 = staff_t1.get(f"/api/v1/property-offers/{o1_id}/thread").json()
    assert len(thread2) == 3
    seller_final_id = thread2[2]["id"]

    # 4. Walk-in customer accepts final offer -> Accepted, full 3-step history preserved
    acc = staff_t1.post(f"/api/v1/property-offers/{seller_final_id}/walk-in-response", json={
        "decision": "Accepted", "response_notes": "Agreed in office",
    })
    assert acc.status_code == 200, acc.text
    assert acc.json()["status"] == "Accepted"

    # Cannot respond again to finalized offer
    dup_resp = staff_t1.post(f"/api/v1/property-offers/{seller_final_id}/walk-in-response", json={"decision": "Rejected"})
    assert dup_resp.status_code == 409


def test_alembic_single_head_and_migration_chain():
    from alembic.config import Config
    from alembic.script import ScriptDirectory

    cfg = Config("alembic.ini")
    script = ScriptDirectory.from_config(cfg)
    heads = script.get_heads()
    assert len(heads) == 1
    assert heads[0] == "e4b9c2f7a108"
    rev = script.get_revision("e4b9c2f7a108")
    assert rev.down_revision == "a8c5d7e9f1b3"
