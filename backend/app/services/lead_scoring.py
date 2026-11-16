"""Rule-based lead scoring (0-100) that is explainable and needs no AI.

score = profile points (what we know about the lead, recomputed automatically
whenever the lead is saved) + engagement points (what the team and the lead
have done, recomputed by recalculate_*), minus a stale penalty, clamped 0-100.

Labels: Hot (>=70), Warm (>=40), Cold (<40), Converted, Dead.
"""
import re
import uuid
from datetime import datetime, timedelta

from sqlalchemy import event, func
from sqlalchemy.orm import Session

from app.models.activity import Activity
from app.models.buyer_requirement import BuyerRequirement
from app.models.deal import Deal
from app.models.lead import Lead
from app.models.software_requirement import SoftwareRequirement

HOT_THRESHOLD = 70
WARM_THRESHOLD = 40
STALE_AFTER_DAYS = 14
STALE_PENALTY = 10

DEAD_STATUSES = {"lost", "disqualified", "junk", "unqualified", "dead", "closed lost", "not interested"}
CONVERTED_STATUSES = {"converted", "won", "closed won", "customer"}

# (keyword found in lead.source, points) - first match wins
SOURCE_POINTS = [
    ("referral", 15), ("refer", 15), ("website", 10), ("walk", 10), ("event", 8),
    ("linkedin", 8), ("google", 8), ("facebook", 6), ("instagram", 6), ("cold", 3),
]
# (keyword found in lead.status, points) - first match wins; deeper stage = more points
STATUS_POINTS = [("negotiat", 22), ("proposal", 20), ("qualified", 18), ("contacted", 8), ("new", 0)]

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_WON_LOST = {"won", "closed won", "closed_won", "closed-won", "lost", "closed lost", "closed_lost", "closed-lost"}


def _norm(value: str | None) -> str:
    return (value or "").strip().lower()


def label_for(score: int, status: str | None) -> str:
    s = _norm(status)
    if s in DEAD_STATUSES:
        return "Dead"
    if s in CONVERTED_STATUSES:
        return "Converted"
    if score >= HOT_THRESHOLD:
        return "Hot"
    if score >= WARM_THRESHOLD:
        return "Warm"
    return "Cold"


def compute_profile_score(lead) -> tuple[int, dict]:
    points: dict[str, int] = {}
    if lead.email and _EMAIL_RE.match(lead.email.strip()):
        points["email"] = 10
    if lead.phone and len(re.sub(r"\D", "", lead.phone)) >= 7:
        points["phone"] = 10
    source = _norm(lead.source)
    if source:
        points["source"] = next((p for kw, p in SOURCE_POINTS if kw in source), 4)
    if lead.notes and len(lead.notes.strip()) >= 20:
        points["notes"] = 5
    if lead.assigned_to:
        points["assigned"] = 5
    if lead.account_id:
        points["account"] = 5
    status_points = next((p for kw, p in STATUS_POINTS if kw in _norm(lead.status)), 0)
    if status_points:
        points["status"] = status_points
    return sum(points.values()), points


def compute_engagement(lead, facts: dict | None, now: datetime) -> tuple[int, dict]:
    """facts: {activity_count, first_activity_at, last_activity_at, has_open_deal, has_budget}."""
    facts = facts or {}
    points: dict[str, int] = {}
    count = int(facts.get("activity_count") or 0)
    if count:
        points["activities"] = min(count, 5) * 3

    first_at = facts.get("first_activity_at")
    created = lead.created_at or now
    if first_at:
        delay = first_at - created
        if delay <= timedelta(hours=1):
            points["fast_response"] = 15
        elif delay <= timedelta(hours=24):
            points["fast_response"] = 10
        elif delay <= timedelta(hours=72):
            points["fast_response"] = 5

    last_at = facts.get("last_activity_at")
    if last_at and now - last_at <= timedelta(days=7):
        points["recent_activity"] = 10
    if facts.get("has_open_deal"):
        points["open_deal"] = 10
    if facts.get("has_budget"):
        points["budget_known"] = 10

    status = _norm(lead.status)
    is_open = status not in DEAD_STATUSES and status not in CONVERTED_STATUSES
    last_touch = last_at or created
    if is_open and now - last_touch > timedelta(days=STALE_AFTER_DAYS):
        points["stale"] = -STALE_PENALTY
    return sum(points.values()), points


