"""Complete HTTP Endpoint Test Suite for Phases 1–14 (All 67/67 New FastAPI Endpoints).

Exercises every single route registered across:
- app/routes/agency_collaboration.py (30 endpoints — Phases 1–4)
- app/routes/agency_workflow.py      (22 endpoints — Phases 5–10)
- app/routes/finance_portals.py      (15 endpoints — Phases 11–13)

Runs through FastAPI TestClient with real JWT Bearer tokens (agency_external, paid staff,
owner portal, customer portal) and asserts 67/67 route coverage at the end of the suite.
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.core import dependencies as core_deps
from app.core import platform_rbac
from app.main import app
from app.models.agency import RealEstateBusinessProfile
from app.models.property import Property
from app.models.rental import RentalAgreement
from app.models.tenant import Tenant
from app.routes import customer_portal as portal_route


# Tracks every (METHOD, route_path_template) actually exercised over HTTP in this module.
_EXERCISED_ROUTES: set[tuple[str, str]] = set()


def _hit(client, method: str, path: str, route_template: str, **kwargs):
    """Send an HTTP request and record the route template for the 67/67 coverage check."""
    _EXERCISED_ROUTES.add((method.upper(), route_template))
    return client.request(method.upper(), path, **kwargs)


def _make_property(db, tenant_id, name: str, listing_type: str = "Sale", city: str = "Hyderabad") -> Property:
    prop = Property(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        name=name,
        property_type="Apartment",
        listing_type=listing_type,
        address=f"{name}, Gachibowli",
        city=city,
        state="Telangana",
        country="India",
        bedrooms=3,
        area=1850.0,
        price=Decimal("8500000.00") if listing_type == "Sale" else Decimal("25000.00"),
        status="Available",
    )
    db.add(prop)
    db.flush()
    return prop


def _bootstrap_active_connection_http(db_session, api_client_factory, seed_world, *, email_prefix: str):
    """Helper using real HTTP endpoints to invite, onboard (free_external), sign, and activate a connection."""
    t1 = seed_world["t1"]
    t1["tenant"].business_type = "real_estate_company"
    db_session.flush()

    company_client = api_client_factory(staff_ctx=t1["staff_ctx"])
    anon_client = api_client_factory()

    sale_prop = _make_property(db_session, t1["tenant"].id, f"{email_prefix} Skyview Sale", "Sale")
    rent_prop = _make_property(db_session, t1["tenant"].id, f"{email_prefix} Garden Rent", "Rent")
    lease_prop = _make_property(db_session, t1["tenant"].id, f"{email_prefix} Corporate Lease", "Lease")
    db_session.commit()

    agency_email = f"{email_prefix}.{uuid.uuid4().hex[:6]}@agency-http.com"
    inv_res = company_client.post(
        "/api/v1/company/agencies/invitations",
        json={
            "agency_name": f"{email_prefix} Realty Partners",
            "contact_name": "Arjun Broker",
            "email": agency_email,
            "phone": "+919848011223",
            "can_sale": True,
            "can_rent": True,
            "can_lease": True,
            "sharing_scope": "all_eligible",
            "commission_terms": {
                "sale": {"structure": "percentage", "value": "2.00", "payer": "company"},
                "rent": {"structure": "one_month_rent", "value": "1.00", "payer": "company"},
                "lease": {"structure": "percentage", "value": "5.00", "payer": "company"},
            },
            "agreement_text": "Standard multi-transaction agency agreement.",
        },
    )
    assert inv_res.status_code == 201, inv_res.text
    inv_token = inv_res.json()["invitation_token"]

    onb_res = anon_client.post(
        "/api/v1/agency-invitations/onboard",
        json={
            "token": inv_token,
            "onboarding_choice": "free_external",
            "password": "AgencyPassword!1234",
            "full_name": "Arjun Broker",
            "city": "Hyderabad",
            "state": "Telangana",
        },
    )
    assert onb_res.status_code == 200, onb_res.text
    onb_data = onb_res.json()
    conn_id = onb_data["connection_id"]
    agency_token = onb_data["auth"]["access_token"]
    agency_headers = {"Authorization": f"Bearer {agency_token}"}

    # Dual sign + activate over HTTP
    r1 = company_client.post(
        f"/api/v1/company/agency-connections/{conn_id}/sign",
        json={"signature_name": "Company Director", "accepted_terms": True},
    )
    assert r1.status_code == 200, r1.text

    r2 = anon_client.post(
        f"/api/v1/agency/connections/{conn_id}/sign",
        json={"signature_name": "Arjun Broker", "accepted_terms": True},
        headers=agency_headers,
    )
    assert r2.status_code == 200, r2.text

    r3 = company_client.post(f"/api/v1/company/agency-connections/{conn_id}/activate")
    assert r3.status_code == 200, r3.text
    assert r3.json()["status"] == "Active"

    return {
        "company_client": company_client,
        "anon_client": anon_client,
        "agency_headers": agency_headers,
        "agency_email": agency_email,
        "agency_id": onb_data["agency_id"],
        "conn_id": conn_id,
        "sale_prop": sale_prop,
        "rent_prop": rent_prop,
        "lease_prop": lease_prop,
    }


def test_bundle1_all_30_endpoints_http(db_session, seed_world, api_client_factory):
    """Phases 1–4: Exercises all 30 HTTP endpoints in app/routes/agency_collaboration.py."""
    t1, t2 = seed_world["t1"], seed_world["t2"]
    t1["tenant"].business_type = "real_estate_company"
    t2["tenant"].business_type = "real_estate_company"
    prop1 = _make_property(db_session, t1["tenant"].id, "B1 Tower A", "Sale")
    prop2 = _make_property(db_session, t1["tenant"].id, "B1 Tower B", "Sale")

    # Separate clean Real Estate tenant for guarded business_type conversion endpoint (#3)
    convertible_tenant = Tenant(
        id=uuid.uuid4(),
        name="Convertible Realty Pvt Ltd",
        industry="Real Estate",
        business_type="real_estate_company",
        status="Active",
    )
    db_session.add(convertible_tenant)
    db_session.add(
        RealEstateBusinessProfile(
            tenant_id=convertible_tenant.id,
            business_type="real_estate_company",
            legal_name="Convertible Realty Pvt Ltd",
            display_name="Convertible Realty",
        )
    )
    db_session.commit()

    company1 = api_client_factory(staff_ctx=t1["staff_ctx"])
    company2 = api_client_factory(staff_ctx=t2["staff_ctx"])
    anon = api_client_factory()

    # 1. GET /api/v1/real-estate/business-profile
    res = _hit(company1, "GET", "/api/v1/real-estate/business-profile", "/api/v1/real-estate/business-profile")
    assert res.status_code == 200, res.text
    assert res.json()["business_type"] == "real_estate_company"

    # 2. PATCH /api/v1/real-estate/business-profile
    res = _hit(
        company1,
        "PATCH",
        "/api/v1/real-estate/business-profile",
        "/api/v1/real-estate/business-profile",
        json={"display_name": "Alpha Estates Updated", "city": "Hyderabad", "operating_cities": ["Hyderabad"]},
    )
    assert res.status_code == 200, res.text
    assert res.json()["display_name"] == "Alpha Estates Updated"

    # 3. POST /api/v1/platform/tenants/{tenant_id}/convert-business-type
    def _override_db():
        yield db_session

    app.dependency_overrides.clear()
    app.dependency_overrides[core_deps.get_db] = _override_db
    app.dependency_overrides[core_deps.require_active_user] = lambda: t1["staff_ctx"]
    app.dependency_overrides[platform_rbac.require_platform_employee] = lambda: {
        "user_id": str(t1["staff"].id),
        "role": "Platform Super Admin",
        "is_platform_owner": True,
    }
    platform_client = TestClient(app)
    res = _hit(
        platform_client,
        "POST",
        f"/api/v1/platform/tenants/{convertible_tenant.id}/convert-business-type",
        "/api/v1/platform/tenants/{tenant_id}/convert-business-type",
        json={"target_business_type": "real_estate_agency", "reason": "Verified RERA brokerage registration approved."},
    )
    assert res.status_code == 200, res.text
    assert res.json()["business_type"] == "real_estate_agency"
    app.dependency_overrides.clear()

    # 6. GET /api/v1/company/agencies/lookup (before onboarding -> found=False)
    agency_email = f"b1.{uuid.uuid4().hex[:6]}@external-agency.com"
    res = _hit(
        company1,
        "GET",
        f"/api/v1/company/agencies/lookup?email={agency_email}",
        "/api/v1/company/agencies/lookup",
    )
    assert res.status_code == 200, res.text
    assert res.json()["found"] is False

    # 7. POST /api/v1/company/agencies/invitations
    res = _hit(
        company1,
        "POST",
        "/api/v1/company/agencies/invitations",
        "/api/v1/company/agencies/invitations",
        json={
            "agency_name": "Deccan Prime Brokers",
            "contact_name": "Meera Nair",
            "email": agency_email,
            "phone": "+919848099881",
            "can_sale": True,
            "can_rent": False,
            "can_lease": False,
            "sharing_scope": "selected_properties",
            "property_ids": [str(prop1.id)],
            "commission_terms": {"sale": {"structure": "percentage", "value": "2.00", "payer": "company"}},
            "agreement_text": "Initial v1 agreement.",
        },
    )
    assert res.status_code == 201, res.text
    inv_token = res.json()["invitation_token"]

    # 8. GET /api/v1/company/agencies/invitations
    res = _hit(company1, "GET", "/api/v1/company/agencies/invitations", "/api/v1/company/agencies/invitations")
    assert res.status_code == 200, res.text
    assert len(res.json()["items"]) >= 1

    # 9. GET /api/v1/agency-invitations/preview/{token}
    res = _hit(
        anon,
        "GET",
        f"/api/v1/agency-invitations/preview/{inv_token}",
        "/api/v1/agency-invitations/preview/{token}",
    )
    assert res.status_code == 200, res.text
    assert res.json()["invited_agency_name"] == "Deccan Prime Brokers"

    # 10. POST /api/v1/agency-invitations/onboard
    res = _hit(
        anon,
        "POST",
        "/api/v1/agency-invitations/onboard",
        "/api/v1/agency-invitations/onboard",
        json={
            "token": inv_token,
            "onboarding_choice": "free_external",
            "password": "StrongAgencyPass!2026",
            "full_name": "Meera Nair",
            "city": "Hyderabad",
            "state": "Telangana",
        },
    )
    assert res.status_code == 200, res.text
    conn1_id = res.json()["connection_id"]

    # 4. POST /api/v1/agency-auth/login (re-authenticate via login endpoint)
    res = _hit(
        anon,
        "POST",
        "/api/v1/agency-auth/login",
        "/api/v1/agency-auth/login",
        json={"email": agency_email, "password": "StrongAgencyPass!2026"},
    )
    assert res.status_code == 200, res.text
    agency_headers = {"Authorization": f"Bearer {res.json()['access_token']}"}

    # 5. GET /api/v1/agency-auth/me
    res = _hit(anon, "GET", "/api/v1/agency-auth/me", "/api/v1/agency-auth/me", headers=agency_headers)
    assert res.status_code == 200, res.text
    assert res.json()["operating_mode"] == "free_external"

    # Lookup now finds the existing agency
    res = company1.get(f"/api/v1/company/agencies/lookup?email={agency_email}")
    assert res.status_code == 200 and res.json()["found"] is True

    # 11. GET /api/v1/agency/companies/search
    res = _hit(
        anon,
        "GET",
        "/api/v1/agency/companies/search",
        "/api/v1/agency/companies/search",
        headers=agency_headers,
    )
    assert res.status_code == 200, res.text
    assert len(res.json()["items"]) >= 2

    # 12. POST /api/v1/agency/connections/request (Agency requests connection to Company 2)
    res = _hit(
        anon,
        "POST",
        "/api/v1/agency/connections/request",
        "/api/v1/agency/connections/request",
        headers=agency_headers,
        json={
            "company_tenant_id": str(t2["tenant"].id),
            "can_sale": True,
            "can_rent": True,
            "can_lease": False,
            "sharing_scope": "all_eligible",
            "commission_terms": {"sale": {"structure": "percentage", "value": "2.50", "payer": "company"}},
            "notes": "Requesting partnership with Company 2.",
        },
    )
    assert res.status_code == 201, res.text
    conn2_id = res.json()["id"]

    # 13. GET /api/v1/company/agency-connections
    res = _hit(company1, "GET", "/api/v1/company/agency-connections", "/api/v1/company/agency-connections")
    assert res.status_code == 200 and len(res.json()["items"]) >= 1

    # 14. GET /api/v1/agency/connections
    res = _hit(anon, "GET", "/api/v1/agency/connections", "/api/v1/agency/connections", headers=agency_headers)
    assert res.status_code == 200 and len(res.json()["items"]) >= 2

    # 15 & 16. List agreement versions (Company & Agency)
    res = _hit(
        company1,
        "GET",
        f"/api/v1/company/agency-connections/{conn1_id}/agreements",
        "/api/v1/company/agency-connections/{connection_id}/agreements",
    )
    assert res.status_code == 200 and len(res.json()["items"]) == 1

    res = _hit(
        anon,
        "GET",
        f"/api/v1/agency/connections/{conn1_id}/agreements",
        "/api/v1/agency/connections/{connection_id}/agreements",
        headers=agency_headers,
    )
    assert res.status_code == 200 and len(res.json()["items"]) == 1

    # 18. POST /api/v1/agency/connections/{connection_id}/counterpropose (v2)
    res = _hit(
        anon,
        "POST",
        f"/api/v1/agency/connections/{conn1_id}/counterpropose",
        "/api/v1/agency/connections/{connection_id}/counterpropose",
        headers=agency_headers,
        json={
            "can_sale": True,
            "can_rent": True,
            "can_lease": False,
            "sharing_scope": "selected_properties",
            "commission_terms": {"sale": {"structure": "percentage", "value": "2.50", "payer": "company"}},
            "change_summary": "Agency requests 2.5% sale commission and Rent permission.",
        },
    )
    assert res.status_code == 201 and res.json()["version_number"] == 2

    # 17. POST /api/v1/company/agency-connections/{connection_id}/counterpropose (v3)
    res = _hit(
        company1,
        "POST",
        f"/api/v1/company/agency-connections/{conn1_id}/counterpropose",
        "/api/v1/company/agency-connections/{connection_id}/counterpropose",
        json={
            "can_sale": True,
            "can_rent": True,
            "can_lease": False,
            "sharing_scope": "selected_properties",
            "commission_terms": {"sale": {"structure": "percentage", "value": "2.25", "payer": "company"}},
            "change_summary": "Company agrees to 2.25% sale commission.",
        },
    )
    assert res.status_code == 201 and res.json()["version_number"] == 3

    # 19 & 20. Dual sign v3 (Company & Agency)
    res = _hit(
        company1,
        "POST",
        f"/api/v1/company/agency-connections/{conn1_id}/sign",
        "/api/v1/company/agency-connections/{connection_id}/sign",
        json={"signature_name": "Company CEO", "accepted_terms": True},
    )
    assert res.status_code == 200 and res.json()["agreement_version"]["company_signed"] is True

    res = _hit(
        anon,
        "POST",
        f"/api/v1/agency/connections/{conn1_id}/sign",
        "/api/v1/agency/connections/{connection_id}/sign",
        headers=agency_headers,
        json={"signature_name": "Meera Nair", "accepted_terms": True},
    )
    assert res.status_code == 200 and res.json()["agreement_version"]["agency_signed"] is True

    # 21. POST /api/v1/company/agency-connections/{connection_id}/activate
    res = _hit(
        company1,
        "POST",
        f"/api/v1/company/agency-connections/{conn1_id}/activate",
        "/api/v1/company/agency-connections/{connection_id}/activate",
    )
    assert res.status_code == 200 and res.json()["status"] == "Active"

    # 27. PUT /api/v1/company/agency-connections/{connection_id}/property-access
    res = _hit(
        company1,
        "PUT",
        f"/api/v1/company/agency-connections/{conn1_id}/property-access",
        "/api/v1/company/agency-connections/{connection_id}/property-access",
        json={"sharing_scope": "selected_properties", "grant_property_ids": [str(prop1.id), str(prop2.id)], "revoke_property_ids": [str(prop2.id)]},
    )
    assert res.status_code == 200, res.text

    # 28. GET /api/v1/agency/shared-properties
    res = _hit(
        anon,
        "GET",
        "/api/v1/agency/shared-properties",
        "/api/v1/agency/shared-properties",
        headers=agency_headers,
    )
    assert res.status_code == 200, res.text
    assert res.json()["total"] == 1
    assert res.json()["items"][0]["property_id"] == str(prop1.id)

    # 29 & 30. GET /api/v1/agency/notifications + POST mark read
    res = _hit(
        anon,
        "GET",
        "/api/v1/agency/notifications",
        "/api/v1/agency/notifications",
        headers=agency_headers,
    )
    assert res.status_code == 200, res.text
    notifs = res.json()["items"]
    assert len(notifs) >= 1
    notif_id = notifs[0]["id"]

    res = _hit(
        anon,
        "POST",
        f"/api/v1/agency/notifications/{notif_id}/read",
        "/api/v1/agency/notifications/{notification_id}/read",
        headers=agency_headers,
    )
    assert res.status_code == 200, res.text

    # 22, 23, 24. Suspend -> Resume -> Terminate on conn1
    res = _hit(
        company1,
        "POST",
        f"/api/v1/company/agency-connections/{conn1_id}/suspend",
        "/api/v1/company/agency-connections/{connection_id}/suspend",
        json={"reason": "Temporary compliance audit pause."},
    )
    assert res.status_code == 200 and res.json()["status"] == "Suspended"

    res = _hit(
        company1,
        "POST",
        f"/api/v1/company/agency-connections/{conn1_id}/resume",
        "/api/v1/company/agency-connections/{connection_id}/resume",
        json={"reason": "Compliance audit cleared."},
    )
    assert res.status_code == 200 and res.json()["status"] == "Active"

    res = _hit(
        company1,
        "POST",
        f"/api/v1/company/agency-connections/{conn1_id}/terminate",
        "/api/v1/company/agency-connections/{connection_id}/terminate",
        json={"reason": "End of seasonal mandate.", "post_termination_policy": "preserve_active_transactions"},
    )
    assert res.status_code == 200 and res.json()["status"] == "Terminated"

    # 25. POST /api/v1/company/agency-connections/{connection_id}/reject (Company 2 rejects conn2)
    res = _hit(
        company2,
        "POST",
        f"/api/v1/company/agency-connections/{conn2_id}/reject",
        "/api/v1/company/agency-connections/{connection_id}/reject",
        json={"reason": "Not onboarding new agencies this quarter."},
    )
    assert res.status_code == 200 and res.json()["status"] == "Rejected"

    # 26. POST /api/v1/agency/connections/{connection_id}/reject (Company 2 invites existing agency, agency rejects)
    inv2 = company2.post(
        "/api/v1/company/agencies/invitations",
        json={
            "agency_name": "Deccan Prime Brokers",
            "contact_name": "Meera Nair",
            "email": agency_email,
            "phone": "+919848099881",
            "can_sale": True,
            "sharing_scope": "all_eligible",
        },
    )
    assert inv2.status_code == 201 and inv2.json()["existing_agency_detected"] is True
    conn3_id = inv2.json()["connection_id"]
    res = _hit(
        anon,
        "POST",
        f"/api/v1/agency/connections/{conn3_id}/reject",
        "/api/v1/agency/connections/{connection_id}/reject",
        headers=agency_headers,
        json={"reason": "Agency declined revised terms."},
    )
    assert res.status_code == 200 and res.json()["status"] == "Rejected"


def test_bundle2_all_22_endpoints_http(db_session, seed_world, api_client_factory):
    """Phases 5–10: Exercises all 22 HTTP endpoints in app/routes/agency_workflow.py."""
    ctx = _bootstrap_active_connection_http(db_session, api_client_factory, seed_world, email_prefix="b2")
    company = ctx["company_client"]
    anon = ctx["anon_client"]
    ah = ctx["agency_headers"]
    conn_id = ctx["conn_id"]
    sale_prop = ctx["sale_prop"]

    # 31 & 32. Agency & Company dashboard summaries
    res = _hit(anon, "GET", "/api/v1/agency-dashboard/summary", "/api/v1/agency-dashboard/summary", headers=ah)
    assert res.status_code == 200, res.text
    res = _hit(company, "GET", "/api/v1/company-dashboard/summary", "/api/v1/company-dashboard/summary")
    assert res.status_code == 200, res.text

    # 33. POST /api/v1/agency/team-members
    res = _hit(
        anon,
        "POST",
        "/api/v1/agency/team-members",
        "/api/v1/agency/team-members",
        headers=ah,
        json={
            "full_name": "Kiran Agent",
            "email": f"agent.{uuid.uuid4().hex[:6]}@agency-http.com",
            "phone": "+919848011999",
            "password": "AgentPassword!1234",
            "role": "agency_agent",
        },
    )
    assert res.status_code == 201, res.text

    # 34 & 35. POST & GET /api/v1/agency/leads
    res = _hit(
        anon,
        "POST",
        "/api/v1/agency/leads",
        "/api/v1/agency/leads",
        headers=ah,
        json={
            "full_name": "Priya Buyer",
            "email": f"priya.{uuid.uuid4().hex[:6]}@buyer.com",
            "phone": "+919848022334",
            "source": "Referral",
            "customer_consent_given": True,
        },
    )
    assert res.status_code == 201, res.text
    lead_id = res.json()["id"]

    res = _hit(anon, "GET", "/api/v1/agency/leads", "/api/v1/agency/leads", headers=ah)
    assert res.status_code == 200 and len(res.json()["items"]) == 1

    # 36 & 37. POST /api/v1/agency/requirements + GET cross-company matches
    res = _hit(
        anon,
        "POST",
        "/api/v1/agency/requirements",
        "/api/v1/agency/requirements",
        headers=ah,
        json={
            "agency_lead_id": lead_id,
            "transaction_type": "Sale",
            "city": "Hyderabad",
            "bedrooms": 3,
            "min_budget": "7000000.00",
            "max_budget": "9500000.00",
        },
    )
    assert res.status_code == 201, res.text
    req_id = res.json()["id"]

    res = _hit(
        anon,
        "GET",
        f"/api/v1/agency/requirements/{req_id}/matches",
        "/api/v1/agency/requirements/{requirement_id}/matches",
        headers=ah,
    )
    assert res.status_code == 200 and res.json()["total"] >= 1

    # 38. POST /api/v1/agency/shortlists
    res = _hit(
        anon,
        "POST",
        "/api/v1/agency/shortlists",
        "/api/v1/agency/shortlists",
        headers=ah,
        json={"agency_requirement_id": req_id, "connection_id": conn_id, "property_id": str(sale_prop.id)},
    )
    assert res.status_code == 201, res.text

    # 39, 40, 41, 42. Site visit request -> company decision -> agency feedback -> company feedback
    start = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=2)
    end = start + timedelta(hours=1)
    res = _hit(
        anon,
        "POST",
        "/api/v1/agency/site-visits/request",
        "/api/v1/agency/site-visits/request",
        headers=ah,
        json={
            "connection_id": conn_id,
            "property_id": str(sale_prop.id),
            "agency_lead_id": lead_id,
            "scheduled_start": start.isoformat(),
            "scheduled_end": end.isoformat(),
            "notes": "Buyer prefers morning slot.",
        },
    )
    assert res.status_code == 201, res.text
    visit_id = res.json()["id"]

    res = _hit(
        company,
        "POST",
        f"/api/v1/company/site-visits/{visit_id}/decision",
        "/api/v1/company/site-visits/{visit_id}/decision",
        json={"decision": "Approve", "visit_instructions": "Meet at main reception."},
    )
    assert res.status_code == 200 and res.json()["company_approval_status"] == "Approved"

    res = _hit(
        anon,
        "POST",
        f"/api/v1/agency/site-visits/{visit_id}/feedback",
        "/api/v1/agency/site-visits/{visit_id}/feedback",
        headers=ah,
        json={"feedback": "Buyer loved the east-facing balcony.", "interest_level": "High", "mark_completed": True},
    )
    assert res.status_code == 200, res.text

    res = _hit(
        company,
        "POST",
        f"/api/v1/company/site-visits/{visit_id}/feedback",
        "/api/v1/company/site-visits/{visit_id}/feedback",
        json={"feedback": "Site visit completed smoothly.", "interest_level": "High", "mark_completed": True},
    )
    assert res.status_code == 200, res.text

    # 43 & 44. Agency offer -> Company offer decision (Accept)
    res = _hit(
        anon,
        "POST",
        "/api/v1/agency/offers",
        "/api/v1/agency/offers",
        headers=ah,
        json={
            "connection_id": conn_id,
            "property_id": str(sale_prop.id),
            "agency_lead_id": lead_id,
            "offered_price": "8300000.00",
            "price_frequency": "One-Time",
            "terms": "Full payment within 30 days.",
        },
    )
    assert res.status_code == 201, res.text
    offer_id = res.json()["id"]

    res = _hit(
        company,
        "POST",
        f"/api/v1/company/offers/{offer_id}/decision",
        "/api/v1/company/offers/{offer_id}/decision",
        json={"decision": "Accept", "response_notes": "Accepted at 83L."},
    )
    assert res.status_code == 200 and res.json()["status"] == "Accepted"

    # 45–51. Sale booking request -> approve -> sign agreement -> payment evidence -> verify -> confirm -> payment summary
    res = _hit(
        anon,
        "POST",
        "/api/v1/agency/sale-booking-requests",
        "/api/v1/agency/sale-booking-requests",
        headers=ah,
        json={
            "connection_id": conn_id,
            "property_id": str(sale_prop.id),
            "agency_lead_id": lead_id,
            "agency_requirement_id": req_id,
            "accepted_offer_id": offer_id,
            "proposed_price": "8300000.00",
            "booking_amount": "500000.00",
            "payment_preference": "Full Payment",
            "customer_consent_confirmed": True,
        },
    )
    assert res.status_code == 201, res.text
    sbr_id = res.json()["id"]

    res = _hit(
        company,
        "POST",
        f"/api/v1/company/agency-booking-requests/{sbr_id}/decision",
        "/api/v1/company/agency-booking-requests/{request_id}/decision",
        json={"decision": "Approve", "agreed_price": "8300000.00", "booking_amount": "500000.00", "hold_hours": 48, "agreement_text": "Standard Sale Agreement Terms for Skyview Unit."},
    )
    assert res.status_code == 200, res.text
    booking_id = res.json()["booking_id"]
    assert booking_id is not None

    res = _hit(
        anon,
        "POST",
        f"/api/v1/agency/sale-booking-requests/{sbr_id}/sign-agreement",
        "/api/v1/agency/sale-booking-requests/{request_id}/sign-agreement",
        headers=ah,
        json={"customer_signed_name": "Priya Buyer"},
    )
    assert res.status_code == 200 and res.json()["agreement_status"] == "Signed"

    res = _hit(
        anon,
        "POST",
        f"/api/v1/agency/sale-booking-requests/{sbr_id}/payment-evidence",
        "/api/v1/agency/sale-booking-requests/{request_id}/payment-evidence",
        headers=ah,
        json={"amount": "500000.00", "payment_method": "NEFT", "transaction_reference": "UTR-HTTP-20261121"},
    )
    assert res.status_code == 201, res.text
    payment_id = res.json()["payment_id"]

    res = _hit(
        company,
        "POST",
        f"/api/v1/company/payments/{payment_id}/verify",
        "/api/v1/company/payments/{payment_id}/verify",
        json={"decision": "Verify", "notes": "Credited to company escrow account."},
    )
    assert res.status_code == 200 and res.json()["status"] == "Verified"

    res = _hit(
        company,
        "POST",
        f"/api/v1/company/agency-booking-requests/{sbr_id}/confirm",
        "/api/v1/company/agency-booking-requests/{request_id}/confirm",
    )
    assert res.status_code == 200 and res.json()["status"] == "Confirmed"

    res = _hit(
        anon,
        "GET",
        f"/api/v1/agency/bookings/{booking_id}/payment-summary",
        "/api/v1/agency/bookings/{booking_id}/payment-summary",
        headers=ah,
    )
    assert res.status_code == 200, res.text
    assert Decimal(res.json()["net_verified_paid"]) == Decimal("500000.00")

    # 52. POST /api/v1/company/after-sales/support-requests
    res = _hit(
        company,
        "POST",
        "/api/v1/company/after-sales/support-requests",
        "/api/v1/company/after-sales/support-requests",
        json={
            "booking_id": booking_id,
            "issue_type": "property_defect",
            "subject": "Kitchen faucet leak on inspection",
            "description": "Minor water drip observed in utility sink during handover walk-through.",
            "priority": "High",
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["responsible_entity_type"] == "company"


def test_bundle3_all_15_endpoints_http(db_session, seed_world, api_client_factory):
    """Phases 11–13: Exercises all 15 HTTP endpoints in app/routes/finance_portals.py."""
    t1 = seed_world["t1"]
    ctx = _bootstrap_active_connection_http(db_session, api_client_factory, seed_world, email_prefix="b3")
    company = ctx["company_client"]
    anon = ctx["anon_client"]
    ah = ctx["agency_headers"]
    conn_id = ctx["conn_id"]
    rent_prop = ctx["rent_prop"]
    lease_prop = ctx["lease_prop"]

    # Create an agency lead for rental booking request
    lead_res = anon.post(
        "/api/v1/agency/leads",
        headers=ah,
        json={"full_name": "Rohan Lessee", "email": f"rohan.{uuid.uuid4().hex[:6]}@tenant.com", "phone": "+919848055443", "customer_consent_given": True},
    )
    assert lead_res.status_code == 201
    lead_id = lead_res.json()["id"]

    # 53. POST /api/v1/rentals/lease-escalation/preview
    res = _hit(
        anon,
        "POST",
        "/api/v1/rentals/lease-escalation/preview",
        "/api/v1/rentals/lease-escalation/preview",
        json={"base_rent": "50000.00", "duration_months": 36, "escalation_frequency_months": 12, "escalation_percent": "5.00"},
    )
    assert res.status_code == 200, res.text
    assert len(res.json()["schedule"]) == 36

    # 54. POST /api/v1/agency/rental-booking-requests
    res = _hit(
        anon,
        "POST",
        "/api/v1/agency/rental-booking-requests",
        "/api/v1/agency/rental-booking-requests",
        headers=ah,
        json={
            "connection_id": conn_id,
            "property_id": str(lease_prop.id),
            "agency_lead_id": lead_id,
            "booking_type": "Lease",
            "proposed_rent_amount": "50000.00",
            "proposed_deposit_amount": "200000.00",
            "advance_amount": "50000.00",
            "duration_months": 36,
            "lock_in_months": 12,
            "escalation_frequency_months": 12,
            "escalation_percent": "5.00",
            "maintenance_responsibility": "tenant",
        },
    )
    assert res.status_code == 201, res.text
    assert res.json()["booking_type"] == "Lease"

    # 56, 57, 58, 59. Commissions: create -> approve -> mark paid -> company summary -> agency summary
    res = _hit(
        company,
        "POST",
        "/api/v1/company/commissions",
        "/api/v1/company/commissions",
        json={"connection_id": conn_id, "transaction_type": "Sale", "transaction_value": "8500000.00"},
    )
    assert res.status_code == 201, res.text
    comm_id = res.json()["id"]
    assert Decimal(res.json()["net_payable"]) == Decimal("170000.00")

    res = _hit(
        company,
        "POST",
        f"/api/v1/company/commissions/{comm_id}/action",
        "/api/v1/company/commissions/{entry_id}/action",
        json={"action": "Approve", "notes": "Verified against signed agreement."},
    )
    assert res.status_code == 200 and res.json()["status"] == "Approved"

    res = company.post(
        f"/api/v1/company/commissions/{comm_id}/action",
        json={"action": "MarkPaid", "payout_reference": "NEFT-COMM-2026"},
    )
    assert res.status_code == 200 and res.json()["status"] == "Paid"

    res = _hit(company, "GET", "/api/v1/company/commissions/summary", "/api/v1/company/commissions/summary")
    assert res.status_code == 200 and Decimal(res.json()["paid_total"]) == Decimal("170000.00")

    # 59b & 59c. Dual-side customer/tenant brokerage recorded by agency -> marked paid
    cust_comm = _hit(
        anon,
        "POST",
        "/api/v1/agency/commissions/customer-side",
        "/api/v1/agency/commissions/customer-side",
        headers=ah,
        json={
            "connection_id": conn_id,
            "transaction_type": "Rent",
            "transaction_value": "25000.00",
            "commission_structure": "one_month_rent",
            "customer_name": "Rohan Lessee",
            "payment_received": False,
        },
    )
    assert cust_comm.status_code == 201, cust_comm.text
    cust_comm_id = cust_comm.json()["id"]
    assert cust_comm.json()["payer"] == "customer" and Decimal(cust_comm.json()["net_payable"]) == Decimal("25000.00")

    cust_paid = _hit(
        anon,
        "POST",
        f"/api/v1/agency/commissions/{cust_comm_id}/mark-customer-paid",
        "/api/v1/agency/commissions/{entry_id}/mark-customer-paid",
        headers=ah,
        json={"payout_reference": "UPI-TENANT-BROK-2026"},
    )
    assert cust_paid.status_code == 200 and cust_paid.json()["status"] == "Paid"

    res = _hit(anon, "GET", "/api/v1/agency/commissions/summary", "/api/v1/agency/commissions/summary", headers=ah)
    assert res.status_code == 200 and Decimal(res.json()["paid_total"]) == Decimal("195000.00")
    assert Decimal(res.json()["by_payer"]["company"]["paid_total"]) == Decimal("170000.00")
    assert Decimal(res.json()["by_payer"]["customer"]["paid_total"]) == Decimal("25000.00")

    # 55. POST /api/v1/agency/upgrade-to-paid (lossless Free -> Paid upgrade)
    res = _hit(
        anon,
        "POST",
        "/api/v1/agency/upgrade-to-paid",
        "/api/v1/agency/upgrade-to-paid",
        headers=ah,
        json={"company_name": "B3 Paid Realty LLP", "city": "Hyderabad", "state": "Telangana"},
    )
    assert res.status_code == 200, res.text
    assert res.json()["operating_mode"] == "paid_tenant"
    assert res.json()["agency_id"] == ctx["agency_id"]

    # 60, 61, 64, 65, 62, 63, 66. Property Owner -> Mandate -> Owner Portal Login -> Approve Mandate -> Payout -> Mark Paid -> Owner Statements
    owner_email = f"owner.{uuid.uuid4().hex[:6]}@landlord.com"
    res = _hit(
        company,
        "POST",
        "/api/v1/property-owners",
        "/api/v1/property-owners",
        json={
            "full_name": "Suresh Reddy",
            "email": owner_email,
            "phone": "+919848077665",
            "pan_number": "ABCDE1234F",
            "portal_password": "OwnerPortalPass!2026",
        },
    )
    assert res.status_code == 201 and res.json()["portal_enabled"] is True
    owner_id = res.json()["id"]

    res = _hit(
        company,
        "POST",
        "/api/v1/owner-mandates",
        "/api/v1/owner-mandates",
        json={
            "owner_id": owner_id,
            "property_id": str(rent_prop.id),
            "management_fee_type": "percentage",
            "management_fee_value": "8.00",
            "collection_authority": "authorized_collection",
        },
    )
    assert res.status_code == 201, res.text
    mandate_id = res.json()["id"]

    res = _hit(
        anon,
        "POST",
        "/api/v1/owner-portal/auth/login",
        "/api/v1/owner-portal/auth/login",
        json={"email": owner_email, "password": "OwnerPortalPass!2026"},
    )
    assert res.status_code == 200, res.text
    owner_headers = {"Authorization": f"Bearer {res.json()['access_token']}"}

    res = _hit(
        anon,
        "POST",
        f"/api/v1/owner-portal/mandates/{mandate_id}/approve",
        "/api/v1/owner-portal/mandates/{mandate_id}/approve",
        headers=owner_headers,
    )
    assert res.status_code == 200 and res.json()["status"] == "Active"

    # Seed a RentalAgreement on rent_prop so owner payout & customer experience-profile have a live agreement
    agreement = RentalAgreement(
        id=uuid.uuid4(),
        tenant_id=t1["tenant"].id,
        property_id=rent_prop.id,
        contact_id=t1["contact"].id,
        agreement_type="Rent",
        status="Active",
        customer_name="Rohan Tenant",
        customer_email=t1["contact"].email,
        rent_amount=Decimal("19000.00"),
        deposit_amount=Decimal("38000.00"),
        agreement_start=date.today(),
        agreement_end=date.today() + timedelta(days=330),
        lock_in_months=3,
        notice_period_days=30,
        due_day=5,
    )
    db_session.add(agreement)
    db_session.commit()

    res = _hit(
        company,
        "POST",
        "/api/v1/owner-payouts",
        "/api/v1/owner-payouts",
        json={
            "mandate_id": mandate_id,
            "rental_agreement_id": str(agreement.id),
            "rent_collected": "19000.00",
        },
    )
    assert res.status_code == 201, res.text
    ledger_id = res.json()["id"]
    assert Decimal(res.json()["management_fee"]) == Decimal("1520.00")
    assert Decimal(res.json()["net_owner_payout"]) == Decimal("17480.00")

    res = _hit(
        company,
        "POST",
        f"/api/v1/owner-payouts/{ledger_id}/mark-paid",
        "/api/v1/owner-payouts/{ledger_id}/mark-paid",
        json={"bank_transfer_reference": "IMPS-OWNER-20261121"},
    )
    assert res.status_code == 200 and res.json()["status"] == "Paid"

    res = _hit(
        anon,
        "GET",
        "/api/v1/owner-portal/statements",
        "/api/v1/owner-portal/statements",
        headers=owner_headers,
    )
    assert res.status_code == 200, res.text
    assert len(res.json()["payouts"]) == 1
    assert res.json()["payouts"][0]["bank_transfer_reference"] == "IMPS-OWNER-20261121"

    # 67. GET /api/v1/customer-portal/experience-profile (reuses existing CustomerPortalUser)
    portal_client = api_client_factory(portal_ctx=t1["portal_ctx"])
    res = _hit(
        portal_client,
        "GET",
        "/api/v1/customer-portal/experience-profile",
        "/api/v1/customer-portal/experience-profile",
    )
    assert res.status_code == 200, res.text
    assert "tenant" in res.json()["scopes"]


def test_http_auth_isolation_and_67_of_67_route_coverage(db_session, seed_world, api_client_factory):
    """Verifies cross-portal auth isolation over HTTP AND asserts 100% (67/67) endpoint coverage."""
    anon = api_client_factory()

    # Unauthenticated calls must fail with 401
    assert anon.get("/api/v1/agency-auth/me").status_code == 401
    assert anon.get("/api/v1/owner-portal/statements").status_code == 401

    # Verify every single route from the 3 Phase 1–14 routers is mounted on app AND was hit over HTTP
    from app.routes.agency_collaboration import router as r1
    from app.routes.agency_workflow import router as r2
    from app.routes.finance_portals import router as r3

    openapi_paths = app.openapi().get("paths", {})
    app_route_set: set[tuple[str, str]] = {
        (method.upper(), path)
        for path, ops in openapi_paths.items()
        for method in ops.keys()
        if method.lower() in ("get", "post", "put", "patch", "delete")
    }
    registered: set[tuple[str, str]] = set()
    for router in (r1, r2, r3):
        for r in router.routes:
            for method in getattr(r, "methods", set()):
                if method not in ("HEAD", "OPTIONS"):
                    registered.add((method.upper(), r.path))

    not_mounted = sorted(registered - app_route_set)
    assert not not_mounted, f"Routes not mounted on FastAPI app: {not_mounted}"

    missing = sorted(registered - _EXERCISED_ROUTES)
    assert len(registered) == 69, f"Expected 69 Phase 1-14 endpoints, found {len(registered)}"
    assert not missing, f"Untested endpoints ({len(missing)}): {missing}"
