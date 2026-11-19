"""Booking payment statuses and installment-wise allocation maths.

One place for the rules that used to be repeated inline across the payment, payment-plan, customer-portal,
refund and worker code, so staff and customer views of an installment can never disagree.

Payment lifecycle
    Pending             recorded (by staff) or submitted (by the customer); awaiting a finance decision
    Under Verification  a finance user has picked it up for review
    Verified            confirmed received - the ONLY status that counts as paid
    Rejected            declined by finance
    Failed              the payment did not go through (e.g. bounced instrument / failed transfer)

"In flight" payments (Pending, Under Verification) are not paid, but they reserve balance so the same money cannot
be submitted twice.  Rejected and Failed payments never count and release their balance.

Installment allocation
    Every payment of a booking with an active plan is linked to exactly one installment (payments.installment_id).
    Partial payments are several payments against the same installment.  For each installment:
        paid        = verified payments linked to it - processed refunds of those payments
        pending     = in-flight payments linked to it
        outstanding = amount - paid
        payable     = outstanding - pending          (the most a NEW payment may be)
"""
from __future__ import annotations

from datetime import date
from decimal import Decimal
from typing import Iterable

ZERO = Decimal("0.00")
CENT = Decimal("0.01")

PAYMENT_STATUSES = ("Pending", "Under Verification", "Verified", "Rejected", "Failed")
IN_FLIGHT_STATUSES = ("Pending", "Under Verification")
# Statuses a finance user may move an in-flight payment to.
DECISION_STATUSES = ("Under Verification", "Verified", "Rejected", "Failed")


def money(value) -> Decimal:
    return Decimal(str(value if value is not None else 0)).quantize(CENT)


def is_in_flight(status: str) -> bool:
    return status in IN_FLIGHT_STATUSES


def installment_position(
    installment,
    payments: Iterable,
    processed_refunds: Iterable,
    *,
    today: date | None = None,
    plan_status: str = "Active",
) -> dict:
    """Paid / pending / outstanding / payable amounts and a display state for one installment.

    `payments` may contain every payment of the booking (any status, any installment); `processed_refunds` the
    processed refunds of the booking.  Only rows that belong to this installment are used.
    """
    today = today or date.today()
    linked = [p for p in payments if getattr(p, "installment_id", None) == installment.id]
    verified = [p for p in linked if p.status == "Verified"]
    verified_ids = {p.id for p in verified}
    gross = sum((money(p.amount) for p in verified), ZERO)
    refunded = sum((money(r.amount) for r in processed_refunds if r.payment_id in verified_ids), ZERO)
    paid = max(ZERO, gross - refunded)
    pending = sum((money(p.amount) for p in linked if p.status in IN_FLIGHT_STATUSES), ZERO)
    amount = money(installment.amount)
    outstanding = max(ZERO, amount - paid)
    payable = max(ZERO, outstanding - pending)

    if outstanding == ZERO:
        state = "Paid"
    elif plan_status == "Cancelled":
        state = "Cancelled"
    elif installment.due_date < today:
        state = "Overdue"
    elif paid > ZERO:
        state = "Partially Paid"
    elif pending > ZERO:
        state = "Pending Verification"
    else:
        state = "Upcoming"

    return {
        "verified_gross": gross,
        "refunded": refunded,
        "paid": paid,
        "pending": pending,
        "outstanding": outstanding,
        "payable": payable,
        "state": state,
    }


def sync_installment_status(installment, payments: Iterable, processed_refunds: Iterable, *, today: date | None = None) -> str:
    """Re-derives the STORED installment status from the verified money.  Call after any verification or refund.

    Paid / Partially Paid follow the money.  An installment with nothing paid keeps 'Overdue' if the reminder job
    already flagged it and it is still past due, otherwise it is 'Pending'.
    """
    today = today or date.today()
    pos = installment_position(installment, payments, processed_refunds, today=today)
    if pos["outstanding"] == ZERO:
        installment.status = "Paid"
    elif pos["paid"] > ZERO:
        installment.status = "Partially Paid"
    elif installment.status == "Overdue" and installment.due_date < today:
        installment.status = "Overdue"
    else:
        installment.status = "Pending"
    return installment.status
