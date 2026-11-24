
from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.agency import AgencyNotification, CompanyAgencyConnection
from app.models.booking import Booking
from app.models.property import Property
from app.models.site_visit_history import SiteVisitHistory
from app.models.tenant import Tenant
from app.models.user import User
from app.services.agency_collaboration import (
    activate_connection,
    complete_invitation_onboarding,
    create_agency_connection_request,
    create_company_agency_invitation,
    provision_real_estate_business_entities,
    sign_agreement_version,
)
from app.services.agency_workflow import (
    add_agency_shortlist,
    add_agency_team_member,
    agency_request_site_visit,
    agency_submit_offer,
    agency_submit_sale_booking_request,
    company_confirm_agency_sale_booking,
    company_decide_offer,
    company_decide_sale_booking_request,
    company_decide_site_visit,
    company_verify_booking_payment,
    create_agency_lead,
    create_agency_requirement,
    get_agency_booking_payment_summary,
    get_agency_dashboard_summary,
    get_company_dashboard_summary,
    match_agency_requirement_across_companies,
    record_site_visit_feedback,
    route_after_sales_service_request,
    sign_agency_sale_agreement,
    submit_agency_payment_evidence,
)


def _utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def test_scenario_d_h_i_full_ravi_a504_sale_journey_and_multi_agency_conflict(db_session):
    # Companies & Agencies
    abc = Tenant(id=uuid.uuid4(), name="ABC Properties", industry="Real Estate", business_type="real_estate_company", status="Active")
    prime_t = Tenant(id=uuid.uuid4(), name="Prime Realty", industry="Real Estate", business_type="real_estate_agency", billing_email="prime@r.in", billing_phone="+919877777777", status="Active")
    db_session.add_all([abc, prime_t])
    db_session.flush()

    abc_admin = User(id=uuid.uuid4(), tenant_id=abc.id, full_name="ABC Director", email="dir@abc.in", password="x", status="Active")
    prime_u = User(id=uuid.uuid4(), tenant_id=prime_t.id, full_name="Prime Owner", email="prime@r.in", password="x", status="Active")
    db_session.add_all([abc_admin, prime_u])
    db_session.flush()

    provision_real_estate_business_entities(db_session, abc, abc_admin)
    _, prime_ag = provision_real_estate_business_entities(db_session, prime_t, prime_u)

    prop_a504 = Property(
        id=uuid.uuid4(),
        tenant_id=abc.id,
        name="A-504",
        property_type="Apartment",
        listing_type="Sale",
        address="Miyapur, Hyderabad",
        city="Hyderabad",
        state="Telangana",
        country="India",
        bedrooms=3,
        price=Decimal("8500000.00"),
        status="Available",
    )
    db_session.add(prop_a504)
    db_session.commit()

    # Connect Smart Homes (Free) & Prime Realty (Paid) to ABC
    _, tok, _, _ = create_company_agency_invitation(
        db_session,
        abc.id,
        abc_admin.id,
        SimpleNamespace(
            agency_name="Smart Homes",
            contact_name="Suresh",
            email="smart@homes.in",
            phone="+919811111111",
            business_details=None,
            can_sale=True,
            can_rent=True,
            can_lease=False,
            sharing_scope="all_eligible",
            property_ids=[],
            commission_terms=SimpleNamespace(model_dump=lambda mode="json": {"sale": {"structure": "percentage", "value": "2.00"}}),
            responsibilities={},
            agreement_text="ABC-Smart Homes",
            start_date=None,
            expiry_date=None,
            termination_notice_days=30,
            expires_in_hours=72,
        ),
    )
    ob = complete_invitation_onboarding(
        db_session,
        SimpleNamespace(
            token=tok,
            onboarding_choice="free_external",
            password="StrongAgencyPassword!2026",
            full_name="Suresh",
            rera_registration_number="TS-01",
            city="Hyderabad",
            state="Telangana",
            office_address="Miyapur",
        ),
    )
    smart_id = uuid.UUID(ob["agency_id"])
    smart_ctx = {"agency_id": smart_id, "actor_id": ob["member"].id, "operating_mode": "free_external", "role": "agency_owner"}
    conn_smart = db_session.query(CompanyAgencyConnection).filter(CompanyAgencyConnection.id == uuid.UUID(ob["connection_id"])).first()
    sign_agreement_version(db_session, conn_smart, "agency", ob["member"].id, "Suresh")
    sign_agreement_version(db_session, conn_smart, "company", abc_admin.id, "ABC Director")
    activate_connection(db_session, abc.id, abc_admin.id, conn_smart.id)

    prime_ctx = {"agency_id": prime_ag.id, "actor_id": prime_u.id, "tenant_id": prime_t.id, "operating_mode": "paid_tenant", "role": "agency_owner"}
    conn_prime = create_agency_connection_request(
        db_session,
        prime_ctx,
        SimpleNamespace(
            company_tenant_id=abc.id,
            can_sale=True,
            can_rent=False,
            can_lease=False,
            sharing_scope="all_eligible",
            commission_terms=SimpleNamespace(model_dump=lambda mode="json": {"sale": {"structure": "percentage", "value": "2.00"}}),
            responsibilities={},
            agreement_text="Prime-ABC",
            start_date=None,
            expiry_date=None,
            termination_notice_days=30,
            notes="Connect",
        ),
    )
    sign_agreement_version(db_session, conn_prime, "agency", prime_u.id, "Prime Owner")
    sign_agreement_version(db_session, conn_prime, "company", abc_admin.id, "ABC Director")
    activate_connection(db_session, abc.id, abc_admin.id, conn_prime.id)
    db_session.commit()

    # Step 1-4: Smart Homes creates Ravi -> 3BHK requirement -> cross-company match -> shortlist
    ravi = create_agency_lead(
        db_session,
        smart_ctx,
        SimpleNamespace(full_name="Ravi Kumar", email="ravi@buyer.in", phone="+919800001111", source="Referral", notes="3BHK Miyapur", customer_consent_given=True),
    )
    req = create_agency_requirement(
        db_session,
        smart_ctx,
        SimpleNamespace(
            agency_lead_id=ravi.id,
            transaction_type="Sale",
            property_type="Apartment",
            city="Hyderabad",
            preferred_locality="Miyapur",
            bedrooms=3,
            min_budget=Decimal("8000000"),
            max_budget=Decimal("9000000"),
            min_area=None,
            max_area=None,
            preferred_amenities=["Parking"],
            lease_duration_months=None,
            lock_in_months=None,
            notes="Ready to move",
        ),
    )
    matches = match_agency_requirement_across_companies(db_session, smart_id, req.id)
    assert len(matches) == 1 and matches[0]["name"] == "A-504" and matches[0]["source_company_name"] == "ABC Properties"

    add_agency_shortlist(db_session, smart_ctx, SimpleNamespace(agency_requirement_id=req.id, connection_id=conn_smart.id, property_id=prop_a504.id, notes="Top pick"))

    # Step 5-7: Site visit request -> ABC approval -> 3-party feedback + immutable SiteVisitHistory
    now = _utc_now()
    visit = agency_request_site_visit(
        db_session,
        smart_ctx,
        SimpleNamespace(connection_id=conn_smart.id, property_id=prop_a504.id, agency_lead_id=ravi.id, scheduled_start=now + timedelta(days=1), scheduled_end=now + timedelta(days=1, hours=1), notes="Morning slot"),
    )
    company_decide_site_visit(
        db_session,
        abc.id,
        abc_admin.id,
        visit.id,
        SimpleNamespace(decision="Approve", assigned_to=abc_admin.id, scheduled_start=None, scheduled_end=None, visit_instructions="Meet at Gate 2", reason=None),
    )
    record_site_visit_feedback(db_session, visit, "agency", smart_ctx["actor_id"], SimpleNamespace(feedback="Ravi loved the balcony", interest_level="High", mark_completed=True))
    record_site_visit_feedback(db_session, visit, "company", abc_admin.id, SimpleNamespace(feedback="Serious buyer", interest_level="High", mark_completed=True))
    assert db_session.query(SiteVisitHistory).filter(SiteVisitHistory.site_visit_id == visit.id).count() == 4

    # Step 8: Ravi offers 84L -> ABC counteroffers 85L (immutable chain)
    offer_v1 = agency_submit_offer(
        db_session,
        smart_ctx,
        SimpleNamespace(connection_id=conn_smart.id, property_id=prop_a504.id, agency_lead_id=ravi.id, offered_price=Decimal("8400000"), price_frequency="One-Time", terms="Loan approved", expires_in_hours=72),
    )
    offer_v2 = company_decide_offer(
        db_session,
        abc.id,
        abc_admin.id,
        offer_v1.id,
        SimpleNamespace(decision="Counteroffer", counter_price=Decimal("8500000"), response_notes="Final price 85L"),
    )
    assert offer_v1.status == "Countered" and offer_v2.version_number == 2

    # Step 9-10: Smart Homes submits booking request -> ABC approves & places central hold -> Prime Realty blocked (Scenario H)
    sale_req = agency_submit_sale_booking_request(
        db_session,
        smart_ctx,
        SimpleNamespace(
            connection_id=conn_smart.id,
            property_id=prop_a504.id,
            agency_lead_id=ravi.id,
            agency_requirement_id=req.id,
            accepted_offer_id=offer_v2.id,
            proposed_price=Decimal("8500000"),
            booking_amount=Decimal("500000"),
            payment_preference="Installments",
            customer_consent_confirmed=True,
            agency_notes="Ready to pay token",
        ),
    )
    company_decide_sale_booking_request(
        db_session,
        abc.id,
        abc_admin.id,
        sale_req.id,
        SimpleNamespace(
            decision="Approve",
            agreed_price=Decimal("8500000"),
            booking_amount=Decimal("500000"),
            hold_hours=48,
            payment_instructions="NEFT to ABC Escrow A/C",
            agreement_text="Formal Sale Booking Agreement for A-504",
            company_notes="Hold placed",
            rejection_reason=None,
        ),
    )
    db_session.commit()
    assert prop_a504.status == "Reserved"

    # Competing agency Prime Realty cannot submit a conflicting booking on Reserved A-504
    prime_lead = create_agency_lead(db_session, prime_ctx, SimpleNamespace(full_name="Other Buyer", email="o@b.in", phone="+919822222222", source="Direct", notes="", customer_consent_given=True))
    with pytest.raises(HTTPException) as exc_h:
        agency_submit_sale_booking_request(
            db_session,
            prime_ctx,
            SimpleNamespace(
                connection_id=conn_prime.id,
                property_id=prop_a504.id,
                agency_lead_id=prime_lead.id,
                agency_requirement_id=None,
                accepted_offer_id=None,
                proposed_price=Decimal("8500000"),
                booking_amount=Decimal("500000"),
                payment_preference="Full Payment",
                customer_consent_confirmed=True,
                agency_notes="",
            ),
        )
    assert exc_h.value.status_code == 409

    # Step 11-13: Sign agreement -> Submit payment evidence -> Duplicate ref blocked -> Company verifies -> Confirm booking
    sign_agency_sale_agreement(db_session, smart_id, sale_req.id, "Ravi Kumar")
    pay = submit_agency_payment_evidence(
        db_session,
        smart_id,
        sale_req.id,
        SimpleNamespace(amount=Decimal("500000"), payment_method="NEFT", transaction_reference="UTR-RAVI-001", installment_id=None, notes="Token paid"),
    )
    assert pay.status == "Under Verification"

    with pytest.raises(HTTPException) as exc_dup:
        submit_agency_payment_evidence(
            db_session,
            smart_id,
            sale_req.id,
            SimpleNamespace(amount=Decimal("500000"), payment_method="NEFT", transaction_reference="UTR-RAVI-001", installment_id=None, notes="Dup"),
        )
    assert exc_dup.value.status_code == 409

    company_verify_booking_payment(db_session, abc.id, abc_admin.id, pay.id, SimpleNamespace(decision="Verify", notes="Received in escrow"))
    booking = company_confirm_agency_sale_booking(db_session, abc.id, abc_admin.id, sale_req.id)
    db_session.commit()
    assert booking.status == "Confirmed" and prop_a504.status == "Booked"

    pay_summary = get_agency_booking_payment_summary(db_session, smart_id, booking.id)
    assert pay_summary["net_verified_paid"] == "500000.00"
    assert pay_summary["outstanding_balance"] == "8000000.00"

    # Step 16: After-sales support routing (Property defect -> Company; Agency complaint -> Smart Homes)
    defect_ticket = route_after_sales_service_request(
        db_session, abc.id, None, SimpleNamespace(booking_id=booking.id, issue_type="property_defect", subject="Bathroom tile crack", description="Master bathroom tile cracked on handover.", priority="High")
    )
    agency_ticket = route_after_sales_service_request(
        db_session, abc.id, None, SimpleNamespace(booking_id=booking.id, issue_type="agency_complaint", subject="Follow-up delay", description="Agency did not share receipt copy on time.", priority="Medium")
    )
    assert defect_ticket.responsible_entity_type == "company" and defect_ticket.agency_assist_allowed is True
    assert agency_ticket.responsible_entity_type == "agency" and agency_ticket.responsible_agency_id == smart_id

    # Phase 5: Dashboards & Free agency team seat cap (max 3: owner + 2 agents ok, 4th blocked)
    add_agency_team_member(db_session, smart_ctx, SimpleNamespace(full_name="Agent 1", email="ag1@homes.in", phone="+919800000011", password="StrongPassword!2026", role="agency_agent"))
    add_agency_team_member(db_session, smart_ctx, SimpleNamespace(full_name="Agent 2", email="ag2@homes.in", phone="+919800000012", password="StrongPassword!2026", role="agency_agent"))
    with pytest.raises(HTTPException) as exc_cap:
        add_agency_team_member(db_session, smart_ctx, SimpleNamespace(full_name="Agent 3", email="ag3@homes.in", phone="+919800000013", password="StrongPassword!2026", role="agency_agent"))
    assert exc_cap.value.status_code == 403

    ag_dash = get_agency_dashboard_summary(db_session, smart_ctx)
    co_dash = get_company_dashboard_summary(db_session, abc.id)
    assert ag_dash["pipeline"]["confirmed_or_pending_bookings"] == 1
    assert co_dash["bookings"]["agency_sourced"] == 1
