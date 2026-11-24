"""Tests for mounted Lead Scoring endpoints (with Real Estate SiteVisit + PropertyOffer intent signals),
daily lead-score worker job, and agency SiteVisit conflict-check guard.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timedelta
from decimal import Decimal

from app.models.buyer_requirement import BuyerRequirement
from app.models.property import Property
from app.models.property_match import PropertyMatch
from app.models.property_offer import PropertyOffer
from app.models.site_visit import SiteVisit
from app.worker.jobs import recalculate_lead_scores_job


def test_lead_scoring_endpoints_real_estate_signals_and_worker(db_session, seed_world, api_client_factory):
    t1 = seed_world["t1"]
    client = api_client_factory(staff_ctx=t1["staff_ctx"])

    # Create a Lead -> SQLAlchemy before_insert listener auto-scores profile points on save
    from app.models.lead import Lead

    lead_obj = Lead(
        id=uuid.uuid4(),
        tenant_id=t1["tenant"].id,
        created_by=t1["staff"].id,
        assigned_to=t1["staff"].id,
        full_name="Ananya Buyer",
        email=f"ananya.{uuid.uuid4().hex[:6]}@buyer.com",
        phone="+919848066778",
        source="Referral",
        status="Qualified",
        notes="Interested in ready-to-move 3BHK in Gachibowli",
    )
    db_session.add(lead_obj)
    db_session.commit()
    lead_id = lead_obj.id

    # Seed Property + BuyerRequirement + PropertyMatch + Completed SiteVisit + PropertyOffer
    prop = Property(
        id=uuid.uuid4(),
        tenant_id=t1["tenant"].id,
        name="Scoring Tower 3BHK",
        property_type="Apartment",
        listing_type="Sale",
        address="Gachibowli",
        city="Hyderabad",
        state="Telangana",
        country="India",
        price=Decimal("8500000.00"),
        status="Available",
    )
    req = BuyerRequirement(
        id=uuid.uuid4(),
        tenant_id=t1["tenant"].id,
        lead_id=lead_id,
        contact_id=t1["contact"].id,
        requirement_type="Buy",
        property_type="Apartment",
        preferred_city="Hyderabad",
        min_budget=Decimal("7000000.00"),
        max_budget=Decimal("9500000.00"),
        status="Active",
    )
    match = PropertyMatch(
        id=uuid.uuid4(),
        tenant_id=t1["tenant"].id,
        buyer_requirement_id=req.id,
        property_id=prop.id,
        status="Shortlisted",
    )
    now = datetime.utcnow()
    visit = SiteVisit(
        id=uuid.uuid4(),
        tenant_id=t1["tenant"].id,
        property_match_id=match.id,
        scheduled_start=now - timedelta(days=1),
        scheduled_end=now - timedelta(days=1) + timedelta(hours=1),
        status="Completed",
    )
    offer = PropertyOffer(
        id=uuid.uuid4(),
        tenant_id=t1["tenant"].id,
        property_match_id=match.id,
        offered_price=Decimal("8300000.00"),
        price_frequency="One-Time",
        offer_type="Buyer",
        status="Submitted",
    )
    db_session.add_all([prop, req, match, visit, offer])
    db_session.commit()

    # Recalculate via HTTP endpoint -> should be Hot with both Real Estate intent signals
    rec = client.post(f"/api/v1/lead-scoring/leads/{lead_id}/recalculate")
    assert rec.status_code == 200, rec.text
    data = rec.json()
    assert data["score_label"] == "Hot"
    assert data["breakdown"]["engagement"]["site_visit_completed"] == 15
    assert data["breakdown"]["engagement"]["property_offer_submitted"] == 20

    # Leaderboard endpoint returns Ananya
    lb = client.get("/api/v1/lead-scoring/leaderboard?label=Hot")
    assert lb.status_code == 200, lb.text
    assert any(row["id"] == str(lead_id) for row in lb.json())

    # Worker job runs cleanly
    job_res = recalculate_lead_scores_job(db_session)
    assert job_res["leads_scored"] >= 1


def test_agency_site_visits_with_null_match_do_not_false_conflict(db_session, seed_world, api_client_factory):
    t1 = seed_world["t1"]
    client = api_client_factory(staff_ctx=t1["staff_ctx"])

    start = datetime.utcnow() + timedelta(days=3)
    end = start + timedelta(hours=1)
    v1 = SiteVisit(
        id=uuid.uuid4(),
        tenant_id=t1["tenant"].id,
        property_match_id=None,
        scheduled_start=start,
        scheduled_end=end,
        status="Scheduled",
    )
    v2 = SiteVisit(
        id=uuid.uuid4(),
        tenant_id=t1["tenant"].id,
        property_match_id=None,
        scheduled_start=start,
        scheduled_end=end,
        status="Scheduled",
    )
    db_session.add_all([v1, v2])
    db_session.commit()

    # Updating v1 schedule when v2 also has property_match_id=None must NOT raise 409
    res = client.patch(
        f"/api/v1/site-visits/{v1.id}",
        json={
            "scheduled_start": (start + timedelta(minutes=15)).isoformat(),
            "scheduled_end": (end + timedelta(minutes=15)).isoformat(),
        },
    )
    assert res.status_code == 200, res.text
