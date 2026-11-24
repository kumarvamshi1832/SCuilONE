"""
- Scenario G: Strict cross-tenant & cross-agency isolation (direct service/API authorization checks)
- Transactional NotificationOutbox idempotency, retry backoff, and DeadLetter behavior
- Automated worker expiry for stale invitations & expired connections (revoking inventory while preserving history)
"""
from __future__ import annotations

import uuid
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.models.agency import (
    AgencyAgreementVersion,
    AgencyInvitation,
    AgencyNotification,
    AgencyPropertyAccess,
    CompanyAgencyConnection,
)
from app.models.notification_outbox import NotificationOutbox
from app.models.property import Property
from app.models.tenant import Tenant
from app.models.user import User
from app.services.agency_collaboration import (
    activate_connection,
    complete_invitation_onboarding,
    create_company_agency_invitation,
    list_agency_authorized_properties,
    provision_real_estate_business_entities,
    sign_agreement_version,
)
from app.services.agency_workflow import assert_agency_property_authorized
from app.services.outbox_service import (
    enqueue_outbox_event,
    expire_stale_agency_invitations_and_connections,
    process_notification_outbox,
)


def _utc_now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def test_scenario_g_cross_tenant_isolation_outbox_and_worker_expiry(db_session):
    co_a = Tenant(id=uuid.uuid4(), name="Company A", industry="Real Estate", business_type="real_estate_company", status="Active")
    co_b = Tenant(id=uuid.uuid4(), name="Company B", industry="Real Estate", business_type="real_estate_company", status="Active")
    db_session.add_all([co_a, co_b])
    db_session.flush()
    u_a = User(id=uuid.uuid4(), tenant_id=co_a.id, full_name="Admin A", email="a@coa.in", password="x", status="Active")
    u_b = User(id=uuid.uuid4(), tenant_id=co_b.id, full_name="Admin B", email="b@cob.in", password="x", status="Active")
    db_session.add_all([u_a, u_b])
    db_session.flush()
    provision_real_estate_business_entities(db_session, co_a, u_a)
    provision_real_estate_business_entities(db_session, co_b, u_b)

    prop_a_shared = Property(id=uuid.uuid4(), tenant_id=co_a.id, name="A-Shared", property_type="Apartment", listing_type="Sale", address="Hyd", city="Hyderabad", state="TS", country="India", price=Decimal("5000000"), status="Available")
    prop_a_private = Property(id=uuid.uuid4(), tenant_id=co_a.id, name="A-Private", property_type="Apartment", listing_type="Sale", address="Hyd", city="Hyderabad", state="TS", country="India", price=Decimal("6000000"), status="Available")
    prop_b_private = Property(id=uuid.uuid4(), tenant_id=co_b.id, name="B-Private", property_type="Apartment", listing_type="Sale", address="Hyd", city="Hyderabad", state="TS", country="India", price=Decimal("7000000"), status="Available")
    db_session.add_all([prop_a_shared, prop_a_private, prop_b_private])
    db_session.commit()

    # Connect Agency 1 to Company A with ONLY prop_a_shared and past expiry_date for expiry worker test later
    _, tok, _, _ = create_company_agency_invitation(
        db_session,
        co_a.id,
        u_a.id,
        SimpleNamespace(
            agency_name="Isolated Agency",
            contact_name="Kiran",
            email="kiran@iso.in",
            phone="+919833333333",
            business_details=None,
            can_sale=True,
            can_rent=False,
            can_lease=False,
            sharing_scope="selected_properties",
            property_ids=[prop_a_shared.id],
            commission_terms=SimpleNamespace(model_dump=lambda mode="json": {"sale": {"structure": "percentage", "value": "2.00"}}),
            responsibilities={},
            agreement_text="Isolated",
            start_date=date(2026, 1, 1),
            expiry_date=date(2026, 10, 1),
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
            full_name="Kiran",
            rera_registration_number=None,
            city="Hyderabad",
            state="TS",
            office_address="Hyd",
        ),
    )
    ag_id = uuid.UUID(ob["agency_id"])
    conn_a = db_session.query(CompanyAgencyConnection).filter(CompanyAgencyConnection.id == uuid.UUID(ob["connection_id"])).first()
    sign_agreement_version(db_session, conn_a, "agency", ob["member"].id, "Kiran")
    sign_agreement_version(db_session, conn_a, "company", u_a.id, "Admin A")
    activate_connection(db_session, co_a.id, u_a.id, conn_a.id)
    db_session.commit()

    # Scenario G: Authorized property passes; unshared Company A property & Company B property MUST fail!
    assert_agency_property_authorized(db_session, ag_id, conn_a.id, prop_a_shared.id, required_transaction_type="Sale")

    with pytest.raises(HTTPException) as exc_priv:
        assert_agency_property_authorized(db_session, ag_id, conn_a.id, prop_a_private.id, required_transaction_type="Sale")
    assert exc_priv.value.status_code == 403

    with pytest.raises(HTTPException) as exc_cross:
        assert_agency_property_authorized(db_session, ag_id, conn_a.id, prop_b_private.id, required_transaction_type="Sale")
    assert exc_cross.value.status_code == 404

    with pytest.raises(HTTPException) as exc_rent:
        assert_agency_property_authorized(db_session, ag_id, conn_a.id, prop_a_shared.id, required_transaction_type="Rent")
    assert exc_rent.value.status_code == 403

    # Outbox idempotency: duplicate idempotency_key creates only 1 outbox row and delivers 1 notification
    o1 = enqueue_outbox_event(db_session, channel="agency_in_app", event_type="test_evt", agency_id=ag_id, title="Hello", message="World", idempotency_key="idem:unique:1")
    o2 = enqueue_outbox_event(db_session, channel="agency_in_app", event_type="test_evt", agency_id=ag_id, title="Hello", message="World", idempotency_key="idem:unique:1")
    assert o1.id == o2.id
    res = process_notification_outbox(db_session)
    assert res["sent"] == 1
    assert db_session.query(AgencyNotification).filter(AgencyNotification.idempotency_key == f"outbox:{o1.id}").count() == 1

    # Outbox retry & DeadLetter on persistent email failure
    o_fail = enqueue_outbox_event(db_session, channel="email", event_type="test_email", recipient_email="x@y.in", title="Fail", message="Msg", max_attempts=2)
    def _boom(_item): raise RuntimeError("SMTP down")
    r1 = process_notification_outbox(db_session, now=_utc_now() + timedelta(seconds=1), email_sender=_boom)
    assert r1["failed"] == 1 and o_fail.status == "Failed"
    r2 = process_notification_outbox(db_session, now=_utc_now() + timedelta(hours=2), email_sender=_boom)
    assert r2["dead_letter"] == 1 and o_fail.status == "DeadLetter"

    # Worker expiry: conn_a expired on 2026-10-01 -> revokes inventory, preserves agreement versions, enqueues outbox notice!
    exp_res = expire_stale_agency_invitations_and_connections(db_session, now=_utc_now(), today=date(2026, 11, 21))
    db_session.commit()
    assert exp_res["expired_connections"] == 1
    assert list_agency_authorized_properties(db_session, ag_id) == []
    assert db_session.query(AgencyAgreementVersion).filter(AgencyAgreementVersion.connection_id == conn_a.id).count() == 1
