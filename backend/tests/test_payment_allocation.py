"""Installment-wise payment allocation and payment-status rules (pure logic, no database)."""
import unittest
from datetime import date, timedelta
from decimal import Decimal
from types import SimpleNamespace as NS
from uuid import uuid4

from app.services.payment_allocation import (
    IN_FLIGHT_STATUSES,
    PAYMENT_STATUSES,
    installment_position,
    sync_installment_status,
)

TODAY = date(2026, 11, 19)
FUTURE = TODAY + timedelta(days=30)
PAST = TODAY - timedelta(days=5)


def installment(amount="2225000.00", due=FUTURE, status="Pending"):
    return NS(id=uuid4(), amount=Decimal(amount), due_date=due, status=status)


def pay(inst, amount, status="Verified"):
    return NS(id=uuid4(), installment_id=inst.id if inst else None, amount=Decimal(amount), status=status)


def refund(payment, amount):
    return NS(payment_id=payment.id, amount=Decimal(amount))


class StatusTests(unittest.TestCase):
    def test_status_set(self):
        self.assertEqual(set(PAYMENT_STATUSES), {"Pending", "Under Verification", "Verified", "Rejected", "Failed"})
        self.assertEqual(set(IN_FLIGHT_STATUSES), {"Pending", "Under Verification"})


class PositionTests(unittest.TestCase):
    def test_untouched_installment_is_upcoming(self):
        i = installment()
        p = installment_position(i, [], [], today=TODAY)
        self.assertEqual((p["paid"], p["outstanding"], p["payable"], p["state"]), (Decimal("0.00"), Decimal("2225000.00"), Decimal("2225000.00"), "Upcoming"))

    def test_partial_payment_tracks_paid_and_remaining(self):
        i = installment()
        p = installment_position(i, [pay(i, "1000000")], [], today=TODAY)
        self.assertEqual((p["paid"], p["outstanding"], p["state"]), (Decimal("1000000.00"), Decimal("1225000.00"), "Partially Paid"))

    def test_two_partials_complete_the_installment(self):
        i = installment()
        p = installment_position(i, [pay(i, "1000000"), pay(i, "1225000")], [], today=TODAY)
        self.assertEqual((p["outstanding"], p["payable"], p["state"]), (Decimal("0.00"), Decimal("0.00"), "Paid"))

    def test_in_flight_money_reserves_balance_but_is_not_paid(self):
        i = installment()
        for status in IN_FLIGHT_STATUSES:
            p = installment_position(i, [pay(i, "500000", status)], [], today=TODAY)
            self.assertEqual(p["paid"], Decimal("0.00"))
            self.assertEqual(p["pending"], Decimal("500000.00"))
            self.assertEqual(p["payable"], Decimal("1725000.00"))
            self.assertEqual(p["state"], "Pending Verification")

    def test_rejected_and_failed_never_count(self):
        i = installment()
        p = installment_position(i, [pay(i, "500000", "Rejected"), pay(i, "700000", "Failed")], [], today=TODAY)
        self.assertEqual((p["paid"], p["pending"], p["payable"]), (Decimal("0.00"), Decimal("0.00"), Decimal("2225000.00")))

    def test_other_installments_and_token_are_not_double_counted(self):
        a, b = installment(), installment()
        token = pay(None, "100000")
        p = installment_position(a, [pay(b, "2225000"), token], [], today=TODAY)
        self.assertEqual(p["paid"], Decimal("0.00"))

    def test_processed_refund_reopens_balance(self):
        i = installment()
        paid = pay(i, "2225000")
        p = installment_position(i, [paid], [refund(paid, "225000")], today=TODAY)
        self.assertEqual((p["paid"], p["outstanding"], p["state"]), (Decimal("2000000.00"), Decimal("225000.00"), "Partially Paid"))

    def test_overdue_and_cancelled_plan(self):
        i = installment(due=PAST)
        self.assertEqual(installment_position(i, [], [], today=TODAY)["state"], "Overdue")
        self.assertEqual(installment_position(i, [], [], today=TODAY, plan_status="Cancelled")["state"], "Cancelled")
        self.assertEqual(installment_position(i, [pay(i, "2225000")], [], today=TODAY)["state"], "Paid")

    def test_paisa_exact(self):
        i = installment("100.10")
        p = installment_position(i, [pay(i, "0.10"), pay(i, "100.00")], [], today=TODAY)
        self.assertEqual(p["outstanding"], Decimal("0.00"))


class SyncTests(unittest.TestCase):
    def test_follows_the_money(self):
        i = installment()
        part = pay(i, "1000000")
        self.assertEqual(sync_installment_status(i, [part], [], today=TODAY), "Partially Paid")
        rest = pay(i, "1225000")
        self.assertEqual(sync_installment_status(i, [part, rest], [], today=TODAY), "Paid")

    def test_refund_walks_status_back(self):
        i = installment(status="Paid")
        full = pay(i, "2225000")
        self.assertEqual(sync_installment_status(i, [full], [refund(full, "2225000")], today=TODAY), "Pending")
        self.assertEqual(sync_installment_status(i, [full], [refund(full, "5")], today=TODAY), "Partially Paid")

    def test_overdue_flag_kept_only_while_still_unpaid_and_past_due(self):
        i = installment(due=PAST, status="Overdue")
        self.assertEqual(sync_installment_status(i, [], [], today=TODAY), "Overdue")
        j = installment(due=FUTURE, status="Overdue")
        self.assertEqual(sync_installment_status(j, [], [], today=TODAY), "Pending")


if __name__ == "__main__":
    unittest.main()
