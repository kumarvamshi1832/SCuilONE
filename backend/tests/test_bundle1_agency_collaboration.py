
from __future__ import annotations

import uuid
from decimal import Decimal
from types import SimpleNamespace

import pytest

from app.models.agency import (
    Agency,
    AgencyAgreementVersion,
    AgencyInvitation,
    AgencyMember,
    AgencyNotification,
    AgencyPropertyAccess,
    CompanyAgencyConnection,
    RealEstateBusinessProfile,
)
from app.models.property import Property
from app.models.tenant import Tenant
from app.models.user import User
from app.services.agency_collaboration import (
    activate_connection,
    broadcast_property_availability_change,
    complete_invitation_onboarding,
    convert_tenant_business_type,
    counterpropose_agreement_version,
    create_agency_connection_request,
    create_company_agency_invitation,
    find_existing_agency,
    list_agency_authorized_properties,
    normalize_business_type,
    provision_real_estate_business_entities,
    resolve_dashboard_type,
    sign_agreement_version,
    transition_connection_status,
    update_connection_property_sharing,
)


def _make_property(db, tenant_id, name: str, listing_type: str = "Sale", city: str = "Hyderabad") -> Property:
    prop = Property(
        id=uuid.uuid4(),
        tenant_id=tenant_id,
        name=name,
        property_type="Apartment",
        listing_type=listing_type,
        address=f"{name}, Miyapur",
        city=city,
        state="Telangana",
        country="India",
        price=Decimal("8500000.00") if listing_type == "Sale" else Decimal("25000.00"),
        status="Available",
    )
    db.add(prop)
    db.flush()
    return prop


def test_phase1_business_type_validation_and_provisioning(db_session):
    assert normalize_business_type("real_estate", "real_estate_company") == "real_estate_company"
    assert normalize_business_type("real_estate", "real_estate_agency") == "real_estate_agency"
    assert normalize_business_type("software_companies", None) is None

    with pytest.raises(Exception):
        normalize_business_type("real_estate", None)

    company = Tenant(
        id=uuid.uuid4(),
        name="ABC Properties",
        industry="Real Estate",
        business_type="real_estate_company",
        billing_email="abc@example.com",
        billing_phone="+919800000001",
        status="Active",
    )
    agency_tenant = Tenant(
        id=uuid.uuid4(),
        name="Prime Realty Paid",
        industry="Real Estate",
        business_type="real_estate_agency",
        billing_email="prime@example.com",
        billing_phone="+919800000002",
        status="Active",
    )
    db_session.add_all([company, agency_tenant])
    db_session.flush()

    u_comp = User(id=uuid.uuid4(), tenant_id=company.id, full_name="ABC Admin", email="admin@abc.com", password="x", status="Active")
    u_ag = User(id=uuid.uuid4(), tenant_id=agency_tenant.id, full_name="Prime Owner", email="prime@example.com", password="x", status="Active")
    db_session.add_all([u_comp, u_ag])
    db_session.flush()

    p_comp, g_comp = provision_real_estate_business_entities(db_session, company, u_comp, city="Hyderabad")
    p_ag, g_ag = provision_real_estate_business_entities(db_session, agency_tenant, u_ag, city="Hyderabad")
    db_session.commit()

    assert p_comp.business_type == "real_estate_company"
    assert g_comp is None
    assert resolve_dashboard_type(company) == "real_estate_company"

    assert p_ag.business_type == "real_estate_agency"
    assert g_ag is not None
    assert g_ag.operating_mode == "paid_tenant"
    assert g_ag.tenant_id == agency_tenant.id
    assert resolve_dashboard_type(agency_tenant) == "real_estate_agency"

    # Controlled platform admin conversion
    convert_tenant_business_type(db_session, company.id, "real_estate_agency", "Approved business restructuring", u_comp.id)
    db_session.commit()
    assert company.business_type == "real_estate_agency"
    assert db_session.query(Agency).filter(Agency.tenant_id == company.id).first() is not None


