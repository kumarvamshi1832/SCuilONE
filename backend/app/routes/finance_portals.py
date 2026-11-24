
from __future__ import annotations

from datetime import datetime, timezone
from decimal import Decimal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.agency_auth import require_agency_actor, require_real_estate_company
from app.core.dependencies import get_db, require_active_user
from app.core.security import decode_access_token
from app.models.finance_portals import (
    AgencyCommissionEntry,
    OwnerAgencyMandate,
    OwnerPayoutLedger,
    OwnerPortalSession,
    OwnerPortalUser,
    PropertyOwner,
)
from app.models.property import Property
from app.models.rental import RentalAgreement
from app.routes.customer_portal import require_portal_user
from app.schemas.finance_portals import (
    AgencyCustomerCommissionIn,
    AgencyCustomerCommissionMarkPaidIn,
    AgencyRentalBookingRequestIn,
    CommissionActionIn,
    CommissionCalculateIn,
    FreeAgencyUpgradeIn,
    LeaseEscalationPreviewIn,
    OwnerMandateCreateIn,
    OwnerPayoutMarkPaidIn,
    OwnerPayoutRecordIn,
    OwnerPortalLoginIn,
    PropertyOwnerCreateIn,
)
from app.services.finance_portals import (
    act_on_commission_entry,
    agency_submit_rental_or_lease_request,
    create_commission_entry_from_agreement,
    create_owner_mandate,
    create_property_owner,
    get_customer_portal_experience_profile,
    login_owner_portal,
    mark_agency_customer_commission_paid,
    mark_owner_payout_paid,
    record_agency_customer_commission,
    owner_approve_mandate,
    preview_lease_escalation_schedule,
    record_owner_payout_from_collection,
    upgrade_free_agency_to_paid,
)