def apply_score(lead, engagement_points: int, engagement_breakdown: dict | None) -> None:
    profile_points, profile_breakdown = compute_profile_score(lead)
    status = _norm(lead.status)
    total = max(0, min(100, profile_points + engagement_points))
    if status in DEAD_STATUSES:
        total = 0
    lead.engagement_score = engagement_points
    lead.score = total
    lead.score_label = label_for(total, lead.status)
    lead.score_breakdown = {
        "profile": profile_breakdown,
        "engagement": engagement_breakdown or {},
        "total": total,
    }


# Keep the profile part (and the total) fresh on every save, without extra queries.
@event.listens_for(Lead, "before_insert")
@event.listens_for(Lead, "before_update")
def _auto_score_on_save(mapper, connection, lead) -> None:
    existing = lead.score_breakdown or {}
    apply_score(lead, int(lead.engagement_score or 0), existing.get("engagement"))


# ------------------------------------------------------------------ engagement facts
def load_engagement_facts(db: Session, tenant_id: uuid.UUID, lead_ids: list) -> dict:
    """Four grouped queries for any number of leads (no per-lead queries)."""
    if not lead_ids:
        return {}
    facts: dict = {lid: {} for lid in lead_ids}

    for lead_id, count, first_at, last_at in (
        db.query(
            Activity.lead_id,
            func.count(Activity.id),
            func.min(Activity.created_at),
            func.max(Activity.created_at),
        )
        .filter(Activity.tenant_id == tenant_id, Activity.lead_id.in_(lead_ids))
        .group_by(Activity.lead_id)
        .all()
    ):
        facts[lead_id].update(activity_count=count, first_activity_at=first_at, last_activity_at=last_at)

    for (lead_id, stage) in (
        db.query(Deal.lead_id, Deal.stage)
        .filter(Deal.tenant_id == tenant_id, Deal.lead_id.in_(lead_ids))
        .all()
    ):
        if _norm(stage) not in _WON_LOST:
            facts[lead_id]["has_open_deal"] = True

    for model in (BuyerRequirement, SoftwareRequirement):
        for (lead_id,) in (
            db.query(model.lead_id)
            .filter(
                model.tenant_id == tenant_id,
                model.lead_id.in_(lead_ids),
                (model.min_budget.isnot(None)) | (model.max_budget.isnot(None)),
            )
            .all()
        ):
            facts[lead_id]["has_budget"] = True
    return facts


def recalculate_lead(db: Session, lead: Lead, facts: dict | None = None, now: datetime | None = None) -> Lead:
    now = now or datetime.utcnow()
    if facts is None:
        facts = load_engagement_facts(db, lead.tenant_id, [lead.id]).get(lead.id, {})
    engagement, breakdown = compute_engagement(lead, facts, now)
    apply_score(lead, engagement, breakdown)
    lead.scored_at = now
    return lead


def recalculate_tenant(db: Session, tenant_id: uuid.UUID, limit: int = 5000, batch: int = 500) -> int:
    """Rescore a tenant's leads in batches. Returns how many were scored."""
    now = datetime.utcnow()
    done = 0
    last_id = None
    while done < limit:
        q = db.query(Lead).filter(Lead.tenant_id == tenant_id).order_by(Lead.id)
        if last_id is not None:
            q = q.filter(Lead.id > last_id)
        leads = q.limit(min(batch, limit - done)).all()
        if not leads:
            break
        facts = load_engagement_facts(db, tenant_id, [l.id for l in leads])
        for lead in leads:
            recalculate_lead(db, lead, facts.get(lead.id, {}), now)
        db.commit()
        done += len(leads)
        last_id = leads[-1].id
    return done