def test_scenarios_a_b_c_e_global_agency_multi_company_sharing_and_termination(db_session):
    # Setup two Real Estate Companies: ABC Properties & XYZ Developers
    abc = Tenant(id=uuid.uuid4(), name="ABC Properties", industry="Real Estate", business_type="real_estate_company", status="Active")
    xyz = Tenant(id=uuid.uuid4(), name="XYZ Developers", industry="Real Estate", business_type="real_estate_company", status="Active")
    prime_t = Tenant(id=uuid.uuid4(), name="Prime Realty", industry="Real Estate", business_type="real_estate_agency", billing_email="prime@realty.com", billing_phone="+919877777777", status="Active")
    db_session.add_all([abc, xyz, prime_t])
    db_session.flush()

    abc_admin = User(id=uuid.uuid4(), tenant_id=abc.id, full_name="ABC Admin", email="admin@abc.in", password="x", status="Active")
    xyz_admin = User(id=uuid.uuid4(), tenant_id=xyz.id, full_name="XYZ Admin", email="admin@xyz.in", password="x", status="Active")
    prime_user = User(id=uuid.uuid4(), tenant_id=prime_t.id, full_name="Prime Admin", email="prime@realty.com", password="x", status="Active")
    db_session.add_all([abc_admin, xyz_admin, prime_user])
    db_session.flush()

    provision_real_estate_business_entities(db_session, abc, abc_admin)
    provision_real_estate_business_entities(db_session, xyz, xyz_admin)
    _, prime_agency = provision_real_estate_business_entities(db_session, prime_t, prime_user)

    prop_a504 = _make_property(db_session, abc.id, "A-504", listing_type="Sale")
    prop_a505_rent = _make_property(db_session, abc.id, "A-505", listing_type="Rent")
    prop_b204 = _make_property(db_session, xyz.id, "B-204", listing_type="Lease")
    db_session.commit()

    # Scenario A: ABC invites brand-new agency "Smart Homes"
    invite_payload = SimpleNamespace(
        agency_name="Smart Homes",
        contact_name="Suresh Rao",
        email="smarthomes@agency.in",
        phone="+919811111111",
        business_details={"city": "Hyderabad"},
        can_sale=True,
        can_rent=True,
        can_lease=False,
        sharing_scope="selected_properties",
        property_ids=[prop_a504.id],
        commission_terms=SimpleNamespace(model_dump=lambda mode="json": {"sale": {"structure": "percentage", "value": "2.00"}}),
        responsibilities={"company": "Property control", "agency": "Customer acquisition"},
        agreement_text="Standard ABC-Smart Homes brokerage agreement",
        start_date=None,
        expiry_date=None,
        termination_notice_days=30,
        expires_in_hours=72,
    )
    inv_abc, token_abc, conn_abc_pre, existed = create_company_agency_invitation(db_session, abc.id, abc_admin.id, invite_payload)
    db_session.commit()
    assert existed is False
    assert conn_abc_pre is None

    # Smart Homes opens link and selects Free Collaboration
    onboard_res = complete_invitation_onboarding(
        db_session,
        SimpleNamespace(
            token=token_abc,
            onboarding_choice="free_external",
            password="StrongAgencyPassword!2026",
            full_name="Suresh Rao",
            rera_registration_number="TSRERA-001",
            city="Hyderabad",
            state="Telangana",
            office_address="Miyapur, Hyderabad",
        ),
    )
    db_session.commit()
    smart_agency_id = uuid.UUID(onboard_res["agency_id"])
    conn_abc_id = uuid.UUID(onboard_res["connection_id"])
    assert onboard_res["operating_mode"] == "free_external"
    assert onboard_res["connection_activated"] is False

    # Before signing/activation, Smart Homes sees ZERO ABC properties
    assert list_agency_authorized_properties(db_session, smart_agency_id) == []

    # Counterproposal creates immutable v2 (v1 preserved as Superseded)
    conn_abc = db_session.query(CompanyAgencyConnection).filter(CompanyAgencyConnection.id == conn_abc_id).first()
    v2 = counterpropose_agreement_version(
        db_session,
        conn_abc,
        "agency",
        smart_agency_id,
        SimpleNamespace(
            can_sale=True,
            can_rent=True,
            can_lease=False,
            sharing_scope="selected_properties",
            commission_terms=SimpleNamespace(model_dump=lambda mode="json": {"sale": {"structure": "percentage", "value": "2.50"}}),
            responsibilities={"company": "Property control", "agency": "Lead + Visits"},
            agreement_text="Counterproposed agreement v2",
            effective_from=None,
            effective_to=None,
            termination_notice_days=30,
            change_summary="Adjusted sale commission to 2.5%",
        ),
    )
    db_session.commit()
    assert v2.version_number == 2
    versions = db_session.query(AgencyAgreementVersion).filter(AgencyAgreementVersion.connection_id == conn_abc.id).all()
    assert len(versions) == 2

    # Both sides sign v2, then ABC activates
    sign_agreement_version(db_session, conn_abc, "agency", smart_agency_id, "Suresh Rao")
    sign_agreement_version(db_session, conn_abc, "company", abc_admin.id, "ABC Director")
    activate_connection(db_session, abc.id, abc_admin.id, conn_abc.id)
    db_session.commit()

    # Smart Homes sees ONLY A-504 (selected_properties), NOT A-505
    visible = list_agency_authorized_properties(db_session, smart_agency_id)
    assert [p["name"] for p in visible] == ["A-504"]

    # Scenario B: XYZ Developers invites already-registered Smart Homes -> zero duplicate Agency!
    xyz_invite = SimpleNamespace(
        agency_name="Smart Homes",
        contact_name="Suresh Rao",
        email="smarthomes@agency.in",
        phone="+919811111111",
        business_details=None,
        can_sale=False,
        can_rent=False,
        can_lease=True,
        sharing_scope="all_eligible",
        property_ids=[],
        commission_terms=SimpleNamespace(model_dump=lambda mode="json": {"lease": {"structure": "one_month_rent"}}),
        responsibilities={},
        agreement_text="XYZ Lease-only agreement",
        start_date=None,
        expiry_date=None,
        termination_notice_days=30,
        expires_in_hours=72,
    )
    _, _, conn_xyz, existed_xyz = create_company_agency_invitation(db_session, xyz.id, xyz_admin.id, xyz_invite)
    db_session.commit()
    assert existed_xyz is True
    assert conn_xyz is not None
    assert db_session.query(Agency).filter(Agency.verified_email == "smarthomes@agency.in").count() == 1

    sign_agreement_version(db_session, conn_xyz, "agency", smart_agency_id, "Suresh Rao")
    sign_agreement_version(db_session, conn_xyz, "company", xyz_admin.id, "XYZ Director")
    activate_connection(db_session, xyz.id, xyz_admin.id, conn_xyz.id)
    db_session.commit()

    # Smart Homes now sees A-504 (ABC) + B-204 (XYZ) with independent permissions
    visible_both = list_agency_authorized_properties(db_session, smart_agency_id)
    assert sorted(p["name"] for p in visible_both) == ["A-504", "B-204"]

    # Scenario C: Prime Realty also connects to ABC (all_eligible Sale) and both receive availability broadcast for A-504
    conn_prime = create_agency_connection_request(
        db_session,
        {"agency_id": prime_agency.id, "actor_id": prime_user.id, "tenant_id": prime_t.id},
        SimpleNamespace(
            company_tenant_id=abc.id,
            can_sale=True,
            can_rent=False,
            can_lease=False,
            sharing_scope="all_eligible",
            commission_terms=SimpleNamespace(model_dump=lambda mode="json": {"sale": {"structure": "percentage", "value": "2.00"}}),
            responsibilities={},
            agreement_text="Prime-ABC agreement",
            start_date=None,
            expiry_date=None,
            termination_notice_days=30,
            notes="Requesting Sale inventory access",
        ),
    )
    sign_agreement_version(db_session, conn_prime, "agency", prime_user.id, "Prime Admin")
    sign_agreement_version(db_session, conn_prime, "company", abc_admin.id, "ABC Director")
    activate_connection(db_session, abc.id, abc_admin.id, conn_prime.id)
    db_session.commit()

    notified = broadcast_property_availability_change(
        db_session,
        abc.id,
        prop_a504.id,
        "property_held",
        "A-504 placed on temporary hold",
        "ABC Properties placed a 24h hold on A-504.",
        idempotency_prefix="hold:a504:1",
    )
    db_session.commit()
    assert notified == 2

    # Scenario E: ABC terminates Smart Homes -> Smart Homes loses ABC inventory, keeps XYZ; Prime keeps ABC; history preserved!
    transition_connection_status(
        db_session,
        conn_abc,
        "Terminated",
        "company",
        abc_admin.id,
        "Contract ended by ABC",
        post_termination_policy="preserve_active_transactions",
    )
    db_session.commit()

    assert [p["name"] for p in list_agency_authorized_properties(db_session, smart_agency_id)] == ["B-204"]
    assert [p["name"] for p in list_agency_authorized_properties(db_session, prime_agency.id)] == ["A-504"]
    assert db_session.query(AgencyAgreementVersion).filter(AgencyAgreementVersion.connection_id == conn_abc.id).count() == 2
