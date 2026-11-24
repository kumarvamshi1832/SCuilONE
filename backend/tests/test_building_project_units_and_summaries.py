"""Tests for shell unit generation (POST /api/v1/buildings/{id}/generate-units),
phase-wise release (POST /api/v1/buildings/{id}/release-for-sale),
and live Building & Project inventory + verified earnings summaries.
"""
from __future__ import annotations

import uuid
from decimal import Decimal

from app.models.booking import Booking
from app.models.payment import Payment


def test_building_generate_units_release_and_project_revenue_summary(db_session, seed_world, api_client_factory):
    t1 = seed_world["t1"]
    client = api_client_factory(staff_ctx=t1["staff_ctx"])

    # 1. Create Project (Under Construction)
    proj_res = client.post(
        "/api/v1/projects/",
        json={
            "name": "My-Home Skyview Phase 1",
            "developer_name": "My-Home Developers",
            "project_type": "Residential",
            "address": "Kokapet, Hyderabad",
            "city": "Hyderabad",
            "state": "Telangana",
            "construction_status": "Under Construction",
        },
    )
    assert proj_res.status_code in (200, 201), proj_res.text
    project_id = proj_res.json()["id"]

    # 2. Create Building (Tower A, 2 floors)
    bldg_res = client.post(
        "/api/v1/buildings/",
        json={
            "project_id": project_id,
            "name": "Tower A",
            "building_code": "A",
            "building_type": "Residential Tower",
            "total_floors": 2,
            "total_units": 0,
            "construction_status": "Under Construction",
        },
    )
    assert bldg_res.status_code in (200, 201), bldg_res.text
    building_id = bldg_res.json()["id"]

    # 3. Generate shell units A-101, A-102, A-201, A-202 (all Inactive, price 0)
    gen_res = client.post(
        f"/api/v1/buildings/{building_id}/generate-units",
        json={"start_floor": 1, "end_floor": 2, "units_per_floor": 2, "prefix": "A-"},
    )
    assert gen_res.status_code == 201, gen_res.text
    gen = gen_res.json()
    assert gen["created_count"] == 4
    units = {u["unit_number"]: u["id"] for u in gen["created_units"]}
    assert set(units.keys()) == {"A-101", "A-102", "A-201", "A-202"}

    # 4. Manually enter room details & prices for A-101 (3BHK) and A-102 (4BHK); leave A-201 & A-202 unpriced
    u1 = client.patch(
        f"/api/v1/properties/{units['A-101']}",
        json={"bedrooms": 3, "bathrooms": 3, "area": 1650, "price": 8500000},
    )
    assert u1.status_code == 200, u1.text
    u2 = client.patch(
        f"/api/v1/properties/{units['A-102']}",
        json={"bedrooms": 4, "bathrooms": 4, "area": 2200, "price": 11500000},
    )
    assert u2.status_code == 200, u2.text

    # 5. Release building for sale -> A-101 & A-102 become Available; unpriced A-201 & A-202 stay Inactive
    rel_res = client.post(
        f"/api/v1/buildings/{building_id}/release-for-sale",
        json={"mark_building_completed": True},
    )
    assert rel_res.status_code == 200, rel_res.text
    rel = rel_res.json()
    assert rel["released_count"] == 2
    assert rel["skipped_unpriced_count"] == 2
    assert rel["construction_status"] == "Completed"

    # 6. Seed a Confirmed Booking + Verified Payment (5,00,000) on A-101
    booking = Booking(
        id=uuid.uuid4(),
        tenant_id=t1["tenant"].id,
        property_id=uuid.UUID(units["A-101"]),
        buyer_name="Priya Buyer",
        buyer_email="priya.tower@buyer.com",
        booking_amount=Decimal("500000.00"),
        agreed_price=Decimal("8500000.00"),
        status="Confirmed",
    )
    db_session.add(booking)
    db_session.flush()
    payment = Payment(
        id=uuid.uuid4(),
        tenant_id=t1["tenant"].id,
        booking_id=booking.id,
        amount=Decimal("500000.00"),
        payment_method="NEFT",
        transaction_reference="UTR-TOWERA-101",
        status="Verified",
    )
    db_session.add(payment)
    db_session.commit()

    # 7. Verify live Building Summary & Project Summary rollups
    bs = client.get(f"/api/v1/buildings/{building_id}/summary")
    assert bs.status_code == 200, bs.text
    bdata = bs.json()
    assert bdata["total_units"] == 4
    assert bdata["available"] == 2
    assert bdata["inactive"] == 2
    assert bdata["total_agreed_value"] == "8500000.00"
    assert bdata["total_earned"] == "500000.00"

    ps = client.get(f"/api/v1/projects/{project_id}/summary")
    assert ps.status_code == 200, ps.text
    pdata = ps.json()
    assert pdata["actual_buildings"] == 1
    assert pdata["actual_units"] == 4
    assert pdata["total_earned"] == "500000.00"


def test_project_completion_blocked_until_all_buildings_and_units_ready(db_session, seed_world, api_client_factory):
    t1 = seed_world["t1"]
    client = api_client_factory(staff_ctx=t1["staff_ctx"])

    proj = client.post(
        "/api/v1/projects/",
        json={
            "name": "Guarded Towers",
            "project_type": "Residential",
            "address": "Narsingi, Hyderabad",
            "city": "Hyderabad",
            "state": "Telangana",
            "construction_status": "Under Construction",
        },
    ).json()
    pid = proj["id"]

    b1 = client.post(
        "/api/v1/buildings/",
        json={"project_id": pid, "name": "Tower 1", "building_code": "T1", "building_type": "Residential Tower", "total_floors": 1, "total_units": 0, "construction_status": "Completed"},
    ).json()
    b2 = client.post(
        "/api/v1/buildings/",
        json={"project_id": pid, "name": "Tower 2", "building_code": "T2", "building_type": "Residential Tower", "total_floors": 1, "total_units": 0, "construction_status": "Under Construction"},
    ).json()

    # 1. Blocked because Tower 2 is still Under Construction
    r_block1 = client.patch(f"/api/v1/projects/{pid}", json={"construction_status": "Completed"})
    assert r_block1.status_code == 409 and "Tower 2" in r_block1.text

    # 2. Generate a shell unit in Tower 2, mark Tower 2 Completed WITHOUT releasing the Inactive unit -> still blocked!
    gen = client.post(
        f"/api/v1/buildings/{b2['id']}/generate-units",
        json={"start_floor": 1, "end_floor": 1, "units_per_floor": 1, "prefix": "T2-"},
    ).json()
    unit_id = gen["created_units"][0]["id"]
    client.patch(f"/api/v1/buildings/{b2['id']}", json={"construction_status": "Completed"})

    r_block2 = client.patch(f"/api/v1/projects/{pid}", json={"construction_status": "Completed"})
    assert r_block2.status_code == 409 and "Inactive" in r_block2.text

    # 3. Price & release Tower 2 unit -> now Project can be marked Completed!
    client.patch(f"/api/v1/properties/{unit_id}", json={"bedrooms": 3, "area": 1600, "price": 8000000})
    client.post(f"/api/v1/buildings/{b2['id']}/release-for-sale", json={"mark_building_completed": True})

    r_ok = client.patch(f"/api/v1/projects/{pid}", json={"construction_status": "Completed", "status": "Completed"})
    assert r_ok.status_code == 200, r_ok.text
    assert r_ok.json()["construction_status"] == "Completed"
