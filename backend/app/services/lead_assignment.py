import uuid
from datetime import datetime
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.models.lead import Lead
from app.models.user import User
from app.models.role import Role
from app.models.user_role import UserRole


MAX_ACTIVE_LEADS = 5

ACTIVE_LEAD_STATUSES = [
    "New",
    "Contacted",
    "Qualified"
]


def assign_lead_automatically(
    db: Session,
    tenant_id: uuid.UUID
) -> uuid.UUID | None:
    lock_key = tenant_id.int & ((1 << 63) - 1)

    db.execute(
        text("SELECT pg_advisory_xact_lock(:lock_key)"),
        {"lock_key": lock_key}
    )

    sales_role = db.query(Role).filter(
        Role.name == "Sales User"
    ).first()

    if not sales_role:
        return None

    sales_users = (
        db.query(User)
        .join(UserRole, UserRole.user_id == User.id)
        .filter(
            User.tenant_id == tenant_id,
            User.status == "Active",
            UserRole.role_id == sales_role.id
        )
        .order_by(User.id)
        .all()
    )

    if not sales_users:
        return None

    user_ids = [user.id for user in sales_users]

    active_counts = dict(
        db.query(
            Lead.assigned_to,
            text("COUNT(*)")
        )
        .filter(
            Lead.tenant_id == tenant_id,
            Lead.assigned_to.in_(user_ids),
            Lead.status.in_(ACTIVE_LEAD_STATUSES)
        )
        .group_by(Lead.assigned_to)
        .all()
    )

    latest_assignments = {}

    assignment_history = (
        db.query(
            Lead.assigned_to,
            Lead.created_at
        )
        .filter(
            Lead.tenant_id == tenant_id,
            Lead.assigned_to.in_(user_ids)
        )
        .order_by(
            Lead.created_at.desc(),
            Lead.id.desc()
        )
        .all()
    )

    for assigned_user_id, created_at in assignment_history:
        if assigned_user_id not in latest_assignments:
            latest_assignments[assigned_user_id] = created_at

    eligible_users = []

    for user in sales_users:
        workload = int(active_counts.get(user.id, 0))

        if workload >= MAX_ACTIVE_LEADS:
            continue

        last_assigned = latest_assignments.get(user.id)

        eligible_users.append(
            (
                workload,
                last_assigned,
                str(user.id),
                user.id
            )
        )

    if not eligible_users:
        return None

   

    eligible_users.sort(
        key=lambda item: (
            item[0],
            item[1] or datetime.min,
            item[2]
        )
    )

    return eligible_users[0][3]


def assign_waiting_leads(
    db: Session,
    tenant_id: uuid.UUID
) -> int:
    assigned_count = 0

    while True:
        waiting_lead = (
            db.query(Lead)
            .filter(
                Lead.tenant_id == tenant_id,
                Lead.assigned_to.is_(None),
                Lead.status.in_(ACTIVE_LEAD_STATUSES)
            )
            .order_by(
                Lead.created_at.asc(),
                Lead.id.asc()
            )
            .first()
        )

        if not waiting_lead:
            break

        assigned_user_id = assign_lead_automatically(
            db=db,
            tenant_id=tenant_id
        )

        if assigned_user_id is None:
            break

        waiting_lead.assigned_to = assigned_user_id
        db.flush()

        assigned_count += 1

    return assigned_count


def get_active_lead_count(
    db: Session,
    tenant_id: uuid.UUID,
    user_id: uuid.UUID
) -> int:
    return db.query(Lead).filter(
        Lead.tenant_id == tenant_id,
        Lead.assigned_to == user_id,
        Lead.status.in_(ACTIVE_LEAD_STATUSES)
    ).count()