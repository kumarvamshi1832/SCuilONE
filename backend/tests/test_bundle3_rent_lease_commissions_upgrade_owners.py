"""
- Scenario F: Lease escalation schedule + agency-sourced Lease hold on central Property
- Scenario J: Lossless Free External Agency -> Paid Registered Agency Tenant upgrade preserving connections & commissions
- Commission calculation (2% of 85,00,000 = 1,70,000) surviving connection termination
- Owner-Agency Mandate + Option A (19,000 rent - 8% = 17,480 net payout) & Option B (direct-to-owner fee receivable)
"""
from __future__ import annotations

import uuid
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

from app.models.agency import Agency, CompanyAgencyConnection
from app.models.finance_portals import AgencyCommissionEntry
from app.models.property import Property
from app.models.rental import RentalAgreement
from app.models.role import Role
from app.models.tenant import Tenant
from app.models.user import User
from app.services.agency_collaboration import (
    activate_connection,
    complete_invitation_onboarding,
    create_company_agency_invitation,
    provision_real_estate_business_entities,
    sign_agreement_version,
    transition_connection_status,
)
from app.services.agency_workflow import create_agency_lead
from app.services.finance_portals import (
    act_on_commission_entry,
    agency_submit_rental_or_lease_request,
    create_commission_entry_from_agreement,
    create_owner_mandate,
    create_property_owner,
    mark_owner_payout_paid,
    owner_approve_mandate,
    preview_lease_escalation_schedule,
    record_owner_payout_from_collection,
    upgrade_free_agency_to_paid,
)


