"""Pure rental calculations shared by APIs and tests."""
import calendar
from datetime import date
from decimal import Decimal, ROUND_HALF_UP

CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def money(value) -> Decimal:
    return Decimal(str(value or 0)).quantize(CENT, rounding=ROUND_HALF_UP)


def add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year = value.year + month_index // 12
    month = month_index % 12 + 1
    day = min(value.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def period_months(frequency: str) -> int:
    try:
        return {"Monthly": 1, "Quarterly": 3, "Yearly": 12}[frequency]
    except KeyError as exc:
        raise ValueError("Unsupported rental payment frequency.") from exc


def lock_in_end_date(start_date: date, lock_in_months: int) -> date:
    return add_months(start_date, lock_in_months)


def calculate_deposit_settlement(
    deposit_balance: Decimal,
    rent_arrears: Decimal = ZERO,
    utility_charges: Decimal = ZERO,
    damage_charges: Decimal = ZERO,
    early_exit_charge: Decimal = ZERO,
    notice_shortfall_charge: Decimal = ZERO,
    other_charges: Decimal = ZERO,
) -> dict[str, Decimal]:
    """Calculate refund/debt without assuming that any contractual charge applies."""
    values = {
        "deposit_balance": money(deposit_balance),
        "rent_arrears": money(rent_arrears),
        "utility_charges": money(utility_charges),
        "damage_charges": money(damage_charges),
        "early_exit_charge": money(early_exit_charge),
        "notice_shortfall_charge": money(notice_shortfall_charge),
        "other_charges": money(other_charges),
    }
    if any(value < ZERO for value in values.values()):
        raise ValueError("Settlement amounts cannot be negative.")
    deductions = money(sum(values[key] for key in values if key != "deposit_balance"))
    return {
        **values,
        "deductions_total": deductions,
        "refund_amount": max(ZERO, money(values["deposit_balance"] - deductions)),
        "amount_due_from_tenant": max(ZERO, money(deductions - values["deposit_balance"])),
    }
