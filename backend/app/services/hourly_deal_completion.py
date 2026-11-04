"""Completion gate for hourly (Time & Material) software deals."""
from datetime import datetime
from decimal import Decimal

from sqlalchemy import func
from sqlalchemy.orm import Session

from app.models.activity import Activity
from app.models.activity_link import ActivityLink
from app.models.deal import Deal
from app.models.software_contract import SoftwareContract
from app.models.software_invoice import SoftwareInvoice, SoftwareInvoiceItem, SoftwareInvoicePayment, SoftwareCreditNote
from app.models.software_project import SoftwareProject
from app.models.software_time_entry import SoftwareTimeEntry


def maybe_mark_hourly_deal_won(db: Session, tenant_id, project_id) -> bool:
    """Mark linked Deal Won only after project completion and all billable time is invoiced/paid."""
    project = db.query(SoftwareProject).filter(
        SoftwareProject.id == project_id,
        SoftwareProject.tenant_id == tenant_id,
    ).first()
    if not project or project.status != "Completed" or not project.deal_id:
        return False

    contract = db.query(SoftwareContract).filter(
        SoftwareContract.id == project.software_contract_id,
        SoftwareContract.tenant_id == tenant_id,
        SoftwareContract.billing_type == "Time & Material",
    ).first()
    if not contract or not contract.deal_id:
        return False

    # Fetch all billable, approved entries attached to this project through ActivityLink.
    billable_entries = db.query(SoftwareTimeEntry.id).join(
        Activity, Activity.id == SoftwareTimeEntry.activity_id
    ).join(
        ActivityLink, ActivityLink.activity_id == Activity.id
    ).filter(
        SoftwareTimeEntry.tenant_id == tenant_id,
        Activity.tenant_id == tenant_id,
        ActivityLink.tenant_id == tenant_id,
        ActivityLink.module == "software_project",
        ActivityLink.record_id == project.id,
        SoftwareTimeEntry.is_billable.is_(True),
        SoftwareTimeEntry.billing_status == "Approved",
    ).subquery()

    # Every approved billable entry must be associated with an invoice item.
    uninvoiced = db.query(SoftwareTimeEntry.id).filter(
        SoftwareTimeEntry.id.in_(db.query(billable_entries.c.id)),
        ~SoftwareTimeEntry.id.in_(db.query(SoftwareInvoiceItem.time_entry_id).filter(
            SoftwareInvoiceItem.tenant_id == tenant_id,
            SoftwareInvoiceItem.time_entry_id.is_not(None),
        )),
    ).first()
    if uninvoiced:
        return False

    invoices = db.query(SoftwareInvoice).filter(
        SoftwareInvoice.tenant_id == tenant_id,
        SoftwareInvoice.project_id == project.id,
        SoftwareInvoice.software_contract_id == contract.id,
        SoftwareInvoice.status != "Void",
    ).all()

    # No invoices yet means there is no final amount to settle for hourly work.
    if not invoices:
        return False

    total_paid = Decimal("0.00")
    for invoice in invoices:
        received = db.query(func.coalesce(func.sum(SoftwareInvoicePayment.amount), 0)).filter(
            SoftwareInvoicePayment.tenant_id == tenant_id,
            SoftwareInvoicePayment.invoice_id == invoice.id,
            SoftwareInvoicePayment.status == "Received",
        ).scalar() or Decimal("0.00")
        total_paid += Decimal(str(received))
        credited = db.query(func.coalesce(func.sum(SoftwareCreditNote.amount), 0)).filter(
            SoftwareCreditNote.tenant_id == tenant_id,
            SoftwareCreditNote.invoice_id == invoice.id,
        ).scalar() or Decimal("0.00")
        if Decimal(str(invoice.total_amount)) - Decimal(str(received)) - Decimal(str(credited)) > Decimal("0.005"):
            return False

    deal = db.query(Deal).filter(
        Deal.id == contract.deal_id,
        Deal.tenant_id == tenant_id,
    ).with_for_update().first()
    if not deal or deal.stage == "Won":
        return False

    # Hourly Deal amount reflects the actual money received, not the estimate.
    # Fixed Price Deals continue to use their existing payment-sync behavior.
    deal.amount = total_paid
    deal.stage = "Won"
    deal.updated_at = datetime.utcnow()
    return True
