"""Weighted sales forecast: open deal amount x stage win probability."""
import uuid
from collections import defaultdict
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models.deal import Deal
from app.models.pipeline import PipelineStage
from app.models.user import User

WON_NAMES = {"won", "closed won", "closed_won", "closed-won"}
LOST_NAMES = {"lost", "closed lost", "closed_lost", "closed-lost"}
DEFAULT_OPEN_PROBABILITY = 20  # used when a deal's stage has no probability set


def _norm(v: str | None) -> str:
    return (v or "").strip().lower()


def _money(v: Decimal | float | int) -> float:
    return float(round(Decimal(str(v)), 2))


def _add_months(first_of_month: date, n: int) -> date:
    total = first_of_month.month - 1 + n
    return date(first_of_month.year + total // 12, total % 12 + 1, 1)


def classify_deal(deal_stage: str | None, stage_row) -> tuple[str, int]:
    """Return ('open'|'won'|'lost', probability%)."""
    name = _norm(stage_row.name if stage_row is not None else deal_stage)
    is_won = bool(stage_row and stage_row.is_closed_won) or _norm(deal_stage) in WON_NAMES or name in WON_NAMES
    is_lost = bool(stage_row and stage_row.is_closed_lost) or _norm(deal_stage) in LOST_NAMES or name in LOST_NAMES
    if is_won:
        return "won", 100
    if is_lost:
        return "lost", 0
    if stage_row is not None and stage_row.probability is not None:
        return "open", int(stage_row.probability)
    return "open", DEFAULT_OPEN_PROBABILITY


def _bucket() -> dict:
    return {"deal_count": 0, "pipeline_amount": Decimal("0"), "weighted_amount": Decimal("0")}


def _add(bucket: dict, amount: Decimal, prob: int) -> None:
    bucket["deal_count"] += 1
    bucket["pipeline_amount"] += amount
    bucket["weighted_amount"] += amount * prob / 100


def _out(bucket: dict, **extra) -> dict:
    return {
        **extra,
        "deal_count": bucket["deal_count"],
        "pipeline_amount": _money(bucket["pipeline_amount"]),
        "weighted_amount": _money(bucket["weighted_amount"]),
    }


def build_forecast(
    db: Session,
    tenant_id: uuid.UUID,
    months: int = 6,
    pipeline_id: uuid.UUID | None = None,
    assigned_to: uuid.UUID | None = None,
    today: date | None = None,
) -> dict:
    today = today or date.today()
    month_start = today.replace(day=1)
    window_end = _add_months(month_start, months)

    q = (
        db.query(Deal, PipelineStage)
        .outerjoin(PipelineStage, PipelineStage.id == Deal.pipeline_stage_id)
        .filter(Deal.tenant_id == tenant_id)
    )
    if pipeline_id:
        q = q.filter(Deal.pipeline_id == pipeline_id)
    if assigned_to:
        q = q.filter(Deal.assigned_to == assigned_to)

    total = _bucket()
    by_period: dict[str, dict] = defaultdict(_bucket)
    by_stage: dict[str, dict] = {}
    by_owner: dict = defaultdict(_bucket)
    categories = {"commit": Decimal("0"), "best_case": Decimal("0"), "pipeline": Decimal("0")}
    won_this_month = Decimal("0")
    won_count = lost_count = 0
    overdue_close = no_close_date = 0

    for deal, stage_row in q.all():
        kind, prob = classify_deal(deal.stage, stage_row)
        amount = Decimal(str(deal.amount or 0))

        if kind == "won":
            if deal.updated_at and deal.updated_at.date() >= month_start:
                won_this_month += amount
                won_count += 1
            continue
        if kind == "lost":
            if deal.updated_at and deal.updated_at.date() >= month_start:
                lost_count += 1
            continue

        _add(total, amount, prob)
        close = deal.expected_close_date
        if close is None:
            key = "unscheduled"
            no_close_date += 1
        elif close < today:
            key = "overdue"
            overdue_close += 1
        elif close >= window_end:
            key = "later"
        else:
            key = f"{close.year:04d}-{close.month:02d}"
        _add(by_period[key], amount, prob)

        stage_name = (stage_row.name if stage_row is not None else deal.stage) or "Unknown"
        entry = by_stage.setdefault(stage_name, {"probability": prob, "bucket": _bucket()})
        _add(entry["bucket"], amount, prob)
        _add(by_owner[deal.assigned_to], amount, prob)

        weighted = amount * prob / 100
        if prob >= 75:
            categories["commit"] += weighted
        elif prob >= 40:
            categories["best_case"] += weighted
        else:
            categories["pipeline"] += weighted

    periods = []
    if "overdue" in by_period:
        periods.append(_out(by_period["overdue"], period="overdue", label="Close date passed (at risk)"))
    for i in range(months):
        m = _add_months(month_start, i)
        key = f"{m.year:04d}-{m.month:02d}"
        periods.append(_out(by_period.get(key, _bucket()), period=key, label=m.strftime("%b %Y")))
    for key, label in (("later", "Later"), ("unscheduled", "No close date")):
        if key in by_period:
            periods.append(_out(by_period[key], period=key, label=label))

    owner_ids = [o for o in by_owner if o]
    names = {}
    if owner_ids:
        names = {u.id: u.full_name for u in db.query(User.id, User.full_name).filter(User.id.in_(owner_ids)).all()}

    return {
        "as_of": today.isoformat(),
        "months": months,
        "totals": {
            **_out(total),
            "overdue_close_date_deals": overdue_close,
            "no_close_date_deals": no_close_date,
            "won_this_month": _money(won_this_month),
            "won_deals_this_month": won_count,
            "lost_deals_this_month": lost_count,
            "won_lost_basis": "deals whose last update falls in the current month",
        },
        "forecast_categories": {k: _money(v) for k, v in categories.items()},
        "by_month": periods,
        "by_stage": sorted(
            (_out(v["bucket"], stage=k, probability=v["probability"]) for k, v in by_stage.items()),
            key=lambda r: -r["weighted_amount"],
        ),
        "by_owner": sorted(
            (
                _out(b, user_id=str(o) if o else None, user_name=names.get(o, "Unassigned") if o else "Unassigned")
                for o, b in by_owner.items()
            ),
            key=lambda r: -r["weighted_amount"],
        ),
    }