router = APIRouter(tags=["Real Estate Finance, Commissions & Owner Portal"])
_owner_bearer = HTTPBearer(auto_error=False)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def require_owner_portal_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(_owner_bearer),
    db: Session = Depends(get_db),
) -> dict:
    if not credentials or not credentials.credentials:
        raise HTTPException(status_code=401, detail="Owner portal authentication required.")
    payload = decode_access_token(credentials.credentials)
    if payload.get("portal_type") != "owner" or payload.get("token_type") != "access":
        raise HTTPException(status_code=401, detail="Invalid owner portal token.")
    try:
        tenant_id = UUID(str(payload["tenant_id"]))
        owner_id = UUID(str(payload["owner_id"]))
        portal_user_id = UUID(str(payload["owner_portal_user_id"]))
        sid = UUID(str(payload["sid"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid owner portal token identifiers.")

    session = (
        db.query(OwnerPortalSession)
        .filter(
            OwnerPortalSession.id == sid,
            OwnerPortalSession.owner_portal_user_id == portal_user_id,
            OwnerPortalSession.revoked.is_(False),
            OwnerPortalSession.expires_at > _utc_now(),
        )
        .first()
    )
    if not session:
        raise HTTPException(status_code=401, detail="Owner portal session expired or revoked.")
    return {"tenant_id": tenant_id, "owner_id": owner_id, "owner_portal_user_id": portal_user_id}



@router.post("/api/v1/rentals/lease-escalation/preview")
def post_lease_escalation_preview(payload: LeaseEscalationPreviewIn):
    return {
        "base_rent": str(payload.base_rent),
        "duration_months": payload.duration_months,
        "escalation_frequency_months": payload.escalation_frequency_months,
        "escalation_percent": str(payload.escalation_percent),
        "schedule": preview_lease_escalation_schedule(
            payload.base_rent, payload.duration_months, payload.escalation_frequency_months, payload.escalation_percent
        ),
    }


@router.post("/api/v1/agency/rental-booking-requests", status_code=201)
def post_agency_rental_booking_request(
    payload: AgencyRentalBookingRequestIn,
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    req = agency_submit_rental_or_lease_request(db, agency_ctx, payload)
    db.commit()
    return {
        "id": str(req.id),
        "booking_type": req.booking_type,
        "status": req.status,
        "hold_expires_at": req.hold_expires_at.isoformat() if req.hold_expires_at else None,
    }




@router.post("/api/v1/agency/upgrade-to-paid")
def post_upgrade_free_agency(
    payload: FreeAgencyUpgradeIn,
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    result = upgrade_free_agency_to_paid(db, agency_ctx, payload)
    db.commit()
    return result




@router.post("/api/v1/company/commissions", status_code=201)
def post_company_commission(
    payload: CommissionCalculateIn,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    entry = create_commission_entry_from_agreement(db, company_ctx["tenant_uuid"], company_ctx["user_uuid"], payload)
    db.commit()
    return {
        "id": str(entry.id),
        "gross_commission": str(entry.gross_commission),
        "net_payable": str(entry.net_payable),
        "status": entry.status,
    }


@router.post("/api/v1/company/commissions/{entry_id}/action")
def post_company_commission_action(
    entry_id: UUID,
    payload: CommissionActionIn,
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    entry = act_on_commission_entry(db, company_ctx["tenant_uuid"], company_ctx["user_uuid"], entry_id, payload)
    db.commit()
    return {"id": str(entry.id), "status": entry.status, "payout_reference": entry.payout_reference}


@router.get("/api/v1/company/commissions/summary")
def get_company_commissions_summary(
    company_ctx: dict = Depends(require_real_estate_company),
    db: Session = Depends(get_db),
):
    rows = db.query(AgencyCommissionEntry).filter(AgencyCommissionEntry.company_tenant_id == company_ctx["tenant_uuid"]).all()
    return {
        "total_entries": len(rows),
        "eligible_total": str(sum((Decimal(str(r.net_payable)) for r in rows if r.status == "Eligible"), Decimal("0.00"))),
        "approved_total": str(sum((Decimal(str(r.net_payable)) for r in rows if r.status == "Approved"), Decimal("0.00"))),
        "paid_total": str(sum((Decimal(str(r.net_payable)) for r in rows if r.status == "Paid"), Decimal("0.00"))),
    }


@router.post("/api/v1/agency/commissions/customer-side", status_code=201)
def post_agency_customer_commission(
    payload: AgencyCustomerCommissionIn,
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    entry = record_agency_customer_commission(db, agency_ctx, payload)
    db.commit()
    return {
        "id": str(entry.id),
        "payer": entry.payer,
        "transaction_type": entry.transaction_type,
        "gross_commission": str(entry.gross_commission),
        "net_payable": str(entry.net_payable),
        "status": entry.status,
        "payout_reference": entry.payout_reference,
    }


@router.post("/api/v1/agency/commissions/{entry_id}/mark-customer-paid")
def post_mark_agency_customer_commission_paid(
    entry_id: UUID,
    payload: AgencyCustomerCommissionMarkPaidIn,
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    entry = mark_agency_customer_commission_paid(db, agency_ctx, entry_id, payload)
    db.commit()
    return {
        "id": str(entry.id),
        "payer": entry.payer,
        "status": entry.status,
        "payout_reference": entry.payout_reference,
    }


@router.get("/api/v1/agency/commissions/summary")
def get_agency_commissions_summary(
    agency_ctx: dict = Depends(require_agency_actor),
    db: Session = Depends(get_db),
):
    rows = db.query(AgencyCommissionEntry).filter(AgencyCommissionEntry.agency_id == agency_ctx["agency_id"]).all()
    by_payer = {}
    for p in ("company", "customer", "owner", "split"):
        p_rows = [r for r in rows if r.payer == p]
        by_payer[p] = {
            "count": len(p_rows),
            "paid_total": str(sum((Decimal(str(r.net_payable)) for r in p_rows if r.status == "Paid"), Decimal("0.00"))),
            "pending_total": str(sum((Decimal(str(r.net_payable)) for r in p_rows if r.status in ("Eligible", "Approved")), Decimal("0.00"))),
        }
    return {
        "total_entries": len(rows),
        "eligible_total": str(sum((Decimal(str(r.net_payable)) for r in rows if r.status == "Eligible"), Decimal("0.00"))),
        "approved_total": str(sum((Decimal(str(r.net_payable)) for r in rows if r.status == "Approved"), Decimal("0.00"))),
        "paid_total": str(sum((Decimal(str(r.net_payable)) for r in rows if r.status == "Paid"), Decimal("0.00"))),
        "by_payer": by_payer,
        "items": [
            {
                "id": str(r.id),
                "company_tenant_id": str(r.company_tenant_id),
                "payer": r.payer,
                "transaction_type": r.transaction_type,
                "net_payable": str(r.net_payable),
                "status": r.status,
                "payout_reference": r.payout_reference,
            }
            for r in rows
        ],
    }



@router.post("/api/v1/property-owners", status_code=201)
def post_property_owner(
    payload: PropertyOwnerCreateIn,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    from app.models.tenant import Tenant

    tenant_uuid = UUID(str(current_user["tenant_id"]))
    owner, portal = create_property_owner(db, tenant_uuid, payload)
    tenant = db.query(Tenant).filter(Tenant.id == tenant_uuid).first()
    org_name = tenant.name if tenant else "SCuilONE Real Estate"
    db.commit()

    email_sent = False
    email_error = None
    if portal is not None and owner.email:
        try:
            from app.services.email_service import send_owner_portal_welcome_email

            send_owner_portal_welcome_email(
                recipient_email=owner.email,
                owner_name=owner.full_name,
                organization_name=org_name,
            )
            email_sent = True
        except Exception as exc:
            email_error = str(exc)[:300]
            try:
                from app.services.outbox_service import enqueue_outbox_event

                enqueue_outbox_event(
                    db,
                    channel="email",
                    event_type="owner_portal_welcome",
                    tenant_id=tenant_uuid,
                    recipient_email=owner.email,
                    title=f"Welcome to your Property Owner Portal ({org_name})",
                    message=f"Hello {owner.full_name}, your Property Owner Portal is ready for {owner.email}.",
                    idempotency_key=f"owner_welcome:{owner.id}",
                )
                db.commit()
            except Exception:
                db.rollback()

    return {
        "id": str(owner.id),
        "full_name": owner.full_name,
        "portal_enabled": portal is not None,
        "email_sent": email_sent,
        "email_error": email_error,
    }


@router.post("/api/v1/owner-mandates", status_code=201)
def post_owner_mandate(
    payload: OwnerMandateCreateIn,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    mandate = create_owner_mandate(db, UUID(str(current_user["tenant_id"])), payload)
    db.commit()
    return {"id": str(mandate.id), "status": mandate.status, "collection_authority": mandate.collection_authority}


@router.post("/api/v1/owner-payouts", status_code=201)
def post_owner_payout(
    payload: OwnerPayoutRecordIn,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    ledger = record_owner_payout_from_collection(db, UUID(str(current_user["tenant_id"])), payload)
    db.commit()
    return {
        "id": str(ledger.id),
        "collection_mode": ledger.collection_mode,
        "rent_collected": str(ledger.rent_collected),
        "management_fee": str(ledger.management_fee),
        "net_owner_payout": str(ledger.net_owner_payout),
        "management_fee_receivable": str(ledger.management_fee_receivable),
        "status": ledger.status,
    }


@router.post("/api/v1/owner-payouts/{ledger_id}/mark-paid")
def post_mark_owner_payout_paid(
    ledger_id: UUID,
    payload: OwnerPayoutMarkPaidIn,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    ledger = mark_owner_payout_paid(db, UUID(str(current_user["tenant_id"])), ledger_id, payload)
    db.commit()
    return {"id": str(ledger.id), "status": ledger.status, "bank_transfer_reference": ledger.bank_transfer_reference}



@router.post("/api/v1/owner-portal/auth/login")
def post_owner_portal_login(payload: OwnerPortalLoginIn, db: Session = Depends(get_db)):
    result = login_owner_portal(db, payload.email, payload.password)
    db.commit()
    return result


@router.post("/api/v1/owner-portal/mandates/{mandate_id}/approve")
def post_owner_approve_mandate(
    mandate_id: UUID,
    owner_ctx: dict = Depends(require_owner_portal_user),
    db: Session = Depends(get_db),
):
    mandate = owner_approve_mandate(db, owner_ctx["tenant_id"], owner_ctx["owner_id"], mandate_id)
    db.commit()
    return {"id": str(mandate.id), "status": mandate.status}


@router.get("/api/v1/owner-portal/statements")
def get_owner_portal_statements(
    owner_ctx: dict = Depends(require_owner_portal_user),
    db: Session = Depends(get_db),
):
    mandates = (
        db.query(OwnerAgencyMandate)
        .filter(OwnerAgencyMandate.tenant_id == owner_ctx["tenant_id"], OwnerAgencyMandate.owner_id == owner_ctx["owner_id"])
        .all()
    )
    prop_ids = [m.property_id for m in mandates]
    props = db.query(Property).filter(Property.id.in_(prop_ids)).all() if prop_ids else []
    ledgers = (
        db.query(OwnerPayoutLedger)
        .filter(OwnerPayoutLedger.tenant_id == owner_ctx["tenant_id"], OwnerPayoutLedger.owner_id == owner_ctx["owner_id"])
        .order_by(OwnerPayoutLedger.created_at.desc())
        .all()
    )
    return {
        "owner_id": str(owner_ctx["owner_id"]),
        "properties": [{"id": str(p.id), "name": p.name, "status": p.status, "listing_type": p.listing_type} for p in props],
        "payouts": [
            {
                "id": str(l.id),
                "collection_mode": l.collection_mode,
                "rent_collected": str(l.rent_collected),
                "management_fee": str(l.management_fee),
                "net_owner_payout": str(l.net_owner_payout),
                "management_fee_receivable": str(l.management_fee_receivable),
                "status": l.status,
                "bank_transfer_reference": l.bank_transfer_reference,
            }
            for l in ledgers
        ],
    }



@router.get("/api/v1/customer-portal/experience-profile")
def get_portal_experience_profile(
    portal_ctx: dict = Depends(require_portal_user),
    db: Session = Depends(get_db),
):
    return get_customer_portal_experience_profile(db, portal_ctx)
