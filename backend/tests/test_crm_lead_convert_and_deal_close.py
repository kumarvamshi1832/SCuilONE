"""Tests for one-click Lead conversion (POST /api/v1/leads/{lead_id}/convert)
and Deal lost_reason / closed_at lifecycle tracking.
"""
from __future__ import annotations

import uuid


def test_lead_one_click_convert_and_deal_lost_reason_closed_at(db_session, seed_world, api_client_factory):
    t1 = seed_world["t1"]
    client = api_client_factory(staff_ctx=t1["staff_ctx"])

    # 1. Seed a fresh Lead
    from app.models.lead import Lead

    lead_obj = Lead(
        id=uuid.uuid4(),
        tenant_id=t1["tenant"].id,
        created_by=t1["staff"].id,
        assigned_to=t1["staff"].id,
        full_name="Karthik Reddy",
        email=f"karthik.{uuid.uuid4().hex[:6]}@buyer.com",
        phone="+919848044556",
        source="Website",
        status="Qualified",
        notes="Looking for 3BHK in Gachibowli",
    )
    db_session.add(lead_obj)
    db_session.commit()
    lead_id = str(lead_obj.id)

    # 2. One-click convert Lead -> Account + Contact + Deal
    conv_res = client.post(
        f"/api/v1/leads/{lead_id}/convert",
        json={
            "create_account": True,
            "account_name": "Karthik Family Holdings",
            "create_deal": True,
            "deal_name": "Karthik 3BHK Gachibowli",
            "deal_amount": 8500000.0,
            "deal_stage": "Negotiation",
        },
    )
    assert conv_res.status_code == 200, conv_res.text
    body = conv_res.json()
    assert body["lead_status"] == "Converted"
    assert body["contact_created"] is True
    assert body["account_created"] is True
    assert body["deal_created"] is True
    deal_id = body["deal_id"]

    # Duplicate conversion must fail with 409
    dup_res = client.post(f"/api/v1/leads/{lead_id}/convert", json={"create_deal": False})
    assert dup_res.status_code == 409

    # 3. Mark Deal as Closed Lost with lost_reason -> closed_at auto-populated
    close_res = client.put(
        f"/api/v1/deals/{deal_id}",
        json={"stage": "Closed Lost", "lost_reason": "Budget exceeded client limit"},
    )
    assert close_res.status_code == 200, close_res.text
    closed = close_res.json()
    assert closed["stage"] == "Closed Lost"
    assert closed["lost_reason"] == "Budget exceeded client limit"
    assert closed["closed_at"] is not None

    # 4. Reopen Deal -> closed_at and lost_reason automatically cleared
    reopen_res = client.put(
        f"/api/v1/deals/{deal_id}",
        json={"stage": "Negotiation"},
    )
    assert reopen_res.status_code == 200, reopen_res.text
    reopened = reopen_res.json()
    assert reopened["stage"] == "Negotiation"
    assert reopened["closed_at"] is None
    assert reopened["lost_reason"] is None