def test_bundle3_lease_upgrade_commissions_and_owner_payouts(db_session):
    # Ensure base roles exist for Free -> Paid upgrade
    if not db_session.query(Role).filter(Role.name == "Tenant Owner").first():
        db_session.add(Role(id=uuid.uuid4(), name="Tenant Owner"))
    if not db_session.query(Role).filter(Role.name == "Sales Agent").first():
        db_session.add(Role(id=uuid.uuid4(), name="Sales Agent"))
    db_session.flush()

    # Scenario F: Lease escalation preview (5% every 12 months on 100,000 base)
    sched = preview_lease_escalation_schedule(Decimal("100000.00"), 25, 12, Decimal("5.00"))
    assert sched[0]["lease_amount"] == "100000.00"
    assert sched[12]["lease_amount"] == "105000.00"
    assert sched[24]["lease_amount"] == "110250.00"

    # Setup ABC Properties + Lease & Sale properties
    abc = Tenant(id=uuid.uuid4(), name="ABC Properties", industry="Real Estate", business_type="real_estate_company", status="Active")
    db_session.add(abc)
    db_session.flush()
    abc_u = User(id=uuid.uuid4(), tenant_id=abc.id, full_name="ABC Dir", email="dir@abc.in", password="x", status="Active")
    db_session.add(abc_u)
    db_session.flush()
    provision_real_estate_business_entities(db_session, abc, abc_u)

    prop_lease = Property(
        id=uuid.uuid4(),
        tenant_id=abc.id,
        name="Commercial Floor 3",
        property_type="Commercial",
        listing_type="Lease",
        address="HITEC City",
        city="Hyderabad",
        state="Telangana",
        country="India",
        price=Decimal("100000.00"),
        status="Available",
    )
    db_session.add(prop_lease)
    db_session.commit()

    # Connect Smart Homes (Free) with Sale (2%) + Lease (1 month rent)
    _, tok, _, _ = create_company_agency_invitation(
        db_session,
        abc.id,
        abc_u.id,
        SimpleNamespace(
            agency_name="Smart Homes",
            contact_name="Suresh",
            email="smart@homes.in",
            phone="+919811111111",
            business_details=None,
            can_sale=True,
            can_rent=True,
            can_lease=True,
            sharing_scope="all_eligible",
            property_ids=[],
            commission_terms=SimpleNamespace(
                model_dump=lambda mode="json": {
                    "sale": {"structure": "percentage", "value": "2.00", "payer": "company"},
                    "lease": {"structure": "one_month_rent", "value": "1.00", "payer": "company"},
                }
            ),
            responsibilities={},
            agreement_text="ABC-Smart Homes Master",
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
            password="StrongPassword!2026",
            full_name="Suresh",
            rera_registration_number="TS-01",
            city="Hyderabad",
            state="Telangana",
            office_address="Miyapur",
        ),
    )
    smart_id = uuid.UUID(ob["agency_id"])
    smart_ctx = {"agency_id": smart_id, "actor_id": ob["member"].id, "operating_mode": "free_external", "role": "agency_owner"}
    conn = db_session.query(CompanyAgencyConnection).filter(CompanyAgencyConnection.id == uuid.UUID(ob["connection_id"])).first()
    sign_agreement_version(db_session, conn, "agency", ob["member"].id, "Suresh")
    sign_agreement_version(db_session, conn, "company", abc_u.id, "ABC Dir")
    activate_connection(db_session, abc.id, abc_u.id, conn.id)
    db_session.commit()

    # Agency submits Mode 3 Lease booking request -> places central hold on Commercial Floor 3
    lead = create_agency_lead(db_session, smart_ctx, SimpleNamespace(full_name="Acme Corp", email="ops@acme.in", phone="+919800009999", source="Direct", notes="", customer_consent_given=True))
    lease_req = agency_submit_rental_or_lease_request(
        db_session,
        smart_ctx,
        SimpleNamespace(
            connection_id=conn.id,
            property_id=prop_lease.id,
            agency_lead_id=lead.id,
            booking_type="Lease",
            proposed_rent_amount=Decimal("100000.00"),
            proposed_deposit_amount=Decimal("600000.00"),
            advance_amount=Decimal("200000.00"),
            duration_months=36,
            lock_in_months=12,
            notice_period_days=90,
            escalation_frequency_months=12,
            escalation_percent=Decimal("5.00"),
            maintenance_responsibility="tenant",
            desired_start_date=date(2026, 12, 1),
            notes="3-year commercial lease",
        ),
    )
    assert lease_req.booking_type == "Lease" and prop_lease.status == "Reserved"

    # Commission: 2% of 85,00,000 = 1,70,000 -> survives connection termination!
    comm = create_commission_entry_from_agreement(
        db_session,
        abc.id,
        abc_u.id,
        SimpleNamespace(
            connection_id=conn.id,
            transaction_type="Sale",
            transaction_value=Decimal("8500000.00"),
            booking_id=None,
            rental_agreement_id=None,
            tax_deduction=Decimal("0.00"),
            other_deductions=Decimal("0.00"),
            notes="A-504 Sale Commission",
        ),
    )
    assert comm.gross_commission == Decimal("170000.00") and comm.net_payable == Decimal("170000.00")

    # Scenario J: Free -> Paid upgrade preserves agency.id, connection & commission!
    upgrade = upgrade_free_agency_to_paid(
        db_session,
        smart_ctx,
        SimpleNamespace(company_name="Smart Homes Realty Pvt Ltd", gst_number="36ABCDE1234F1Z5", rera_registration_number="TS-01", city="Hyderabad", state="Telangana", office_address="Miyapur"),
    )
    db_session.commit()
    paid_tenant_id = uuid.UUID(upgrade["tenant_id"])
    assert upgrade["agency_id"] == str(smart_id)
    assert upgrade["operating_mode"] == "paid_tenant"
    assert db_session.query(CompanyAgencyConnection).filter(CompanyAgencyConnection.agency_id == smart_id).count() == 1
    assert db_session.query(AgencyCommissionEntry).filter(AgencyCommissionEntry.agency_id == smart_id).count() == 1

    # Terminate connection -> earned commission STILL approvable & payable!
    transition_connection_status(db_session, conn, "Terminated", "company", abc_u.id, "Ended")
    act_on_commission_entry(db_session, abc.id, abc_u.id, comm.id, SimpleNamespace(action="Approve", payout_reference=None, notes="Approved post-term"))
    act_on_commission_entry(db_session, abc.id, abc_u.id, comm.id, SimpleNamespace(action="MarkPaid", payout_reference="NEFT-COMM-001", notes="Paid"))
    db_session.commit()
    assert comm.status == "Paid" and comm.payout_reference == "NEFT-COMM-001"

    # Paid Agency now independently manages its own Property Owner, Mandate, Option A & Option B Payouts!
    own_prop = Property(
        id=uuid.uuid4(),
        tenant_id=paid_tenant_id,
        name="Owner Flat 202",
        property_type="Apartment",
        listing_type="Rent",
        address="Kondapur",
        city="Hyderabad",
        state="Telangana",
        country="India",
        price=Decimal("19000.00"),
        status="Rented",
    )
    db_session.add(own_prop)
    db_session.flush()

    owner, portal_u = create_property_owner(
        db_session,
        paid_tenant_id,
        SimpleNamespace(full_name="Ramesh Landlord", email="ramesh@owner.in", phone="+919855555555", pan_number="ABCDE1234F", payout_details={"bank": "HDFC"}, portal_password="OwnerPassword!2026"),
    )
    assert portal_u is not None

    mandate_a = create_owner_mandate(
        db_session,
        paid_tenant_id,
        SimpleNamespace(owner_id=owner.id, property_id=own_prop.id, management_fee_type="percentage", management_fee_value=Decimal("8.00"), collection_authority="authorized_collection", starts_at=date(2026, 11, 1), expires_at=date(2027, 10, 31), termination_notice_days=30, agreement_text="Option A Mandate"),
    )
    owner_approve_mandate(db_session, paid_tenant_id, owner.id, mandate_a.id)

    ag = RentalAgreement(
        id=uuid.uuid4(),
        tenant_id=paid_tenant_id,
        property_id=own_prop.id,
        agreement_type="Rent",
        rent_amount=Decimal("19000.00"),
        customer_name="Tenant One",
        deposit_amount=Decimal("38000.00"),
        agreement_start=date(2026, 11, 1),
        agreement_end=date(2027, 9, 30),
        status="Active",
        owner_mandate_id=mandate_a.id,
    )
    db_session.add(ag)
    db_session.flush()

    # Option A: 19,000 rent - 8% (1,520) = 17,480 net payout (Pending until actual bank ref)
    payout_a = record_owner_payout_from_collection(
        db_session,
        paid_tenant_id,
        SimpleNamespace(mandate_id=mandate_a.id, rental_agreement_id=ag.id, rental_payment_id=None, rent_collected=Decimal("19000.00"), commission_deduction=Decimal("0.00"), approved_expenses=Decimal("0.00"), notes="Nov rent"),
    )
    assert payout_a.management_fee == Decimal("1520.00")
    assert payout_a.net_owner_payout == Decimal("17480.00")
    assert payout_a.status == "Pending"
    mark_owner_payout_paid(db_session, paid_tenant_id, payout_a.id, SimpleNamespace(bank_transfer_reference="IMPS-OWN-17480", notes="Transferred"))
    assert payout_a.status == "Paid"

    # Option B: Direct to owner -> net_owner_payout = 0, management_fee_receivable = 1,520
    mandate_b = create_owner_mandate(
        db_session,
        paid_tenant_id,
        SimpleNamespace(owner_id=owner.id, property_id=own_prop.id, management_fee_type="percentage", management_fee_value=Decimal("8.00"), collection_authority="direct_to_owner", starts_at=date(2026, 11, 1), expires_at=date(2027, 10, 31), termination_notice_days=30, agreement_text="Option B Mandate"),
    )
    owner_approve_mandate(db_session, paid_tenant_id, owner.id, mandate_b.id)
    payout_b = record_owner_payout_from_collection(
        db_session,
        paid_tenant_id,
        SimpleNamespace(mandate_id=mandate_b.id, rental_agreement_id=ag.id, rental_payment_id=None, rent_collected=Decimal("19000.00"), commission_deduction=Decimal("0.00"), approved_expenses=Decimal("0.00"), notes="Direct rent"),
    )
    assert payout_b.net_owner_payout == Decimal("0.00")
    assert payout_b.management_fee_receivable == Decimal("1520.00")
    assert payout_b.status == "Reconciled"
