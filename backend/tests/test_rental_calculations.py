from datetime import date
from decimal import Decimal

import pytest

from app.services.rental_calculations import (
    add_months,
    calculate_deposit_settlement,
    lock_in_end_date,
    period_months,
)


def test_month_addition_handles_month_end_and_leap_year():
    assert add_months(date(2026, 1, 31), 1) == date(2026, 2, 28)
    assert add_months(date(2024, 1, 31), 1) == date(2024, 2, 29)
    assert add_months(date(2026, 11, 19), 3) == date(2027, 2, 19)


def test_lock_in_end_date():
    assert lock_in_end_date(date(2026, 12, 1), 6) == date(2027, 6, 1)


def test_payment_frequency_month_count():
    assert period_months("Monthly") == 1
    assert period_months("Quarterly") == 3
    assert period_months("Yearly") == 12
    with pytest.raises(ValueError):
        period_months("Weekly")


def test_ravi_early_exit_settlement_example():
    result = calculate_deposit_settlement(
        deposit_balance=Decimal("500000"),
        rent_arrears=Decimal("0"),
        utility_charges=Decimal("0"),
        damage_charges=Decimal("0"),
        early_exit_charge=Decimal("25000"),
    )
    assert result["deductions_total"] == Decimal("25000.00")
    assert result["refund_amount"] == Decimal("475000.00")
    assert result["amount_due_from_tenant"] == Decimal("0.00")


def test_settlement_can_show_extra_amount_due_when_charges_exceed_deposit():
    result = calculate_deposit_settlement(
        deposit_balance=Decimal("50000"),
        rent_arrears=Decimal("30000"),
        damage_charges=Decimal("25000"),
    )
    assert result["refund_amount"] == Decimal("0.00")
    assert result["amount_due_from_tenant"] == Decimal("5000.00")


def test_settlement_rejects_negative_values():
    with pytest.raises(ValueError):
        calculate_deposit_settlement(deposit_balance=Decimal("100"), damage_charges=Decimal("-1"))
