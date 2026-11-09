from datetime import date, datetime, timedelta, timezone
import csv
import io
import json
from decimal import Decimal
import uuid
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import Response
from sqlalchemy import false as sa_false, func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.core.platform_rbac import (
    PLATFORM_INDUSTRIES,
    auto_route_support_ticket,
    enforce_industry_scope,
    enforce_target_industry_scope,
    normalize_industry_key,
    require_platform_employee,
    require_platform_permission,
)
from app.models.audit_log import AuditLog
from app.models.notification import Notification
from app.models.platform import (
    PlatformBillingInvoice,
    PlatformBillingPayment,
    PlatformEmployee,
    PlatformExpense,
    PlatformIndustryTeam,
    PlatformKnowledgeArticle,
    PlatformRefundRequest,
    PlatformSalesProspect,
    PlatformSecurityEvent,
    PlatformSetting,
    PlatformSubscriptionPlan,
    PlatformErrorLog,
    PlatformServiceHealthCheck,
    PlatformSupportTicketMeta,
    PlatformTechnicalIncident,
    PlatformTenantSubscription,
    PlatformWorkerHeartbeat,
)
from app.models.refresh_session import RefreshSession
from app.models.support_ticket import SupportTicket, SupportTicketComment
from app.models.tenant import Tenant
from app.models.user import User
from app.routes.platform_admin import ensure_platform_seeded
from app.schemas.platform import (
    KnowledgeArticleCreateRequest,
    PlatformExpenseCreateRequest,
    PlatformExpenseDecisionRequest,
    PlatformInvoiceCreateRequest,
    PlatformPaymentCreateRequest,
    PlatformRefundCreateRequest,
    PlatformRefundDecisionRequest,
    PlatformSalesProspectCreateRequest,
    PlatformSalesProspectUpdateRequest,
    PlatformSettingUpdateRequest,
    PlatformTicketAssignRequest,
    PlatformTicketAuditReviewRequest,
    PlatformTicketEscalateRequest,
    SecurityEventCreateRequest,
    SubscriptionPlanCreateRequest,
    SubscriptionPlanUpdateRequest,
    TechnicalIncidentCreateRequest,
    TechnicalIncidentUpdateRequest,
    TechnicalMonitoringThresholdsUpdateRequest,
    TenantSubscriptionAssignRequest,
)
from app.schemas.user import UserProfileUpdate
from app.services.audit_service import log_audit

router = APIRouter(prefix="/api/v1/platform", tags=["Platform Operations"])

CENTRAL_SUPPORT_ROLES = {"Platform Super Admin", "Platform Manager", "Platform Support"}
CENTRAL_TECHNICAL_ROLES = {"Platform Super Admin", "Platform Manager", "Technical"}
CENTRAL_BILLING_ROLES = {"Platform Super Admin", "Platform Manager", "Billing", "Finance"}
REFUND_ALLOWED_TRANSITIONS = {
    "Pending": {"Approved", "Rejected"},
    "Approved": {"Processed"},
    "Rejected": set(),
    "Processed": set(),
}


def is_valid_refund_transition(current_status: str, requested_status: str) -> bool:
    return requested_status in REFUND_ALLOWED_TRANSITIONS.get(current_status, set())


def validate_platform_ticket_assignee(db: Session, user_id: UUID, industry_key: str | None, queue: str | None = None):
    """Require an active platform employee eligible for this ticket's industry/queue."""
    row = (
        db.query(User, PlatformEmployee)
        .join(PlatformEmployee, PlatformEmployee.user_id == User.id)
        .filter(User.id == user_id, User.status == "Active")
        .first()
    )
    if not row:
        raise HTTPException(status_code=404, detail="Active platform employee assignee not found.")
    user, employee = row
    platform_tenant = db.query(Tenant.id).filter(
        (Tenant.is_platform.is_(True)) | (Tenant.name == "SCuilONE Platform")
    ).first()
    if not platform_tenant or str(user.tenant_id) != str(platform_tenant[0]):
        raise HTTPException(status_code=403, detail="Assignee is not a member of the platform tenant.")
    if employee.role_scope == "industry_team":
        if not industry_key or normalize_industry_key(employee.industry_key) != normalize_industry_key(industry_key):
            raise HTTPException(status_code=400, detail="Assignee belongs to a different industry team.")
        if queue == "Team Manager":
            allowed_industry_roles = {"Team Manager"}
        elif queue == "Billing":
            allowed_industry_roles = {"Team Manager", "Team Admin", "Team Finance"}
        elif queue == "Technical":
            allowed_industry_roles = {"Team Manager", "Team Admin", "Industry Support"}
        else:
            allowed_industry_roles = {"Team Manager", "Team Admin", "Industry Support"}
        if employee.role_name not in allowed_industry_roles:
            raise HTTPException(status_code=400, detail="Assignee role is not eligible for this ticket queue.")
    else:
        if queue == "Team Manager":
            raise HTTPException(status_code=400, detail="Team Manager escalation must be assigned to the matching industry team.")
        if queue == "Platform Manager":
            allowed = {"Platform Super Admin", "Platform Manager"}
        elif queue == "Technical":
            allowed = CENTRAL_TECHNICAL_ROLES
        elif queue == "Billing":
            allowed = CENTRAL_BILLING_ROLES
        else:
            allowed = CENTRAL_SUPPORT_ROLES
        if employee.role_name not in allowed:
            raise HTTPException(status_code=400, detail=f"Assignee role '{employee.role_name}' is not eligible for the {queue or 'Support'} queue.")
    return user, employee


# ============================================================================
# 1. SUPPORT TICKETS ROUTING, ESCALATIONS, SLA & KNOWLEDGE BASE
# ============================================================================

def serialize_platform_ticket(
    db: Session,
    ticket: SupportTicket,
    meta: PlatformSupportTicketMeta,
    tenant: Tenant | None = None,
) -> dict:
    if tenant is None:
        tenant = db.query(Tenant).filter(Tenant.id == ticket.tenant_id).first()
    now = datetime.utcnow()
    is_overdue = bool(
        meta.sla_resolution_due_at
        and ticket.status not in {"Resolved", "Closed"}
        and now > meta.sla_resolution_due_at
    )
    if is_overdue and not meta.sla_breached:
        meta.sla_breached = True
        db.flush()

    assignee_name = None
    eff_assignee = meta.assigned_employee_user_id or ticket.assigned_to
    if eff_assignee:
        u = db.query(User).filter(User.id == eff_assignee).first()
        if u:
            assignee_name = u.full_name

    return {
        "ticket_id": str(ticket.id),
        "ticket_number": ticket.ticket_number,
        "tenant_id": str(ticket.tenant_id),
        "company_name": tenant.name if tenant else "Unknown Company",
        "industry_key": meta.industry_key,
        "subject": ticket.subject,
        "description": ticket.description,
        "category": ticket.category,
        "issue_type": meta.issue_type,
        "routing_queue": meta.routing_queue,
        "status": ticket.status,
        "priority": ticket.priority,
        "requester_name": ticket.requester_name,
        "requester_email": ticket.requester_email,
        "assigned_employee_user_id": str(eff_assignee) if eff_assignee else None,
        "assigned_employee_name": assignee_name,
        "is_escalated": meta.is_escalated,
        "escalation_target": meta.escalation_target,
        "escalation_reason": meta.escalation_reason,
        "escalated_at": meta.escalated_at.isoformat() if meta.escalated_at else None,
        "sla_response_due_at": meta.sla_response_due_at.isoformat() if meta.sla_response_due_at else None,
        "sla_resolution_due_at": meta.sla_resolution_due_at.isoformat() if meta.sla_resolution_due_at else None,
        "sla_breached": meta.sla_breached,
        "audit_reviewed": meta.audit_reviewed,
        "audit_review_notes": meta.audit_review_notes,
        "resolution": ticket.resolution,
        "resolved_at": ticket.resolved_at.isoformat() if ticket.resolved_at else None,
        "history": meta.history_json or [],
        "created_at": ticket.created_at.isoformat() if ticket.created_at else None,
        "updated_at": ticket.updated_at.isoformat() if ticket.updated_at else None,
    }


@router.get("/support-tickets")
def list_platform_support_tickets(
    view: str | None = Query(
        default=None,
        description="my_tickets, team_tickets, new_open, in_progress, waiting_for_customer, resolved, escalated, sla_breached",
    ),
    industry_type: str | None = Query(default=None),
    issue_type: str | None = Query(default=None, pattern="^(Support|Technical|Billing)$"),
    status_filter: str | None = Query(default=None, alias="status"),
    priority: str | None = Query(default=None),
    platform_user: dict = Depends(require_platform_permission("platform.tickets.view")),
    db: Session = Depends(get_db),
):
    ensure_platform_seeded(db)
    user_id = UUID(str(platform_user["user_id"]))
    effective_industry = enforce_industry_scope(platform_user, industry_type)

    # Ensure all tickets have routing metadata
    unrouted = (
        db.query(SupportTicket)
        .outerjoin(
            PlatformSupportTicketMeta,
            PlatformSupportTicketMeta.ticket_id == SupportTicket.id,
        )
        .filter(PlatformSupportTicketMeta.id.is_(None))
        .all()
    )
    for t in unrouted:
        auto_route_support_ticket(db, t)
    if unrouted:
        db.commit()

    query = db.query(SupportTicket, PlatformSupportTicketMeta, Tenant).join(
        PlatformSupportTicketMeta,
        PlatformSupportTicketMeta.ticket_id == SupportTicket.id,
    ).join(
        Tenant,
        Tenant.id == SupportTicket.tenant_id,
    )

    if effective_industry:
        query = query.filter(PlatformSupportTicketMeta.industry_key == effective_industry)
    if issue_type:
        query = query.filter(PlatformSupportTicketMeta.issue_type == issue_type)
    if status_filter:
        query = query.filter(SupportTicket.status == status_filter)
    if priority:
        query = query.filter(SupportTicket.priority == priority)

    if view == "my_tickets":
        query = query.filter(
            (PlatformSupportTicketMeta.assigned_employee_user_id == user_id)
            | (SupportTicket.assigned_to == user_id)
        )
    elif view == "new_open":
        query = query.filter(SupportTicket.status == "Open")
    elif view == "in_progress":
        query = query.filter(SupportTicket.status == "In Progress")
    elif view == "waiting_for_customer":
        query = query.filter(SupportTicket.status == "Waiting on Customer")
    elif view == "resolved":
        query = query.filter(SupportTicket.status.in_(["Resolved", "Closed"]))
    elif view == "escalated":
        query = query.filter(PlatformSupportTicketMeta.is_escalated.is_(True))
    elif view == "sla_breached":
        query = query.filter(PlatformSupportTicketMeta.sla_breached.is_(True))

    rows = query.order_by(SupportTicket.created_at.desc()).all()
    items = [serialize_platform_ticket(db, t, m, ten) for t, m, ten in rows]
    db.commit()
    return {"items": items, "total": len(items)}


@router.get("/support-tickets/{ticket_id}")
def get_platform_support_ticket_detail(
    ticket_id: UUID,
    platform_user: dict = Depends(require_platform_permission("platform.tickets.view")),
    db: Session = Depends(get_db),
):
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found.")
    meta = auto_route_support_ticket(db, ticket)
    if platform_user.get("role_scope") == "industry_team":
        enforce_target_industry_scope(platform_user, meta.industry_key)

    comments = (
        db.query(SupportTicketComment)
        .filter(SupportTicketComment.ticket_id == ticket.id)
        .order_by(SupportTicketComment.created_at.asc())
        .all()
    )
    out = serialize_platform_ticket(db, ticket, meta)
    out["comments"] = [
        {
            "id": str(c.id),
            "body": c.body,
            "is_internal": c.is_internal,
            "author_user_id": str(c.author_user_id) if c.author_user_id else None,
            "created_at": c.created_at.isoformat() if c.created_at else None,
        }
        for c in comments
    ]
    db.commit()
    return out


@router.post("/support-tickets/{ticket_id}/assign")
def assign_platform_support_ticket(
    ticket_id: UUID,
    payload: PlatformTicketAssignRequest,
    platform_user: dict = Depends(require_platform_permission("platform.tickets.assign")),
    db: Session = Depends(get_db),
):
    platform_tenant = ensure_platform_seeded(db)
    actor_id = UUID(str(platform_user["user_id"]))
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found.")
    meta = auto_route_support_ticket(db, ticket, actor_user_id=actor_id)

    if platform_user.get("role_scope") == "industry_team":
        enforce_target_industry_scope(platform_user, meta.industry_key)

    assignee_user, assignee_emp = validate_platform_ticket_assignee(
        db, payload.assigned_employee_user_id, meta.industry_key, payload.routing_queue or meta.routing_queue
    )

    meta.assigned_employee_user_id = assignee_user.id
    if payload.routing_queue:
        meta.routing_queue = payload.routing_queue

    history = list(meta.history_json or [])
    history.append(
        {
            "timestamp": datetime.utcnow().isoformat(),
            "action": "assigned",
            "assigned_to": str(assignee_user.id),
            "assigned_to_name": assignee_user.full_name,
            "actor_user_id": str(actor_id),
            "notes": payload.notes,
        }
    )
    meta.history_json = history

    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=actor_id,
        action="ASSIGN_TICKET",
        module="platform_support_tickets",
        record_id=ticket.id,
        description=f"Assigned ticket {ticket.ticket_number} to {assignee_user.full_name}",
    )
    db.commit()
    return serialize_platform_ticket(db, ticket, meta)


@router.post("/support-tickets/{ticket_id}/escalate")
def escalate_platform_support_ticket(
    ticket_id: UUID,
    payload: PlatformTicketEscalateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.tickets.escalate")),
    db: Session = Depends(get_db),
):
    """
    Escalates a ticket to Team Manager, Platform Manager, central Technical team, or central Billing team.
    """
    platform_tenant = ensure_platform_seeded(db)
    actor_id = UUID(str(platform_user["user_id"]))
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found.")
    meta = auto_route_support_ticket(db, ticket, actor_user_id=actor_id)

    if platform_user.get("role_scope") == "industry_team":
        enforce_target_industry_scope(platform_user, meta.industry_key)

    meta.is_escalated = True
    meta.escalation_target = payload.escalation_target
    meta.escalation_reason = payload.escalation_reason
    meta.escalated_by = actor_id
    meta.escalated_at = datetime.utcnow()
    meta.routing_queue = payload.escalation_target
    if payload.escalation_target in {"Technical", "Billing"}:
        meta.issue_type = payload.escalation_target
    if payload.assigned_employee_user_id:
        assignee_user, _assignee_emp = validate_platform_ticket_assignee(
            db, payload.assigned_employee_user_id, meta.industry_key, payload.escalation_target
        )
        meta.assigned_employee_user_id = assignee_user.id

    history = list(meta.history_json or [])
    history.append(
        {
            "timestamp": datetime.utcnow().isoformat(),
            "action": "escalated",
            "escalation_target": payload.escalation_target,
            "escalation_reason": payload.escalation_reason,
            "actor_user_id": str(actor_id),
        }
    )
    meta.history_json = history

    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=actor_id,
        action="ESCALATE_TICKET",
        module="platform_support_tickets",
        record_id=ticket.id,
        description=f"Escalated ticket {ticket.ticket_number} to {payload.escalation_target}",
        after_data={"escalation_target": payload.escalation_target, "reason": payload.escalation_reason},
    )
    db.commit()
    return serialize_platform_ticket(db, ticket, meta)


@router.patch("/support-tickets/{ticket_id}/status")
def update_platform_ticket_status(
    ticket_id: UUID,
    new_status: str = Query(..., alias="status", pattern="^(Open|In Progress|Waiting on Customer|Resolved|Closed)$"),
    resolution: str | None = Query(default=None),
    platform_user: dict = Depends(require_platform_permission("platform.tickets.manage")),
    db: Session = Depends(get_db),
):
    platform_tenant = ensure_platform_seeded(db)
    actor_id = UUID(str(platform_user["user_id"]))
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found.")
    meta = auto_route_support_ticket(db, ticket, actor_user_id=actor_id)

    if platform_user.get("role_scope") == "industry_team":
        enforce_target_industry_scope(platform_user, meta.industry_key)

    if new_status == "Resolved" and not (resolution or ticket.resolution):
        raise HTTPException(status_code=400, detail="Provide a resolution summary before marking the ticket Resolved.")

    now = datetime.utcnow()
    if not meta.first_responded_at and new_status != "Open":
        meta.first_responded_at = now

    ticket.status = new_status
    if resolution:
        ticket.resolution = resolution
    if new_status == "Resolved":
        ticket.resolved_at = now
    elif new_status == "Closed":
        ticket.closed_at = now

    history = list(meta.history_json or [])
    history.append(
        {
            "timestamp": now.isoformat(),
            "action": "status_changed",
            "status": new_status,
            "resolution": resolution,
            "actor_user_id": str(actor_id),
        }
    )
    meta.history_json = history

    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=actor_id,
        action="UPDATE_TICKET_STATUS",
        module="platform_support_tickets",
        record_id=ticket.id,
        description=f"Updated ticket {ticket.ticket_number} status to '{new_status}'",
    )
    db.commit()
    return serialize_platform_ticket(db, ticket, meta)


@router.post("/support-tickets/{ticket_id}/audit-review")
def audit_review_support_ticket(
    ticket_id: UUID,
    payload: PlatformTicketAuditReviewRequest,
    platform_user: dict = Depends(require_platform_permission("platform.audit.findings.create")),
    db: Session = Depends(get_db),
):
    """
    Allows Team Auditor or Platform Audit to record an independent resolution & SLA review without mutating ticket fields.
    """
    actor_id = UUID(str(platform_user["user_id"]))
    ticket = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not ticket:
        raise HTTPException(status_code=404, detail="Support ticket not found.")
    meta = auto_route_support_ticket(db, ticket, actor_user_id=actor_id)
    if platform_user.get("role_scope") == "industry_team":
        enforce_target_industry_scope(platform_user, meta.industry_key)

    meta.audit_reviewed = payload.audit_reviewed
    meta.audit_review_notes = payload.audit_review_notes
    meta.audit_reviewed_by = actor_id
    db.commit()
    return serialize_platform_ticket(db, ticket, meta)


@router.get("/knowledge-base")
def list_knowledge_base_articles(
    industry_type: str | None = Query(default=None),
    category: str | None = Query(default=None),
    search: str | None = Query(default=None),
    platform_user: dict = Depends(require_platform_permission("platform.kb.view")),
    db: Session = Depends(get_db),
):
    ensure_platform_seeded(db)
    effective_industry = enforce_industry_scope(platform_user, industry_type)
    query = db.query(PlatformKnowledgeArticle).filter(PlatformKnowledgeArticle.is_published.is_(True))
    if effective_industry:
        query = query.filter(
            (PlatformKnowledgeArticle.industry_key == effective_industry)
            | (PlatformKnowledgeArticle.industry_key.is_(None))
        )
    if category:
        query = query.filter(PlatformKnowledgeArticle.category == category)
    if search:
        query = query.filter(
            PlatformKnowledgeArticle.title.ilike(f"%{search.strip()}%")
            | PlatformKnowledgeArticle.content.ilike(f"%{search.strip()}%")
        )
    articles = query.order_by(PlatformKnowledgeArticle.created_at.desc()).all()
    return {
        "items": [
            {
                "id": str(a.id),
                "slug": a.slug,
                "title": a.title,
                "category": a.category,
                "industry_key": a.industry_key,
                "content": a.content,
                "tags": a.tags_json or [],
                "created_at": a.created_at.isoformat() if a.created_at else None,
            }
            for a in articles
        ],
        "total": len(articles),
    }


@router.post("/knowledge-base", status_code=status.HTTP_201_CREATED)
def create_knowledge_base_article(
    payload: KnowledgeArticleCreateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.kb.manage")),
    db: Session = Depends(get_db),
):
    ensure_platform_seeded(db)
    if db.query(PlatformKnowledgeArticle).filter(PlatformKnowledgeArticle.slug == payload.slug).first():
        raise HTTPException(status_code=409, detail="A knowledge base article with this slug already exists.")
    article = PlatformKnowledgeArticle(
        slug=payload.slug.strip(),
        title=payload.title.strip(),
        category=payload.category,
        industry_key=normalize_industry_key(payload.industry_type),
        content=payload.content,
        tags_json=payload.tags_json,
        is_published=payload.is_published,
        author_id=UUID(str(platform_user["user_id"])),
    )
    db.add(article)
    db.commit()
    db.refresh(article)
    return {
        "id": str(article.id),
        "slug": article.slug,
        "title": article.title,
        "category": article.category,
        "industry_key": article.industry_key,
    }


# ============================================================================
# 2. SUBSCRIPTION PLANS, BILLING, INVOICES, PAYMENTS, RENEWALS & REFUNDS
# ============================================================================

@router.get("/plans")
def list_subscription_plans(
    platform_user: dict = Depends(require_platform_permission("platform.plans.view")),
    db: Session = Depends(get_db),
):
    ensure_platform_seeded(db)
    plans = db.query(PlatformSubscriptionPlan).order_by(PlatformSubscriptionPlan.price.asc()).all()
    return {
        "items": [
            {
                "id": str(p.id),
                "plan_key": p.plan_key,
                "name": p.name,
                "description": p.description,
                "billing_cycle": p.billing_cycle,
                "price": str(p.price),
                "currency": p.currency,
                "trial_days": p.trial_days,
                "max_users": p.max_users,
                "max_branches": p.max_branches,
                "storage_limit_gb": p.storage_limit_gb,
                "features": p.features_json or [],
                "limits": p.limits_json or {},
                "is_active": p.is_active,
            }
            for p in plans
        ]
    }


@router.post("/plans", status_code=status.HTTP_201_CREATED)
def create_subscription_plan(
    payload: SubscriptionPlanCreateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.plans.manage")),
    db: Session = Depends(get_db),
):
    platform_tenant = ensure_platform_seeded(db)
    if (
        db.query(PlatformSubscriptionPlan)
        .filter(
            (PlatformSubscriptionPlan.plan_key == payload.plan_key)
            | (PlatformSubscriptionPlan.name == payload.name)
        )
        .first()
    ):
        raise HTTPException(status_code=409, detail="Subscription plan key or name already exists.")

    plan = PlatformSubscriptionPlan(**payload.model_dump())
    db.add(plan)
    db.flush()
    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=UUID(str(platform_user["user_id"])),
        action="CREATE_PLAN",
        module="platform_plans",
        record_id=plan.id,
        description=f"Created subscription plan '{plan.name}' ({plan.price} {plan.currency})",
    )
    db.commit()
    db.refresh(plan)
    return {"id": str(plan.id), "plan_key": plan.plan_key, "name": plan.name, "price": str(plan.price)}


@router.patch("/plans/{plan_id}")
def update_subscription_plan(
    plan_id: UUID,
    payload: SubscriptionPlanUpdateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.plans.manage")),
    db: Session = Depends(get_db),
):
    platform_tenant = ensure_platform_seeded(db)
    plan = db.query(PlatformSubscriptionPlan).filter(PlatformSubscriptionPlan.id == plan_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Subscription plan not found.")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(plan, k, v)
    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=UUID(str(platform_user["user_id"])),
        action="UPDATE_PLAN",
        module="platform_plans",
        record_id=plan.id,
        description=f"Updated subscription plan '{plan.name}'",
    )
    db.commit()
    return {"message": "Plan updated", "id": str(plan.id), "name": plan.name, "price": str(plan.price)}


@router.get("/subscriptions")
def list_tenant_subscriptions(
    status_filter: str | None = Query(default=None, alias="status"),
    platform_user: dict = Depends(require_platform_permission("platform.billing.view")),
    db: Session = Depends(get_db),
):
    query = (
        db.query(PlatformTenantSubscription, PlatformSubscriptionPlan, Tenant)
        .join(
            PlatformSubscriptionPlan,
            PlatformSubscriptionPlan.id == PlatformTenantSubscription.plan_id,
        )
        .join(Tenant, Tenant.id == PlatformTenantSubscription.tenant_id)
    )
    if status_filter:
        query = query.filter(PlatformTenantSubscription.status == status_filter)
    rows = query.order_by(PlatformTenantSubscription.created_at.desc()).all()
    return {
        "items": [
            {
                "subscription_id": str(sub.id),
                "tenant_id": str(ten.id),
                "company_name": ten.name,
                "industry": ten.industry,
                "plan_id": str(plan.id),
                "plan_name": plan.name,
                "price": str(plan.price),
                "billing_cycle": sub.billing_cycle,
                "status": sub.status,
                "auto_renew": sub.auto_renew,
                "renewal_date": sub.renewal_date.isoformat() if sub.renewal_date else None,
            }
            for sub, plan, ten in rows
        ]
    }


@router.post("/subscriptions", status_code=status.HTTP_201_CREATED)
def assign_tenant_subscription(
    payload: TenantSubscriptionAssignRequest,
    platform_user: dict = Depends(require_platform_permission("platform.billing.manage")),
    db: Session = Depends(get_db),
):
    platform_tenant = ensure_platform_seeded(db)
    tenant = (
        db.query(Tenant)
        .filter(Tenant.id == payload.tenant_id, Tenant.is_platform.is_(False))
        .with_for_update()
        .first()
    )
    if not tenant:
        raise HTTPException(status_code=404, detail="Customer tenant not found.")

    plan = (
        db.query(PlatformSubscriptionPlan)
        .filter(PlatformSubscriptionPlan.id == payload.plan_id)
        .first()
    )
    if not plan:
        raise HTTPException(status_code=404, detail="Subscription plan not found.")
    if not plan.is_active:
        raise HTTPException(status_code=409, detail=f"Subscription plan '{plan.name}' is inactive.")

    if payload.status in {"Active", "Trial"}:
        now = datetime.utcnow()
        prior_subs = (
            db.query(PlatformTenantSubscription)
            .filter(
                PlatformTenantSubscription.tenant_id == tenant.id,
                PlatformTenantSubscription.status.in_(["Active", "Trial"]),
            )
            .with_for_update()
            .all()
        )
        for prior in prior_subs:
            prior.status = "Cancelled"
            prior.cancelled_at = now
            prior.ends_at = now
            prior.auto_renew = False

    default_days = 365 if payload.billing_cycle == "Annual" else 30
    sub = PlatformTenantSubscription(
        tenant_id=tenant.id,
        plan_id=plan.id,
        status=payload.status,
        billing_cycle=payload.billing_cycle,
        auto_renew=payload.auto_renew,
        renewal_date=payload.renewal_date or (date.today() + timedelta(days=default_days)),
    )
    db.add(sub)
    db.flush()
    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=UUID(str(platform_user["user_id"])),
        action="ASSIGN_SUBSCRIPTION",
        module="platform_billing",
        record_id=sub.id,
        description=f"Assigned subscription plan '{plan.name}' ({plan.id}) to tenant '{tenant.name}' ({tenant.id})",
    )
    db.commit()
    return {"subscription_id": str(sub.id), "status": sub.status}


@router.get("/billing/invoices")
def list_platform_invoices(
    status_filter: str | None = Query(default=None, alias="status"),
    platform_user: dict = Depends(require_platform_permission("platform.billing.view")),
    db: Session = Depends(get_db),
):
    query = db.query(PlatformBillingInvoice, Tenant).join(
        Tenant, Tenant.id == PlatformBillingInvoice.tenant_id
    )
    if status_filter:
        query = query.filter(PlatformBillingInvoice.status == status_filter)
    rows = query.order_by(PlatformBillingInvoice.created_at.desc()).all()
    return {
        "items": [
            {
                "id": str(inv.id),
                "invoice_number": inv.invoice_number,
                "tenant_id": str(ten.id),
                "company_name": ten.name,
                "amount": str(inv.amount),
                "tax_amount": str(inv.tax_amount),
                "total_amount": str(inv.total_amount),
                "paid_amount": str(inv.paid_amount),
                "balance_due": str(max(Decimal("0.00"), inv.total_amount - inv.paid_amount)),
                "currency": inv.currency,
                "status": inv.status,
                "issue_date": inv.issue_date.isoformat() if inv.issue_date else None,
                "due_date": inv.due_date.isoformat() if inv.due_date else None,
            }
            for inv, ten in rows
        ]
    }


@router.post("/billing/invoices", status_code=status.HTTP_201_CREATED)
def create_platform_invoice(
    payload: PlatformInvoiceCreateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.billing.manage")),
    db: Session = Depends(get_db),
):
    platform_tenant = ensure_platform_seeded(db)
    tenant = (
        db.query(Tenant)
        .filter(Tenant.id == payload.tenant_id, Tenant.is_platform.is_(False))
        .first()
    )
    if not tenant:
        raise HTTPException(status_code=404, detail="Customer tenant not found.")
    if payload.subscription_id is not None:
        sub = (
            db.query(PlatformTenantSubscription)
            .filter(
                PlatformTenantSubscription.id == payload.subscription_id,
                PlatformTenantSubscription.tenant_id == tenant.id,
            )
            .first()
        )
        if not sub:
            raise HTTPException(status_code=400, detail="Subscription does not belong to the specified tenant.")
    if payload.due_date is not None and payload.due_date < date.today():
        raise HTTPException(status_code=422, detail="Invoice due_date cannot be earlier than the issue date.")
    inv_num = f"PINV-{date.today():%Y%m}-{uuid.uuid4().hex[:6].upper()}"
    total = payload.amount + payload.tax_amount
    inv = PlatformBillingInvoice(
        invoice_number=inv_num,
        tenant_id=payload.tenant_id,
        subscription_id=payload.subscription_id,
        amount=payload.amount,
        tax_amount=payload.tax_amount,
        total_amount=total,
        paid_amount=Decimal("0.00"),
        currency=payload.currency,
        status="Issued",
        issue_date=date.today(),
        due_date=payload.due_date or (date.today() + timedelta(days=15)),
        notes=payload.notes,
        created_by=UUID(str(platform_user["user_id"])),
    )
    db.add(inv)
    db.flush()
    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=UUID(str(platform_user["user_id"])),
        action="CREATE_INVOICE",
        module="platform_billing",
        record_id=inv.id,
        description=f"Created platform invoice {inv_num} for total {total} {inv.currency}",
    )
    db.commit()
    return {
        "id": str(inv.id),
        "invoice_number": inv.invoice_number,
        "total_amount": str(inv.total_amount),
        "status": inv.status,
    }


@router.post("/billing/payments", status_code=status.HTTP_201_CREATED)
def record_platform_payment(
    payload: PlatformPaymentCreateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.billing.manage")),
    db: Session = Depends(get_db),
):
    platform_tenant = ensure_platform_seeded(db)
    inv = (
        db.query(PlatformBillingInvoice)
        .filter(PlatformBillingInvoice.id == payload.invoice_id)
        .with_for_update()
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    if inv.status in {"Paid", "Void", "Refunded"}:
        raise HTTPException(
            status_code=409,
            detail=f"Cannot record a payment on an invoice with status '{inv.status}'.",
        )

    cleaned_ref = payload.transaction_reference.strip()
    if not cleaned_ref:
        raise HTTPException(status_code=422, detail="transaction_reference cannot be blank.")
    # Serialize case-insensitive reference checks across different invoice rows.
    if db.bind is not None and db.bind.dialect.name == "postgresql":
        db.query(func.pg_advisory_xact_lock(func.hashtext(cleaned_ref.lower()))).scalar()
    if (
        db.query(PlatformBillingPayment.id)
        .filter(func.lower(PlatformBillingPayment.transaction_reference) == cleaned_ref.lower())
        .first()
    ):
        raise HTTPException(status_code=409, detail="A payment with this transaction_reference already exists.")

    remaining_balance = max(Decimal("0.00"), Decimal(str(inv.total_amount)) - Decimal(str(inv.paid_amount)))
    if payload.status == "Succeeded" and payload.amount > remaining_balance:
        raise HTTPException(
            status_code=400,
            detail=f"Payment amount ({payload.amount}) exceeds remaining invoice balance ({remaining_balance}).",
        )

    payment = PlatformBillingPayment(
        invoice_id=inv.id,
        tenant_id=inv.tenant_id,
        provider=payload.provider,
        transaction_reference=cleaned_ref,
        amount=payload.amount,
        currency=inv.currency,
        payment_method=payload.payment_method,
        status=payload.status,
        failure_reason=payload.failure_reason,
        retry_count=1 if payload.status == "Failed" else 0,
        next_retry_at=datetime.utcnow() + timedelta(days=2) if payload.status == "Failed" else None,
    )
    db.add(payment)
    if payload.status == "Succeeded":
        inv.paid_amount = Decimal(str(inv.paid_amount)) + payload.amount
        if inv.paid_amount >= inv.total_amount:
            inv.status = "Paid"
            inv.paid_at = datetime.utcnow()
        else:
            inv.status = "Issued"
    elif payload.status == "Failed":
        if Decimal(str(inv.paid_amount)) == Decimal("0.00"):
            inv.status = "Failed"

    try:
        db.flush()
        log_audit(
            db=db,
            tenant_id=platform_tenant.id,
            user_id=UUID(str(platform_user["user_id"])),
            action="RECORD_PAYMENT",
            module="platform_billing",
            record_id=payment.id,
            description=f"Recorded payment {payment.transaction_reference} ({payment.status}) for invoice {inv.invoice_number}",
        )
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(
            status_code=409,
            detail="Duplicate payment transaction_reference detected.",
        ) from exc
    return {
        "payment_id": str(payment.id),
        "invoice_id": str(inv.id),
        "invoice_status": inv.status,
        "payment_status": payment.status,
    }


@router.get("/billing/payments")
def list_platform_payments(
    status_filter: str | None = Query(default=None, alias="status"),
    platform_user: dict = Depends(require_platform_permission("platform.billing.view")),
    db: Session = Depends(get_db),
):
    query = db.query(PlatformBillingPayment)
    if status_filter:
        query = query.filter(PlatformBillingPayment.status == status_filter)
    rows = query.order_by(PlatformBillingPayment.created_at.desc()).all()
    return {
        "items": [
            {
                "id": str(p.id),
                "invoice_id": str(p.invoice_id),
                "tenant_id": str(p.tenant_id),
                "provider": p.provider,
                "transaction_reference": p.transaction_reference,
                "amount": str(p.amount),
                "currency": p.currency,
                "payment_method": p.payment_method,
                "status": p.status,
                "failure_reason": p.failure_reason,
                "retry_count": p.retry_count,
                "reconciled": p.reconciled,
                "paid_at": p.paid_at.isoformat() if p.paid_at else None,
            }
            for p in rows
        ]
    }


@router.post("/billing/refunds", status_code=status.HTTP_201_CREATED)
def create_refund_request(
    payload: PlatformRefundCreateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.billing.manage")),
    db: Session = Depends(get_db),
):
    platform_tenant = ensure_platform_seeded(db)
    inv = (
        db.query(PlatformBillingInvoice)
        .filter(PlatformBillingInvoice.id == payload.invoice_id)
        .with_for_update()
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Invoice not found.")
    if Decimal(str(inv.paid_amount)) <= Decimal("0.00"):
        raise HTTPException(status_code=400, detail="Cannot request a refund on an invoice with no paid amount.")

    payment = None
    if payload.payment_id is not None:
        payment = (
            db.query(PlatformBillingPayment)
            .filter(
                PlatformBillingPayment.id == payload.payment_id,
                PlatformBillingPayment.invoice_id == inv.id,
            )
            .with_for_update()
            .first()
        )
        if not payment:
            raise HTTPException(status_code=404, detail="Specified payment does not belong to this invoice.")
        if payment.status != "Succeeded":
            raise HTTPException(status_code=400, detail="Only succeeded payments can be refunded.")
        payment_refunds = sum(
            (Decimal(str(r.amount)) for r in db.query(PlatformRefundRequest).filter(
                PlatformRefundRequest.payment_id == payment.id,
                PlatformRefundRequest.status.in_(["Pending", "Approved", "Processed"]),
            ).with_for_update().all()),
            Decimal("0.00"),
        )
        payment_refundable = max(Decimal("0.00"), Decimal(str(payment.amount)) - payment_refunds)
        if payload.amount > payment_refundable:
            raise HTTPException(status_code=400, detail=f"Refund exceeds remaining refundable amount for this payment ({payment_refundable}).")

    existing_refunds_total = sum(
        (
            Decimal(str(r.amount))
            for r in db.query(PlatformRefundRequest)
            .filter(
                PlatformRefundRequest.invoice_id == inv.id,
                PlatformRefundRequest.status.in_(["Pending", "Approved"]),
            )
            .all()
        ),
        Decimal("0.00"),
    )
    refundable_balance = max(Decimal("0.00"), Decimal(str(inv.paid_amount)) - existing_refunds_total)
    if payload.amount > refundable_balance:
        raise HTTPException(
            status_code=400,
            detail=f"Refund amount ({payload.amount}) exceeds refundable paid balance ({refundable_balance}).",
        )

    refund = PlatformRefundRequest(
        invoice_id=inv.id,
        payment_id=payload.payment_id,
        tenant_id=inv.tenant_id,
        amount=payload.amount,
        currency=inv.currency,
        reason=payload.reason,
        status="Pending",
        requested_by=UUID(str(platform_user["user_id"])),
    )
    db.add(refund)
    db.flush()
    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=UUID(str(platform_user["user_id"])),
        action="REQUEST_REFUND",
        module="platform_refunds",
        record_id=refund.id,
        description=f"Requested refund of {payload.amount} {inv.currency} on invoice {inv.invoice_number}",
    )
    db.commit()
    return {"id": str(refund.id), "status": refund.status, "amount": str(refund.amount)}


@router.patch("/billing/refunds/{refund_id}")
def decide_refund_request(
    refund_id: UUID,
    payload: PlatformRefundDecisionRequest,
    platform_user: dict = Depends(require_platform_permission("platform.refunds.manage")),
    db: Session = Depends(get_db),
):
    """
    Approves, rejects, or processes a refund request.
    Note (Page 11 & 15): Platform Admin does NOT automatically have 'platform.refunds.manage';
    only Billing and Platform Super Admin can approve/process refunds, and every action is recorded in audit logs.
    """
    platform_tenant = ensure_platform_seeded(db)
    actor_id = UUID(str(platform_user["user_id"]))
    refund = (
        db.query(PlatformRefundRequest)
        .filter(PlatformRefundRequest.id == refund_id)
        .with_for_update()
        .first()
    )
    if not refund:
        raise HTTPException(status_code=404, detail="Refund request not found.")

    before_status = refund.status
    if not is_valid_refund_transition(before_status, payload.status):
        raise HTTPException(
            status_code=409,
            detail=f"Invalid refund transition from '{before_status}' to '{payload.status}'.",
        )

    inv = (
        db.query(PlatformBillingInvoice)
        .filter(PlatformBillingInvoice.id == refund.invoice_id)
        .with_for_update()
        .first()
    )
    if not inv:
        raise HTTPException(status_code=404, detail="Linked invoice not found.")

    # Approval reserves the amount (the Pending/Approved aggregate is checked at request time).
    # Only Processed changes accounting balances, after settlement has actually completed.
    if payload.status == "Processed":
        if Decimal(str(refund.amount)) > Decimal(str(inv.paid_amount)):
            raise HTTPException(status_code=409, detail="Refund amount exceeds current invoice paid balance.")
        payment_row = None
        if refund.payment_id:
            payment_row = (
                db.query(PlatformBillingPayment)
                .filter(PlatformBillingPayment.id == refund.payment_id)
                .with_for_update()
                .first()
            )
            if not payment_row or payment_row.invoice_id != inv.id:
                raise HTTPException(status_code=409, detail="Linked payment is no longer valid.")
            other_payment_refunds = sum(
                (Decimal(str(r.amount)) for r in db.query(PlatformRefundRequest).filter(
                    PlatformRefundRequest.payment_id == payment_row.id,
                    PlatformRefundRequest.id != refund.id,
                    PlatformRefundRequest.status == "Processed",
                ).all()),
                Decimal("0.00"),
            )
            if other_payment_refunds + Decimal(str(refund.amount)) > Decimal(str(payment_row.amount)):
                raise HTTPException(status_code=409, detail="Cumulative refunds exceed the linked payment amount.")

        inv.paid_amount = max(Decimal("0.00"), Decimal(str(inv.paid_amount)) - Decimal(str(refund.amount)))
        inv.status = "Refunded" if inv.paid_amount == Decimal("0.00") else "Issued"
        if payment_row:
            settled_for_payment = other_payment_refunds + Decimal(str(refund.amount))
            if settled_for_payment >= Decimal(str(payment_row.amount)):
                payment_row.status = "Refunded"
        refund.processed_at = datetime.utcnow()

    refund.status = payload.status
    refund.approved_by = actor_id
    refund.resolution_notes = payload.resolution_notes

    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=actor_id,
        action="DECIDE_REFUND",
        module="platform_refunds",
        record_id=refund.id,
        description=f"Refund {refund.id} changed from '{before_status}' to '{payload.status}'",
        before_data={"status": before_status},
        after_data={"status": payload.status, "resolution_notes": payload.resolution_notes},
    )
    db.commit()
    return {"id": str(refund.id), "status": refund.status, "processed_at": refund.processed_at}


@router.get("/billing/refunds")
def list_refund_requests(
    platform_user: dict = Depends(require_platform_permission("platform.billing.view")),
    db: Session = Depends(get_db),
):
    rows = db.query(PlatformRefundRequest).order_by(PlatformRefundRequest.created_at.desc()).all()
    return {
        "items": [
            {
                "id": str(r.id),
                "invoice_id": str(r.invoice_id),
                "tenant_id": str(r.tenant_id),
                "amount": str(r.amount),
                "currency": r.currency,
                "reason": r.reason,
                "status": r.status,
                "resolution_notes": r.resolution_notes,
                "created_at": r.created_at.isoformat() if r.created_at else None,
            }
            for r in rows
        ]
    }


# ============================================================================
# 3. PLATFORM SALES & INDUSTRY SALES (LEADS, PROSPECTS, PIPELINE, DEMOS, ONBOARDING)
# ============================================================================

@router.get("/sales/prospects")
def list_sales_prospects(
    industry_type: str | None = Query(default=None),
    pipeline_stage: str | None = Query(default=None),
    onboarding_status: str | None = Query(default=None),
    platform_user: dict = Depends(require_platform_permission("platform.sales.view")),
    db: Session = Depends(get_db),
):
    effective_industry = enforce_industry_scope(platform_user, industry_type)
    query = db.query(PlatformSalesProspect)
    if effective_industry:
        query = query.filter(PlatformSalesProspect.industry_key == effective_industry)
    if pipeline_stage:
        query = query.filter(PlatformSalesProspect.pipeline_stage == pipeline_stage)
    if onboarding_status:
        query = query.filter(PlatformSalesProspect.onboarding_status == onboarding_status)

    rows = query.order_by(PlatformSalesProspect.created_at.desc()).all()
    return {
        "items": [
            {
                "id": str(p.id),
                "company_name": p.company_name,
                "contact_name": p.contact_name,
                "contact_email": p.contact_email,
                "contact_phone": p.contact_phone,
                "industry_key": p.industry_key,
                "lead_status": p.lead_status,
                "pipeline_stage": p.pipeline_stage,
                "interest_level": p.interest_level,
                "estimated_mrr": str(p.estimated_mrr),
                "recommended_plan": p.recommended_plan,
                "assigned_to": str(p.assigned_to) if p.assigned_to else None,
                "demo_scheduled_at": p.demo_scheduled_at.isoformat() if p.demo_scheduled_at else None,
                "demo_outcome": p.demo_outcome,
                "next_follow_up_at": p.next_follow_up_at.isoformat() if p.next_follow_up_at else None,
                "onboarding_status": p.onboarding_status,
                "notes": p.notes,
                "created_at": p.created_at.isoformat() if p.created_at else None,
            }
            for p in rows
        ],
        "total": len(rows),
    }



def validate_active_platform_employee_user(
    db: Session,
    employee_or_user_id: UUID,
    industry_key: str | None = None,
    allowed_central_roles: set[str] | None = None,
    allowed_industry_roles: set[str] | None = None,
) -> tuple[User, PlatformEmployee]:
    """
    Validates that the given ID belongs to an active PlatformEmployee and User
    who is a member of the Platform Tenant, and optionally enforces industry/role scope
    BEFORE any database insert or update.
    """
    row = (
        db.query(User, PlatformEmployee)
        .join(PlatformEmployee, PlatformEmployee.user_id == User.id)
        .filter(
            (User.id == employee_or_user_id) | (PlatformEmployee.id == employee_or_user_id),
            User.status == "Active",
        )
        .first()
    )
    if not row:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Active platform employee assignee not found.",
        )
    user, employee = row
    platform_tenant = (
        db.query(Tenant.id)
        .filter((Tenant.is_platform.is_(True)) | (Tenant.name == "SCuilONE Platform"))
        .first()
    )
    if not platform_tenant or str(user.tenant_id) != str(platform_tenant[0]):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Assignee is not a member of the platform tenant.",
        )
    if employee.role_scope == "industry_team":
        if industry_key and normalize_industry_key(employee.industry_key) != normalize_industry_key(industry_key):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assignee belongs to a different industry team.",
            )
        if allowed_industry_roles and employee.role_name not in allowed_industry_roles:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Assignee role '{employee.role_name}' is not eligible for this assignment.",
            )
    else:
        if allowed_central_roles and employee.role_name not in allowed_central_roles:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Assignee role '{employee.role_name}' is not eligible for this assignment.",
            )
    return user, employee


@router.post("/sales/prospects", status_code=status.HTTP_201_CREATED)
def create_sales_prospect(
    payload: PlatformSalesProspectCreateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.sales.manage")),
    db: Session = Depends(get_db),
):
    platform_tenant = ensure_platform_seeded(db)
    norm_ind = enforce_industry_scope(platform_user, payload.industry_type) or normalize_industry_key(payload.industry_type)
    from app.core.industry_registry import INDUSTRY_REGISTRY
    if norm_ind not in INDUSTRY_REGISTRY:
        raise HTTPException(status_code=422, detail=f"Unsupported industry '{payload.industry_type}'.")
    target_assignee_id = payload.assigned_to or UUID(str(platform_user["user_id"]))
    assignee_user, _assignee_emp = validate_active_platform_employee_user(
        db=db,
        employee_or_user_id=target_assignee_id,
        industry_key=norm_ind,
    )

    prospect = PlatformSalesProspect(
        company_name=payload.company_name.strip(),
        contact_name=payload.contact_name.strip(),
        contact_email=str(payload.contact_email).strip().lower(),
        contact_phone=payload.contact_phone,
        industry_key=norm_ind,
        lead_status=payload.lead_status,
        pipeline_stage=payload.pipeline_stage,
        interest_level=payload.interest_level,
        estimated_mrr=payload.estimated_mrr,
        recommended_plan=payload.recommended_plan,
        assigned_to=assignee_user.id,
        demo_scheduled_at=payload.demo_scheduled_at,
        next_follow_up_at=payload.next_follow_up_at,
        notes=payload.notes,
    )
    db.add(prospect)
    db.flush()
    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=UUID(str(platform_user["user_id"])),
        action="CREATE_SALES_PROSPECT",
        module="platform_sales",
        record_id=prospect.id,
        description=f"Added sales prospect '{prospect.company_name}' ({prospect.industry_key})",
    )
    db.commit()
    db.refresh(prospect)
    return {
        "id": str(prospect.id),
        "company_name": prospect.company_name,
        "industry_key": prospect.industry_key,
        "pipeline_stage": prospect.pipeline_stage,
        "onboarding_status": prospect.onboarding_status,
        "assigned_to": str(prospect.assigned_to) if prospect.assigned_to else None,
    }


@router.patch("/sales/prospects/{prospect_id}")
def update_sales_prospect(
    prospect_id: UUID,
    payload: PlatformSalesProspectUpdateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.sales.manage")),
    db: Session = Depends(get_db),
):
    ensure_platform_seeded(db)
    prospect = db.query(PlatformSalesProspect).filter(PlatformSalesProspect.id == prospect_id).first()
    if not prospect:
        raise HTTPException(status_code=404, detail="Sales prospect not found.")
    enforce_target_industry_scope(platform_user, prospect.industry_key)

    changes = payload.model_dump(exclude_unset=True)
    if "assigned_to" in changes and changes["assigned_to"] is not None:
        assignee_user, _assignee_emp = validate_active_platform_employee_user(
            db=db,
            employee_or_user_id=changes["assigned_to"],
            industry_key=prospect.industry_key,
        )
        changes["assigned_to"] = assignee_user.id

    for k, v in changes.items():
        setattr(prospect, k, v)
    db.commit()
    db.refresh(prospect)
    return {
        "id": str(prospect.id),
        "company_name": prospect.company_name,
        "lead_status": prospect.lead_status,
        "pipeline_stage": prospect.pipeline_stage,
        "demo_outcome": prospect.demo_outcome,
        "onboarding_status": prospect.onboarding_status,
        "assigned_to": str(prospect.assigned_to) if prospect.assigned_to else None,
    }


# ============================================================================
# 4. FINANCE & TEAM FINANCE (EXPENSES, BUDGETS, TRANSACTIONS, RECONCILIATION)
# ============================================================================

@router.get("/finance/overview")
def get_finance_overview(
    industry_type: str | None = Query(default=None),
    platform_user: dict = Depends(require_platform_permission("platform.finance.view")),
    db: Session = Depends(get_db),
):
    ensure_platform_seeded(db)
    effective_industry = enforce_industry_scope(platform_user, industry_type)

    exp_q = db.query(PlatformExpense)
    team_q = db.query(PlatformIndustryTeam)
    if effective_industry:
        exp_q = exp_q.filter(PlatformExpense.industry_key == effective_industry)
        team_q = team_q.filter(PlatformIndustryTeam.industry_key == effective_industry)

    expenses = exp_q.order_by(PlatformExpense.created_at.desc()).all()
    teams = team_q.all()

    approved_expenses = sum(
        (e.amount for e in expenses if e.status in {"Approved", "Paid", "Reconciled"}),
        Decimal("0.00"),
    )
    pending_expenses = sum(
        (e.amount for e in expenses if e.status == "Pending"),
        Decimal("0.00"),
    )
    allocated_budget = sum((t.allocated_budget for t in teams), Decimal("0.00"))
    spent_budget = sum((t.spent_budget for t in teams), Decimal("0.00"))

    # Central Finance sees subscription revenue & reconciliation; Team Finance sees team budget & expenses
    is_central = platform_user.get("role_scope") == "platform"
    total_revenue = Decimal("0.00")
    unreconciled_payments = 0
    if is_central:
        invoices = db.query(PlatformBillingInvoice).all()
        total_revenue = sum((i.paid_amount for i in invoices), Decimal("0.00"))
        unreconciled_payments = (
            db.query(PlatformBillingPayment)
            .filter(
                PlatformBillingPayment.status == "Succeeded",
                PlatformBillingPayment.reconciled.is_(False),
            )
            .count()
        )

    return {
        "scope": "platform" if is_central else "industry_team",
        "industry_key": effective_industry,
        "allocated_budget": str(allocated_budget),
        "spent_budget": str(spent_budget),
        "remaining_budget": str(max(Decimal("0.00"), allocated_budget - spent_budget)),
        "approved_expenses_total": str(approved_expenses),
        "pending_expenses_total": str(pending_expenses),
        "subscription_revenue_total": str(total_revenue) if is_central else None,
        "net_position": str(total_revenue - approved_expenses) if is_central else None,
        "unreconciled_payments_count": unreconciled_payments if is_central else None,
        "expenses": [
            {
                "id": str(e.id),
                "expense_number": e.expense_number,
                "title": e.title,
                "category": e.category,
                "industry_key": e.industry_key,
                "amount": str(e.amount),
                "currency": e.currency,
                "status": e.status,
                "reconciled": e.reconciled,
                "expense_date": e.expense_date.isoformat() if e.expense_date else None,
            }
            for e in expenses
        ],
    }


@router.post("/finance/expenses", status_code=status.HTTP_201_CREATED)
def create_platform_or_team_expense(
    payload: PlatformExpenseCreateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.finance.manage")),
    db: Session = Depends(get_db),
):
    platform_tenant = ensure_platform_seeded(db)
    norm_ind = enforce_industry_scope(platform_user, payload.industry_type) or normalize_industry_key(payload.industry_type)
    team = (
        db.query(PlatformIndustryTeam)
        .filter(PlatformIndustryTeam.industry_key == norm_ind)
        .first()
        if norm_ind
        else None
    )
    exp_num = f"EXP-{date.today():%Y%m}-{uuid.uuid4().hex[:6].upper()}"
    exp = PlatformExpense(
        expense_number=exp_num,
        title=payload.title.strip(),
        category=payload.category,
        industry_key=norm_ind,
        industry_team_id=team.id if team else None,
        amount=payload.amount,
        currency=payload.currency,
        expense_date=payload.expense_date or date.today(),
        status="Pending",
        description=payload.description,
        requested_by=UUID(str(platform_user["user_id"])),
    )
    db.add(exp)
    db.flush()
    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=UUID(str(platform_user["user_id"])),
        action="CREATE_EXPENSE",
        module="platform_finance",
        record_id=exp.id,
        description=f"Created expense request {exp_num} ({exp.amount} {exp.currency})",
    )
    db.commit()
    return {
        "id": str(exp.id),
        "expense_number": exp.expense_number,
        "industry_key": exp.industry_key,
        "amount": str(exp.amount),
        "status": exp.status,
    }


@router.patch("/finance/expenses/{expense_id}")
def decide_or_reconcile_expense(
    expense_id: UUID,
    payload: PlatformExpenseDecisionRequest,
    platform_user: dict = Depends(require_platform_permission("platform.finance.manage")),
    db: Session = Depends(get_db),
):
    platform_tenant = ensure_platform_seeded(db)
    actor_id = UUID(str(platform_user["user_id"]))
    exp = (
        db.query(PlatformExpense)
        .filter(PlatformExpense.id == expense_id)
        .with_for_update()
        .first()
    )
    if not exp:
        raise HTTPException(status_code=404, detail="Expense record not found.")
    enforce_target_industry_scope(platform_user, exp.industry_key)

    prev_status = exp.status
    if prev_status == "Rejected" and payload.status != "Rejected":
        raise HTTPException(status_code=409, detail="A rejected expense cannot be approved or paid.")
    if prev_status in {"Approved", "Paid", "Reconciled"} and payload.status == "Rejected":
        raise HTTPException(status_code=409, detail="An already approved/paid expense cannot be rejected.")

    # Update industry team spent_budget when transitioning from Pending into Approved/Paid/Reconciled
    if prev_status == "Pending" and payload.status in {"Approved", "Paid", "Reconciled"} and exp.industry_team_id:
        team = (
            db.query(PlatformIndustryTeam)
            .filter(PlatformIndustryTeam.id == exp.industry_team_id)
            .with_for_update()
            .first()
        )
        if team:
            new_spent = Decimal(str(team.spent_budget)) + Decimal(str(exp.amount))
            if Decimal(str(team.allocated_budget)) > Decimal("0.00") and new_spent > Decimal(str(team.allocated_budget)):
                raise HTTPException(
                    status_code=409,
                    detail=f"Approving this expense ({exp.amount}) would exceed {team.name}'s allocated budget ({team.allocated_budget}).",
                )
            team.spent_budget = new_spent

    exp.status = payload.status
    exp.approved_by = actor_id
    exp.approved_at = datetime.utcnow()
    if payload.reconciled is not None:
        exp.reconciled = payload.reconciled
    elif payload.status == "Reconciled":
        exp.reconciled = True

    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=actor_id,
        action="UPDATE_EXPENSE",
        module="platform_finance",
        record_id=exp.id,
        description=f"Updated expense {exp.expense_number} from '{prev_status}' to '{payload.status}'",
    )
    db.commit()
    return {"id": str(exp.id), "expense_number": exp.expense_number, "status": exp.status, "reconciled": exp.reconciled}


@router.post("/finance/reconcile-payment/{payment_id}")
def reconcile_billing_payment(
    payment_id: UUID,
    platform_user: dict = Depends(require_platform_permission("platform.finance.manage")),
    db: Session = Depends(get_db),
):
    payment = (
        db.query(PlatformBillingPayment)
        .filter(PlatformBillingPayment.id == payment_id)
        .with_for_update()
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment transaction not found.")
    if payment.status != "Succeeded":
        raise HTTPException(status_code=409, detail=f"Only 'Succeeded' payments can be reconciled; current status is '{payment.status}'.")
    payment.reconciled = True
    payment.reconciled_by = UUID(str(platform_user["user_id"]))
    payment.reconciled_at = datetime.utcnow()
    db.commit()
    return {"payment_id": str(payment.id), "reconciled": True, "reconciled_at": payment.reconciled_at}


# ============================================================================
# 5. TECHNICAL OPERATIONS (SYSTEM HEALTH, SERVICES, INCIDENTS, DEPLOYMENTS)
# ============================================================================

@router.get("/technical/health")
def get_technical_system_health(
    run_live_checks: bool = Query(default=True, description="Run real-time service health checks before building snapshot"),
    platform_user: dict = Depends(require_platform_permission("platform.technical.view")),
    db: Session = Depends(get_db),
):
    from app.services.monitoring_service import get_real_technical_health_snapshot

    ensure_platform_seeded(db)
    return get_real_technical_health_snapshot(db, run_live_checks=run_live_checks)


@router.get("/technical/incidents")
def list_technical_incidents(
    status_filter: str | None = Query(default=None, alias="status"),
    severity: str | None = Query(default=None),
    service_name: str | None = Query(default=None),
    detection_source: str | None = Query(default=None),
    environment: str | None = Query(default=None),
    platform_user: dict = Depends(require_platform_permission("platform.technical.view")),
    db: Session = Depends(get_db),
):
    from app.services.monitoring_service import serialize_technical_incident

    ensure_platform_seeded(db)
    query = db.query(PlatformTechnicalIncident)
    if status_filter:
        query = query.filter(PlatformTechnicalIncident.status == status_filter)
    if severity:
        query = query.filter(PlatformTechnicalIncident.severity == severity)
    if service_name:
        query = query.filter(PlatformTechnicalIncident.service_name == service_name)
    if detection_source:
        query = query.filter(PlatformTechnicalIncident.detection_source == detection_source)
    if environment:
        query = query.filter(PlatformTechnicalIncident.environment == environment)

    rows = query.order_by(PlatformTechnicalIncident.created_at.desc()).limit(200).all()
    return {
        "items": [serialize_technical_incident(i) for i in rows],
        "total": len(rows),
    }


@router.post("/technical/incidents", status_code=status.HTTP_201_CREATED)
def create_technical_incident(
    payload: TechnicalIncidentCreateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.technical.manage")),
    db: Session = Depends(get_db),
):
    from app.core.monitoring_config import compute_error_fingerprint, redact_sensitive_dict, redact_sensitive_text, utc_now
    from app.services.monitoring_service import _notify_platform_admins_of_incident, serialize_technical_incident

    platform_tenant = ensure_platform_seeded(db)
    target_owner_id = payload.owner_user_id or UUID(str(platform_user["user_id"]))
    owner_user, _owner_emp = validate_active_platform_employee_user(
        db=db,
        employee_or_user_id=target_owner_id,
    )
    if payload.related_ticket_id is not None:
        ticket_exists = db.query(SupportTicket.id).filter(SupportTicket.id == payload.related_ticket_id).first()
        if not ticket_exists:
            raise HTTPException(status_code=404, detail="Related support ticket not found.")

    now = utc_now()
    fp = payload.error_fingerprint or compute_error_fingerprint(
        service_name=payload.service_name,
        error_category=payload.incident_type,
        endpoint=payload.affected_endpoint,
        environment=payload.environment,
    )
    tenant_ids = [str(tid) for tid in (payload.affected_tenant_ids or []) if tid]
    inc_num = f"INC-{date.today():%Y%m%d}-{uuid.uuid4().hex[:6].upper()}"
    inc = PlatformTechnicalIncident(
        incident_number=inc_num,
        title=redact_sensitive_text(payload.title.strip(), 200),
        incident_type=payload.incident_type,
        service_name=payload.service_name,
        severity=payload.severity,
        status=payload.status,
        environment=payload.environment,
        error_fingerprint=fp,
        detection_source=payload.detection_source,
        version_tag=payload.version_tag,
        description=redact_sensitive_text(payload.description, 3000),
        recovery_actions=payload.recovery_actions,
        first_occurrence_at=now,
        last_occurrence_at=now,
        occurrence_count=1,
        affected_endpoint=payload.affected_endpoint,
        affected_tenant_count=len(tenant_ids),
        affected_tenant_ids_json=tenant_ids,
        diagnostics_json=redact_sensitive_dict(payload.diagnostics_json or {}),
        owner_user_id=owner_user.id,
        related_ticket_id=payload.related_ticket_id,
    )
    db.add(inc)
    db.flush()

    if payload.severity in {"Critical", "High"}:
        _notify_platform_admins_of_incident(db, inc, event_kind="created")

    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=UUID(str(platform_user["user_id"])),
        action="CREATE_TECH_INCIDENT",
        module="platform_technical",
        record_id=inc.id,
        description=f"Recorded technical {inc.incident_type} {inc_num}: {inc.title}",
    )
    db.commit()
    db.refresh(inc)
    return serialize_technical_incident(inc)


@router.patch("/technical/incidents/{incident_id}")
def update_technical_incident(
    incident_id: UUID,
    payload: TechnicalIncidentUpdateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.technical.manage")),
    db: Session = Depends(get_db),
):
    from app.core.monitoring_config import SEVERITY_RANK, redact_sensitive_dict, redact_sensitive_text, utc_now
    from app.services.monitoring_service import _notify_platform_admins_of_incident, serialize_technical_incident

    ensure_platform_seeded(db)
    inc = db.query(PlatformTechnicalIncident).filter(PlatformTechnicalIncident.id == incident_id).first()
    if not inc:
        raise HTTPException(status_code=404, detail="Technical incident not found.")

    prev_severity = inc.severity
    prev_status = inc.status
    changes = payload.model_dump(exclude_unset=True)
    if "owner_user_id" in changes and changes["owner_user_id"] is not None:
        owner_user, _owner_emp = validate_active_platform_employee_user(
            db=db,
            employee_or_user_id=changes["owner_user_id"],
        )
        changes["owner_user_id"] = owner_user.id

    if "description" in changes and changes["description"] is not None:
        changes["description"] = redact_sensitive_text(changes["description"], 3000)
    if "diagnostics_json" in changes and changes["diagnostics_json"] is not None:
        changes["diagnostics_json"] = redact_sensitive_dict(changes["diagnostics_json"])

    for k, v in changes.items():
        setattr(inc, k, v)

    now = utc_now()
    if payload.severity and SEVERITY_RANK.get(payload.severity, 1) > SEVERITY_RANK.get(prev_severity, 1):
        _notify_platform_admins_of_incident(db, inc, event_kind="escalated")

    if payload.status == "Resolved" and prev_status != "Resolved":
        inc.resolved_at = datetime.utcnow()
        if not inc.recovery_detected_at:
            inc.recovery_detected_at = now
        _notify_platform_admins_of_incident(db, inc, event_kind="resolved")

    db.commit()
    db.refresh(inc)
    return serialize_technical_incident(inc)


@router.get("/technical/error-logs")
def list_technical_error_logs(
    service_name: str | None = Query(default=None),
    http_status_code: int | None = Query(default=None),
    environment: str | None = Query(default=None),
    correlation_id: str | None = Query(default=None),
    platform_user: dict = Depends(require_platform_permission("platform.technical.view")),
    db: Session = Depends(get_db),
):
    from app.core.monitoring_config import redact_sensitive_dict, redact_sensitive_text

    ensure_platform_seeded(db)
    query = db.query(PlatformErrorLog)
    if service_name:
        query = query.filter(PlatformErrorLog.service_name == service_name)
    if http_status_code is not None:
        query = query.filter(PlatformErrorLog.http_status_code == http_status_code)
    if environment:
        query = query.filter(PlatformErrorLog.environment == environment)
    if correlation_id:
        query = query.filter(PlatformErrorLog.correlation_id == correlation_id)

    rows = query.order_by(PlatformErrorLog.last_seen_at.desc()).limit(200).all()
    return {
        "items": [
            {
                "id": str(r.id),
                "event_code": r.event_code,
                "service_name": r.service_name,
                "environment": r.environment,
                "endpoint": r.endpoint,
                "http_method": r.http_method,
                "http_status_code": r.http_status_code,
                "exception_type": r.exception_type,
                "error_fingerprint": r.error_fingerprint,
                "safe_message": redact_sensitive_text(r.safe_message, 2000),
                "redacted_stack_trace": redact_sensitive_text(r.redacted_stack_trace, 8000)
                if r.redacted_stack_trace
                else None,
                "correlation_id": r.correlation_id,
                "tenant_id": str(r.tenant_id) if r.tenant_id else None,
                "user_id": str(r.user_id) if r.user_id else None,
                "occurrence_count": int(r.occurrence_count or 1),
                "first_seen_at": r.first_seen_at.isoformat() if r.first_seen_at else None,
                "last_seen_at": r.last_seen_at.isoformat() if r.last_seen_at else None,
                "related_incident_id": str(r.related_incident_id) if r.related_incident_id else None,
                "metadata": redact_sensitive_dict(r.metadata_json or {}),
            }
            for r in rows
        ],
        "total": len(rows),
    }


@router.post("/technical/run-checks")
def trigger_technical_health_checks(
    platform_user: dict = Depends(require_platform_permission("platform.technical.manage")),
    db: Session = Depends(get_db),
):
    from app.services.monitoring_service import run_all_health_checks_and_detect_incidents

    ensure_platform_seeded(db)
    return run_all_health_checks_and_detect_incidents(db)


@router.get("/technical/thresholds")
def get_technical_monitoring_thresholds(
    platform_user: dict = Depends(require_platform_permission("platform.technical.view")),
    db: Session = Depends(get_db),
):
    from app.services.monitoring_service import get_monitoring_thresholds

    ensure_platform_seeded(db)
    return {"thresholds": get_monitoring_thresholds(db)}


@router.put("/technical/thresholds")
def update_technical_monitoring_thresholds(
    payload: TechnicalMonitoringThresholdsUpdateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.technical.manage")),
    db: Session = Depends(get_db),
):
    from app.services.monitoring_service import update_monitoring_thresholds

    ensure_platform_seeded(db)
    actor_id = UUID(str(platform_user["user_id"]))
    updated = update_monitoring_thresholds(
        db,
        payload.model_dump(exclude_unset=True),
        actor_user_id=actor_id,
    )
    return {"thresholds": updated}


# ============================================================================
# 6. AUDIT & TEAM AUDITOR (READ-ONLY TAMPER-RESISTANT LOGS & COMPLIANCE)
# ============================================================================

@router.get("/audit/overview")
def get_audit_overview(
    module: str | None = Query(default=None),
    industry_type: str | None = Query(default=None),
    platform_user: dict = Depends(require_platform_permission("platform.audit.view")),
    db: Session = Depends(get_db),
):
    """
    Read-only audit & compliance overview for Central Audit and Industry Team Auditor (Pages 16 & 22).
    """
    effective_industry = enforce_industry_scope(platform_user, industry_type)

    audit_q = db.query(AuditLog)
    if effective_industry:
        # Industry-scoped auditors (and central users who filter by industry)
        # only see audit entries of customer companies in that industry.
        # Platform-level entries (employees, roles, bootstrap, ...) and other
        # industries' entries are never exposed to them.
        industry_tenant_ids = [
            t.id
            for t in db.query(Tenant).filter(Tenant.is_platform.is_(False)).all()
            if normalize_industry_key(t.industry) == effective_industry
        ]
        if industry_tenant_ids:
            audit_q = audit_q.filter(AuditLog.tenant_id.in_(industry_tenant_ids))
        else:
            audit_q = audit_q.filter(sa_false())
    if module:
        audit_q = audit_q.filter(AuditLog.module == module)
    recent_logs = audit_q.order_by(AuditLog.created_at.desc()).limit(100).all()

    ticket_meta_q = db.query(PlatformSupportTicketMeta)
    if effective_industry:
        ticket_meta_q = ticket_meta_q.filter(PlatformSupportTicketMeta.industry_key == effective_industry)
    metas = ticket_meta_q.all()

    total_tickets = len(metas)
    sla_breached = sum(1 for m in metas if m.sla_breached)
    reviewed_tickets = sum(1 for m in metas if m.audit_reviewed)
    sla_compliance_pct = round(((total_tickets - sla_breached) / total_tickets) * 100, 2) if total_tickets else 100.0

    findings_q = db.query(PlatformSecurityEvent).filter(
        PlatformSecurityEvent.event_type == "audit_finding"
    )
    if effective_industry:
        findings_q = findings_q.filter(PlatformSecurityEvent.industry_key == effective_industry)
    findings = findings_q.order_by(PlatformSecurityEvent.created_at.desc()).all()

    return {
        "scope": platform_user.get("role_scope"),
        "industry_key": effective_industry,
        "read_only_enforced": True,
        "sla_compliance": {
            "total_tickets": total_tickets,
            "sla_breached_count": sla_breached,
            "audit_reviewed_count": reviewed_tickets,
            "sla_compliance_percentage": sla_compliance_pct,
        },
        "audit_findings": [
            {
                "id": str(f.id),
                "title": f.title,
                "severity": f.severity,
                "status": f.status,
                "industry_key": f.industry_key,
                "description": f.description,
                "remediation_steps": f.remediation_steps,
                "created_at": f.created_at.isoformat() if f.created_at else None,
            }
            for f in findings
        ],
        "audit_logs": [
            {
                "id": str(log.id),
                "user_id": str(log.user_id) if log.user_id else None,
                "action": log.action,
                "module": log.module,
                "record_id": log.record_id,
                "description": log.description,
                "before_data": log.before_data,
                "after_data": log.after_data,
                "created_at": log.created_at.isoformat() if log.created_at else None,
            }
            for log in recent_logs
        ],
    }


@router.post("/audit/findings", status_code=status.HTTP_201_CREATED)
def record_audit_finding(
    payload: SecurityEventCreateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.audit.findings.create")),
    db: Session = Depends(get_db),
):
    effective_industry = enforce_industry_scope(platform_user, payload.industry_type)
    finding = PlatformSecurityEvent(
        event_type="audit_finding",
        severity=payload.severity,
        status=payload.status,
        industry_key=effective_industry,
        title=payload.title.strip(),
        description=payload.description,
        remediation_steps=payload.remediation_steps,
        metadata_json=payload.metadata_json,
        created_by=UUID(str(platform_user["user_id"])),
    )
    db.add(finding)
    db.commit()
    db.refresh(finding)
    return {
        "id": str(finding.id),
        "title": finding.title,
        "severity": finding.severity,
        "industry_key": finding.industry_key,
    }


# ============================================================================
# 7. SECURITY ADMINISTRATOR (LOGIN ACTIVITY, FAILED LOGINS, INCIDENTS, SESSIONS)
# ============================================================================

@router.get("/security/events")
def list_security_events(
    event_type: str | None = Query(
        default=None,
        description="login_success, login_failed, suspicious_activity, security_incident, access_review",
    ),
    platform_user: dict = Depends(require_platform_permission("platform.security.view")),
    db: Session = Depends(get_db),
):
    query = db.query(PlatformSecurityEvent)
    if event_type:
        query = query.filter(PlatformSecurityEvent.event_type == event_type)
    events = query.order_by(PlatformSecurityEvent.created_at.desc()).limit(100).all()

    active_sessions = (
        db.query(RefreshSession)
        .filter(RefreshSession.revoked.is_(False))
        .count()
    )
    return {
        "active_refresh_sessions_count": active_sessions,
        "items": [
            {
                "id": str(e.id),
                "event_type": e.event_type,
                "severity": e.severity,
                "status": e.status,
                "user_id": str(e.user_id) if e.user_id else None,
                "email": e.email,
                "ip_address": e.ip_address,
                "title": e.title,
                "description": e.description,
                "remediation_steps": e.remediation_steps,
                "created_at": e.created_at.isoformat() if e.created_at else None,
            }
            for e in events
        ],
    }


@router.post("/security/events", status_code=status.HTTP_201_CREATED)
def create_security_event(
    payload: SecurityEventCreateRequest,
    platform_user: dict = Depends(require_platform_permission("platform.security.manage")),
    db: Session = Depends(get_db),
):
    ev = PlatformSecurityEvent(
        event_type=payload.event_type,
        severity=payload.severity,
        status=payload.status,
        user_id=payload.user_id,
        email=payload.email,
        ip_address=payload.ip_address,
        industry_key=normalize_industry_key(payload.industry_type),
        title=payload.title.strip(),
        description=payload.description,
        remediation_steps=payload.remediation_steps,
        metadata_json=payload.metadata_json,
        created_by=UUID(str(platform_user["user_id"])),
    )
    db.add(ev)
    db.commit()
    db.refresh(ev)
    return {"id": str(ev.id), "event_type": ev.event_type, "severity": ev.severity, "status": ev.status}


@router.post("/security/revoke-user-sessions/{target_user_id}")
def revoke_user_sessions(
    target_user_id: UUID,
    request: Request,
    platform_user: dict = Depends(require_platform_permission("platform.security.manage")),
    db: Session = Depends(get_db),
):
    platform_tenant = ensure_platform_seeded(db)
    target_user = db.query(User.id).filter(User.id == target_user_id).with_for_update().first()
    if target_user is None:
        raise HTTPException(status_code=404, detail="Target user not found.")
    revoked_count = (
        db.query(RefreshSession)
        .filter(
            RefreshSession.user_id == target_user_id,
            RefreshSession.revoked.is_(False),
        )
        .update({RefreshSession.revoked: True}, synchronize_session=False)
    )
    actor_id = UUID(str(platform_user["user_id"]))
    source_ip = request.client.host if request.client else None
    log_audit(db=db, tenant_id=platform_tenant.id, user_id=actor_id, action="REVOKE_SESSIONS",
              module="platform_security", record_id=target_user_id,
              description=f"Revoked {revoked_count} active refresh sessions for user {target_user_id}",
              after_data={"target_user_id": str(target_user_id), "revoked_refresh_sessions": revoked_count,
                          "actor_role": platform_user.get("role"), "source_ip": source_ip})
    db.add(PlatformSecurityEvent(event_type="security_incident", severity="Warning", status="Logged",
        user_id=target_user_id, ip_address=source_ip, industry_key="platform",
        title="User sessions revoked by platform administrator",
        description=f"Platform administrator {actor_id} revoked {revoked_count} refresh sessions.",
        metadata_json={"actor_user_id": str(actor_id), "actor_role": platform_user.get("role"),
                       "target_user_id": str(target_user_id), "revoked_count": revoked_count}))
    existing_notice = db.query(Notification.id).filter(
        Notification.tenant_id == platform_tenant.id,
        Notification.title == "Platform user sessions revoked",
        Notification.related_record_id == target_user_id,
        Notification.created_at >= datetime.now(timezone.utc) - timedelta(minutes=10),
    ).first()
    if not existing_notice:
        admins = db.query(User).join(PlatformEmployee, PlatformEmployee.user_id == User.id).filter(
            User.tenant_id == platform_tenant.id, User.status == "Active",
            PlatformEmployee.role_name == "Platform Super Admin").all()
        for admin in admins:
            db.add(Notification(tenant_id=platform_tenant.id, recipient_user_id=admin.id,
                title="Platform user sessions revoked",
                message=f"An administrator revoked {revoked_count} sessions for user {target_user_id}.",
                notification_type="security", related_module="platform_security", related_record_id=target_user_id))
    db.commit()
    return {"user_id": str(target_user_id), "revoked_sessions_count": revoked_count}


# ============================================================================
# 8. ANALYST & TEAM ANALYST (AGGREGATE ANALYTICS & EXPORTABLE REPORTS)
# ============================================================================

@router.get("/analytics/overview")
def get_platform_or_industry_analytics(
    industry_type: str | None = Query(default=None),
    platform_user: dict = Depends(require_platform_permission("platform.analytics.view")),
    db: Session = Depends(get_db),
):
    """Aggregate-only analytics over the canonical industry registry."""
    ensure_platform_seeded(db)
    effective_industry = enforce_industry_scope(platform_user, industry_type)
    from app.services.platform_config import get_platform_config
    general_config = get_platform_config(db, "platform.general")
    tenants = db.query(Tenant).filter(Tenant.is_platform.is_(False)).all()
    all_ticket_rows = (db.query(SupportTicket, PlatformSupportTicketMeta)
                       .join(PlatformSupportTicketMeta, PlatformSupportTicketMeta.ticket_id == SupportTicket.id).all())
    all_prospects = db.query(PlatformSalesProspect).all()
    registry_rows = [i for i in PLATFORM_INDUSTRIES if not effective_industry or i["industry_key"] == effective_industry]
    industry_breakdown = []
    for industry in registry_rows:
        ind_key = industry["industry_key"]
        ind_tenants = [t for t in tenants if normalize_industry_key(t.industry) == ind_key]
        ind_tickets = [(ticket, meta) for ticket, meta in all_ticket_rows
                       if normalize_industry_key(meta.industry_key) == ind_key]
        open_c = sum(1 for ticket, _ in ind_tickets if ticket.status not in {"Resolved", "Closed"})
        res_c = sum(1 for ticket, _ in ind_tickets if ticket.status in {"Resolved", "Closed"})
        breached_c = sum(1 for _, meta in ind_tickets if meta.sla_breached)
        prospects_c = sum(1 for prospect in all_prospects
                          if normalize_industry_key(prospect.industry_key) == ind_key)
        industry_breakdown.append({
            "industry_key": ind_key,
            "industry_name": industry["name"],
            "registered_companies": len(ind_tenants),
            "active_companies": sum(1 for tenant in ind_tenants if tenant.status == "Active"),
            "total_tickets": len(ind_tickets),
            "open_tickets": open_c,
            "resolved_tickets": res_c,
            "sla_breached_tickets": breached_c,
            "sla_compliance_pct": round(((len(ind_tickets) - breached_c) / len(ind_tickets)) * 100, 2) if ind_tickets else 100.0,
            "sales_prospects": prospects_c,
        })
    totals = {key: sum(row[key] for row in industry_breakdown) for key in (
        "registered_companies", "active_companies", "total_tickets", "open_tickets",
        "resolved_tickets", "sla_breached_tickets", "sales_prospects")}
    totals["sla_compliance_pct"] = round(
        ((totals["total_tickets"] - totals["sla_breached_tickets"]) / totals["total_tickets"]) * 100, 2
    ) if totals["total_tickets"] else 100.0
    return {
        "report_title": "SCuilONE Platform Analytics",
        "company_name": general_config.get("company_name", "StaunchCuil Services Private Limited"),
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "scope": platform_user.get("role_scope"),
        "industry_key": effective_industry,
        "aggregate_only": True,
        "industries_count": len(industry_breakdown),
        "totals": totals,
        "industry_analytics": industry_breakdown,
    }


@router.get("/analytics/export")
def export_analytics_report(
    request: Request,
    industry_type: str | None = Query(default=None),
    format_type: str = Query(default="json", alias="format", pattern="^(json|csv|pdf)$"),
    platform_user: dict = Depends(require_platform_permission("platform.analytics.export")),
    db: Session = Depends(get_db),
):
    data = get_platform_or_industry_analytics(industry_type=industry_type, platform_user=platform_user, db=db)
    rows = data["industry_analytics"]
    date_stamp = datetime.now(timezone.utc).date().isoformat()
    filename = f"scuilone_platform_analytics_{date_stamp}.{format_type}"
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    if format_type == "json":
        content = json.dumps(data, ensure_ascii=False, indent=2, default=str)
        media_type = "application/json; charset=utf-8"
    elif format_type == "csv":
        buffer = io.StringIO(newline="")
        fields = ["industry_key", "industry_name", "registered_companies", "active_companies", "total_tickets", "open_tickets", "resolved_tickets", "sla_breached_tickets", "sla_compliance_pct", "sales_prospects"]
        writer = csv.DictWriter(buffer, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(rows)
        writer.writerow({})
        writer.writerow({"industry_key": "TOTAL", "industry_name": "All included industries", **data["totals"]})
        content = buffer.getvalue()
        media_type = "text/csv; charset=utf-8"
    else:
        try:
            from reportlab.lib import colors
            from reportlab.lib.pagesizes import A4, landscape
            from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
            from reportlab.lib.units import mm
            from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
        except ImportError as exc:
            raise HTTPException(status_code=503, detail="PDF export dependency is unavailable.") from exc
        pdf_buffer = io.BytesIO()
        doc = SimpleDocTemplate(pdf_buffer, pagesize=landscape(A4), rightMargin=14*mm, leftMargin=14*mm, topMargin=15*mm, bottomMargin=18*mm)
        styles = getSampleStyleSheet()
        styles.add(ParagraphStyle(name="SmallCell", parent=styles["BodyText"], fontSize=7, leading=9))
        story = [Paragraph("StaunchCuil Services Private Limited", styles["Title"]),
                 Paragraph("SCuilONE Platform Management Analytics", styles["Heading2"]),
                 Paragraph(f"Generated: {data['generated_at']} | Scope: {data['scope']} | Aggregate-only report", styles["Normal"]), Spacer(1, 8)]
        total = data["totals"]
        summary = [["Registered Companies", "Active Companies", "Support Tickets", "Open Tickets", "Resolved Tickets", "SLA Compliance", "Sales Prospects"],
                   [total["registered_companies"], total["active_companies"], total["total_tickets"], total["open_tickets"], total["resolved_tickets"], f"{total['sla_compliance_pct']}%", total["sales_prospects"]]]
        t = Table(summary, repeatRows=1)
        t.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#17365D")), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("FONTNAME", (0,0), (-1,0), "Helvetica-Bold"), ("GRID", (0,0), (-1,-1), .35, colors.grey), ("ALIGN", (0,0), (-1,-1), "CENTER"), ("FONTSIZE", (0,0), (-1,-1), 8), ("PADDING", (0,0), (-1,-1), 6)]))
        story += [Paragraph("Platform Summary", styles["Heading3"]), t, Spacer(1, 12), Paragraph("Industry-wise Breakdown", styles["Heading3"])]
        table_data = [["Industry", "Registered", "Active", "Tickets", "Open", "Resolved", "SLA Breached", "SLA %", "Prospects"]]
        for row in rows:
            table_data.append([row["industry_name"], row["registered_companies"], row["active_companies"], row["total_tickets"], row["open_tickets"], row["resolved_tickets"], row["sla_breached_tickets"], f"{row['sla_compliance_pct']}%", row["sales_prospects"]])
        table_data.append(["TOTAL", total["registered_companies"], total["active_companies"], total["total_tickets"], total["open_tickets"], total["resolved_tickets"], total["sla_breached_tickets"], f"{total['sla_compliance_pct']}%", total["sales_prospects"]])
        t2 = Table(table_data, repeatRows=1, colWidths=[48*mm, 20*mm, 17*mm, 17*mm, 15*mm, 18*mm, 22*mm, 17*mm, 20*mm])
        t2.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,0), colors.HexColor("#17365D")), ("TEXTCOLOR", (0,0), (-1,0), colors.white), ("GRID", (0,0), (-1,-1), .35, colors.grey), ("FONTSIZE", (0,0), (-1,-1), 7), ("PADDING", (0,0), (-1,-1), 5), ("BACKGROUND", (0,-1), (-1,-1), colors.HexColor("#E8EEF5")), ("FONTNAME", (0,-1), (-1,-1), "Helvetica-Bold")]))
        story.append(t2)
        def page_number(canvas, document):
            canvas.saveState(); canvas.setFont("Helvetica", 8); canvas.drawRightString(landscape(A4)[0]-14*mm, 9*mm, f"Page {document.page}"); canvas.restoreState()
        doc.build(story, onFirstPage=page_number, onLaterPages=page_number)
        content = pdf_buffer.getvalue()
        media_type = "application/pdf"
    actor_id = UUID(str(platform_user["user_id"]))
    platform_tenant = ensure_platform_seeded(db)
    log_audit(db=db, tenant_id=platform_tenant.id, user_id=actor_id, action="EXPORT_PLATFORM_ANALYTICS", module="platform_analytics", record_id=None, description=f"Generated aggregate analytics export ({format_type})", after_data={"format": format_type, "industry_key": data.get("industry_key"), "rows": len(rows), "actor_role": platform_user.get("role"), "source_ip": request.client.host if request.client else None})
    db.commit()
    return Response(content=content, media_type=media_type, headers=headers)


# ============================================================================
# 9. PLATFORM SETTINGS & EMPLOYEE PROFILE
# ============================================================================

@router.get("/settings")
def list_platform_settings(
    platform_user: dict = Depends(require_platform_permission("platform.settings.manage")),
    db: Session = Depends(get_db),
):
    ensure_platform_seeded(db)
    from app.services.platform_config import DEFAULTS, get_platform_config
    settings_rows = db.query(PlatformSetting).order_by(PlatformSetting.setting_key.asc()).all()
    return {
        "items": [
            {
                "setting_key": key,
                "category": key.split(".", 1)[1].replace("_", " ").title(),
                "value_json": get_platform_config(db, key),
                "description": next((row.description for row in settings_rows if row.setting_key == key), "SCuilONE managed platform configuration"),
                "updated_at": next((row.updated_at.isoformat() for row in settings_rows if row.setting_key == key and row.updated_at), None),
            }
            for key, defaults in DEFAULTS.items()
        ]
    }


@router.put("/settings/{setting_key}")
def update_platform_setting(
    setting_key: str,
    payload: PlatformSettingUpdateRequest,
    request: Request,
    platform_user: dict = Depends(require_platform_permission("platform.settings.manage")),
    db: Session = Depends(get_db),
):
    if platform_user.get("role") != "Platform Super Admin":
        raise HTTPException(status_code=403, detail="Only Platform Super Admins can modify global settings.")
    from app.services.platform_config import validate_platform_setting
    validated_value = validate_platform_setting(setting_key, payload.value_json)
    expected_category = setting_key.split(".", 1)[1].replace("_", " ").title()
    if payload.category and payload.category.lower() not in {expected_category.lower(), "general", "security", "ticket routing"}:
        raise HTTPException(status_code=422, detail="Setting category does not match setting_key.")
    platform_tenant = ensure_platform_seeded(db)
    actor_id = UUID(str(platform_user["user_id"]))
    setting = db.query(PlatformSetting).filter(PlatformSetting.setting_key == setting_key).with_for_update().first()
    before_value = dict(setting.value_json or {}) if setting else None
    if setting is None:
        setting = PlatformSetting(setting_key=setting_key, category=expected_category, value_json=validated_value,
                                  description=payload.description, updated_by=actor_id)
        db.add(setting)
    else:
        setting.category = expected_category
        setting.value_json = validated_value
        setting.description = payload.description
        setting.updated_by = actor_id
    log_audit(db=db, tenant_id=platform_tenant.id, user_id=actor_id, action="UPDATE_PLATFORM_SETTING",
              module="platform_settings", record_id=setting_key,
              description=f"Updated platform setting '{setting_key}'", before_data=before_value,
              after_data={"value": validated_value, "actor_role": platform_user.get("role"),
                          "source_ip": request.client.host if request.client else None})
    db.commit()
    return {"setting_key": setting.setting_key, "category": setting.category,
            "value_json": setting.value_json, "description": setting.description}


@router.patch("/profile")
def update_my_platform_profile(
    payload: UserProfileUpdate,
    request: Request,
    platform_user: dict = Depends(require_platform_employee),
    db: Session = Depends(get_db),
):
    user_id = UUID(str(platform_user["user_id"]))
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    before_value = {"full_name": user.full_name, "phone": user.phone, "job_title": user.job_title}
    user.full_name = payload.full_name.strip()
    if payload.phone is not None:
        user.phone = payload.phone.strip()
    if payload.job_title is not None:
        user.job_title = payload.job_title.strip()
    platform_tenant = ensure_platform_seeded(db)
    log_audit(db=db, tenant_id=platform_tenant.id, user_id=user_id, action="UPDATE_PLATFORM_PROFILE",
              module="platform_profile", record_id=user_id, description="Updated own platform employee profile",
              before_data=before_value, after_data={"full_name": user.full_name, "phone": user.phone,
                  "job_title": user.job_title, "actor_role": platform_user.get("role"),
                  "source_ip": request.client.host if request.client else None})
    db.commit()
    db.refresh(user)
    return {
        "message": "Profile updated successfully",
        "user": {
            "id": str(user.id),
            "full_name": user.full_name,
            "email": user.email,
            "phone": user.phone,
            "job_title": user.job_title,
        },
    }


# ============================================================================
# 10. MANUAL PAYMENT VERIFICATION, SUBSCRIPTION LIFECYCLE & REMINDER CAMPAIGNS (PARTS 4, 5, 8, 9, 10, 12)
# ============================================================================

from app.core.subscription_config import FREE_TRIAL_DAYS, ensure_utc, get_industry_enabled_modules, utc_now
from app.models.platform import (
    PlatformSubscriptionEvent,
    PlatformSubscriptionReminderCampaign,
    PlatformSubscriptionReminderLog,
)
from app.schemas.subscription import (
    AdminComplimentarySubscriptionRequest,
    AdminPaymentApprovalRequest,
    AdminPaymentRejectionRequest,
    AdminSubscriptionReactivationRequest,
    AdminSubscriptionSuspensionRequest,
)
from app.services.subscription_service import (
    approve_manual_payment_and_activate_subscription,
    generate_upcoming_renewal_invoices,
    process_subscription_lifecycle_transitions,
    process_trial_and_post_trial_reminders,
    record_subscription_event,
    reject_manual_payment_submission,
    serialize_invoice,
    serialize_payment,
    serialize_reminder_campaign,
    serialize_subscription,
    sync_tenant_subscription_state,
)


@router.get("/subscriptions/trialing")
def list_trialing_tenant_subscriptions(
    platform_user: dict = Depends(require_platform_permission("platform.billing.view")),
    db: Session = Depends(get_db),
):
    """PART 12 – View all currently trialing tenants."""
    process_subscription_lifecycle_transitions(db)
    subs = (
        db.query(PlatformTenantSubscription)
        .filter(PlatformTenantSubscription.status == "Trial")
        .order_by(PlatformTenantSubscription.trial_end_date.asc())
        .all()
    )
    return {
        "items": [serialize_subscription(db, s) for s in subs],
        "total": len(subs),
    }


@router.get("/subscriptions/expired-trials")
def list_expired_trial_subscriptions(
    platform_user: dict = Depends(require_platform_permission("platform.billing.view")),
    db: Session = Depends(get_db),
):
    """PART 12 – View tenants whose 14-day free trial has expired without activating a paid subscription."""
    process_subscription_lifecycle_transitions(db)
    subs = (
        db.query(PlatformTenantSubscription)
        .filter(
            PlatformTenantSubscription.status == "Expired",
            PlatformTenantSubscription.activated_at.is_(None),
        )
        .order_by(PlatformTenantSubscription.expired_at.desc())
        .all()
    )
    return {
        "items": [serialize_subscription(db, s) for s in subs],
        "total": len(subs),
    }


@router.get("/subscriptions/pending-payments")
def list_tenants_with_pending_payments(
    platform_user: dict = Depends(require_platform_permission("platform.billing.view")),
    db: Session = Depends(get_db),
):
    """PART 12 – View tenants with Submitted / Under Review payments awaiting verification."""
    payments = (
        db.query(PlatformBillingPayment)
        .filter(PlatformBillingPayment.status.in_(["Submitted", "Under Review", "Pending"]))
        .order_by(PlatformBillingPayment.created_at.desc())
        .all()
    )
    return {
        "items": [serialize_payment(db, p) for p in payments],
        "total": len(payments),
    }


@router.get("/subscriptions/upcoming-renewals")
def list_upcoming_subscription_renewals(
    within_days: int = Query(default=30, ge=1, le=365),
    platform_user: dict = Depends(require_platform_permission("platform.billing.view")),
    db: Session = Depends(get_db),
):
    """PART 12 – View active subscriptions with upcoming renewals."""
    today = utc_now().date()
    horizon = today + timedelta(days=within_days)
    subs = (
        db.query(PlatformTenantSubscription)
        .filter(
            PlatformTenantSubscription.status.in_(["Active", "Past Due"]),
            PlatformTenantSubscription.renewal_date.is_not(None),
            PlatformTenantSubscription.renewal_date <= horizon,
        )
        .order_by(PlatformTenantSubscription.renewal_date.asc())
        .all()
    )
    return {
        "items": [serialize_subscription(db, s) for s in subs],
        "total": len(subs),
    }


@router.get("/subscriptions/expired")
def list_expired_subscriptions(
    platform_user: dict = Depends(require_platform_permission("platform.billing.view")),
    db: Session = Depends(get_db),
):
    """PART 12 – View all expired subscriptions."""
    process_subscription_lifecycle_transitions(db)
    subs = (
        db.query(PlatformTenantSubscription)
        .filter(PlatformTenantSubscription.status == "Expired")
        .order_by(PlatformTenantSubscription.updated_at.desc())
        .all()
    )
    return {
        "items": [serialize_subscription(db, s) for s in subs],
        "total": len(subs),
    }


@router.get("/billing/invoices/overdue")
def list_overdue_platform_invoices(
    platform_user: dict = Depends(require_platform_permission("platform.billing.view")),
    db: Session = Depends(get_db),
):
    """PART 12 – View Issued and Overdue platform invoices."""
    process_subscription_lifecycle_transitions(db)
    invoices = (
        db.query(PlatformBillingInvoice)
        .filter(PlatformBillingInvoice.status.in_(["Issued", "Overdue"]))
        .order_by(PlatformBillingInvoice.due_date.asc())
        .all()
    )
    return {
        "items": [serialize_invoice(db, inv) for inv in invoices],
        "total": len(invoices),
    }


@router.get("/billing/payments/submitted")
def list_submitted_payment_proofs(
    platform_user: dict = Depends(require_platform_permission("platform.billing.view")),
    db: Session = Depends(get_db),
):
    """PART 12 – View submitted payment proofs awaiting Platform Admin verification."""
    rows = (
        db.query(PlatformBillingPayment)
        .filter(PlatformBillingPayment.status.in_(["Submitted", "Under Review"]))
        .order_by(PlatformBillingPayment.created_at.desc())
        .all()
    )
    return {
        "items": [serialize_payment(db, p) for p in rows],
        "total": len(rows),
    }


@router.patch("/billing/payments/{payment_id}/review")
def mark_payment_under_review(
    payment_id: UUID,
    payload: AdminPaymentApprovalRequest | None = None,
    platform_user: dict = Depends(require_platform_permission("platform.billing.manage")),
    db: Session = Depends(get_db),
):
    """PART 4 – Mark a Submitted payment as Under Review."""
    platform_tenant = ensure_platform_seeded(db)
    actor_id = UUID(str(platform_user["user_id"]))
    payment = (
        db.query(PlatformBillingPayment)
        .filter(PlatformBillingPayment.id == payment_id)
        .with_for_update()
        .first()
    )
    if not payment:
        raise HTTPException(status_code=404, detail="Payment submission not found.")
    if payment.status != "Submitted":
        raise HTTPException(status_code=409, detail=f"Only Submitted payments can be marked Under Review (current: {payment.status}).")

    payment.status = "Under Review"
    if payload and payload.admin_notes:
        payment.admin_notes = payload.admin_notes

    record_subscription_event(
        db=db,
        tenant_id=payment.tenant_id,
        invoice_id=payment.invoice_id,
        payment_id=payment.id,
        actor_user_id=actor_id,
        event_type="PAYMENT_UNDER_REVIEW",
        previous_status="Submitted",
        new_status="Under Review",
        description=f"Payment {payment.transaction_reference} placed Under Review by Platform Admin.",
    )
    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=actor_id,
        action="REVIEW_PAYMENT",
        module="platform_billing",
        record_id=payment.id,
        description=f"Marked payment {payment.transaction_reference} as Under Review",
    )
    db.commit()
    db.refresh(payment)
    return {"message": "Payment marked as Under Review.", "payment": serialize_payment(db, payment)}


@router.post("/billing/payments/{payment_id}/approve")
@router.patch("/billing/payments/{payment_id}/approve")
def approve_platform_manual_payment(
    payment_id: UUID,
    payload: AdminPaymentApprovalRequest | None = None,
    platform_user: dict = Depends(require_platform_permission("platform.billing.manage")),
    db: Session = Depends(get_db),
):
    """
    PART 4 & PART 5 – Authorized Platform Admin billing personnel verifies and approves a manual payment:
    - Marks payment Succeeded
    - Marks invoice Paid
    - Marks subscription Active and applies purchased plan resources
    - Stops trial/post-trial email reminders immediately
    - Records audit history and notifies tenant by email
    """
    platform_tenant = ensure_platform_seeded(db)
    actor_id = UUID(str(platform_user["user_id"]))
    return approve_manual_payment_and_activate_subscription(
        db=db,
        payment_id=payment_id,
        admin_user_id=actor_id,
        platform_tenant_id=platform_tenant.id,
        admin_notes=payload.admin_notes if payload else None,
    )


@router.post("/billing/payments/{payment_id}/reject")
@router.patch("/billing/payments/{payment_id}/reject")
def reject_platform_manual_payment(
    payment_id: UUID,
    payload: AdminPaymentRejectionRequest,
    platform_user: dict = Depends(require_platform_permission("platform.billing.manage")),
    db: Session = Depends(get_db),
):
    """
    PART 4 & PART 12 – Authorized Platform Admin rejects a payment submission with a reason.
    Does not mark invoice Paid and does not activate subscription.
    """
    platform_tenant = ensure_platform_seeded(db)
    actor_id = UUID(str(platform_user["user_id"]))
    return reject_manual_payment_submission(
        db=db,
        payment_id=payment_id,
        admin_user_id=actor_id,
        rejection_reason=payload.rejection_reason,
        platform_tenant_id=platform_tenant.id,
    )


@router.post("/subscriptions/{subscription_id}/suspend")
def suspend_tenant_subscription(
    subscription_id: UUID,
    payload: AdminSubscriptionSuspensionRequest,
    platform_user: dict = Depends(require_platform_permission("platform.billing.manage")),
    db: Session = Depends(get_db),
):
    """PART 10 & PART 12 – Suspend a tenant subscription with authorization and audit logging."""
    platform_tenant = ensure_platform_seeded(db)
    actor_id = UUID(str(platform_user["user_id"]))
    sub = (
        db.query(PlatformTenantSubscription)
        .filter(PlatformTenantSubscription.id == subscription_id)
        .with_for_update()
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found.")

    prev_status = sub.status
    now_utc = utc_now()
    sub.status = "Suspended"
    sub.suspended_at = now_utc
    sub.suspension_reason = payload.reason.strip()

    record_subscription_event(
        db=db,
        tenant_id=sub.tenant_id,
        subscription_id=sub.id,
        actor_user_id=actor_id,
        event_type="SUBSCRIPTION_SUSPENDED",
        previous_status=prev_status,
        new_status="Suspended",
        description=f"Platform Admin suspended subscription: {sub.suspension_reason}",
    )
    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=actor_id,
        action="SUSPEND_SUBSCRIPTION",
        module="platform_billing",
        record_id=sub.id,
        description=f"Suspended subscription {sub.id}: {sub.suspension_reason}",
        before_data={"status": prev_status},
        after_data={"status": "Suspended", "reason": sub.suspension_reason},
    )
    db.commit()
    db.refresh(sub)
    return {"message": "Subscription suspended.", "subscription": serialize_subscription(db, sub)}


@router.post("/subscriptions/{subscription_id}/reactivate")
def reactivate_tenant_subscription(
    subscription_id: UUID,
    payload: AdminSubscriptionReactivationRequest | None = None,
    platform_user: dict = Depends(require_platform_permission("platform.billing.manage")),
    db: Session = Depends(get_db),
):
    """PART 12 – Reactivate a suspended subscription with authorization and audit logging."""
    platform_tenant = ensure_platform_seeded(db)
    actor_id = UUID(str(platform_user["user_id"]))
    sub = (
        db.query(PlatformTenantSubscription)
        .filter(PlatformTenantSubscription.id == subscription_id)
        .with_for_update()
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found.")

    prev_status = sub.status
    now_utc = utc_now()
    sub.status = "Active"
    sub.suspended_at = None
    sub.suspension_reason = None
    sub.grace_period_ends_at = None
    if payload and payload.extend_days:
        new_end = now_utc + timedelta(days=payload.extend_days)
        sub.ends_at = new_end.replace(tzinfo=None)
        sub.renewal_date = new_end.date()
    elif sub.ends_at and ensure_utc(sub.ends_at) <= now_utc:
        default_days = 365 if sub.billing_cycle == "Annual" else 30
        new_end = now_utc + timedelta(days=default_days)
        sub.ends_at = new_end.replace(tzinfo=None)
        sub.renewal_date = new_end.date()

    reason_text = payload.reason if payload else "Reactivated by Platform Admin"
    record_subscription_event(
        db=db,
        tenant_id=sub.tenant_id,
        subscription_id=sub.id,
        actor_user_id=actor_id,
        event_type="SUBSCRIPTION_REACTIVATED",
        previous_status=prev_status,
        new_status="Active",
        description=f"Platform Admin reactivated subscription: {reason_text}",
    )
    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=actor_id,
        action="REACTIVATE_SUBSCRIPTION",
        module="platform_billing",
        record_id=sub.id,
        description=f"Reactivated subscription {sub.id}: {reason_text}",
        before_data={"status": prev_status},
        after_data={"status": "Active"},
    )
    db.commit()
    db.refresh(sub)
    return {"message": "Subscription reactivated.", "subscription": serialize_subscription(db, sub)}


@router.post("/subscriptions/{subscription_id}/cancel")
def admin_cancel_tenant_subscription(
    subscription_id: UUID,
    payload: AdminSubscriptionSuspensionRequest,
    platform_user: dict = Depends(require_platform_permission("platform.billing.manage")),
    db: Session = Depends(get_db),
):
    """PART 10 – Platform Admin cancels a subscription with audit logging."""
    platform_tenant = ensure_platform_seeded(db)
    actor_id = UUID(str(platform_user["user_id"]))
    sub = (
        db.query(PlatformTenantSubscription)
        .filter(PlatformTenantSubscription.id == subscription_id)
        .with_for_update()
        .first()
    )
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found.")

    prev_status = sub.status
    now_utc = utc_now()
    sub.status = "Cancelled"
    sub.auto_renew = False
    sub.cancelled_at = now_utc.replace(tzinfo=None)
    sub.ends_at = now_utc.replace(tzinfo=None)

    record_subscription_event(
        db=db,
        tenant_id=sub.tenant_id,
        subscription_id=sub.id,
        actor_user_id=actor_id,
        event_type="SUBSCRIPTION_CANCELLED",
        previous_status=prev_status,
        new_status="Cancelled",
        description=f"Platform Admin cancelled subscription: {payload.reason.strip()}",
    )
    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=actor_id,
        action="CANCEL_SUBSCRIPTION",
        module="platform_billing",
        record_id=sub.id,
        description=f"Cancelled subscription {sub.id}: {payload.reason.strip()}",
    )
    db.commit()
    db.refresh(sub)
    return {"message": "Subscription cancelled.", "subscription": serialize_subscription(db, sub)}


@router.post("/subscriptions/complimentary", status_code=status.HTTP_201_CREATED)
def grant_complimentary_subscription(
    payload: AdminComplimentarySubscriptionRequest,
    platform_user: dict = Depends(require_platform_permission("platform.owner.manage")),
    db: Session = Depends(get_db),
):
    """
    PART 12 – Manual complimentary subscriptions and exceptional manual activation
    require Platform Super Admin (platform.owner.manage) permission and full audit logging.
    """
    platform_tenant = ensure_platform_seeded(db)
    actor_id = UUID(str(platform_user["user_id"]))
    tenant = db.query(Tenant).filter(Tenant.id == payload.tenant_id, Tenant.is_platform.is_(False)).with_for_update().first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Customer tenant not found.")

    plan = None
    if payload.plan_id:
        plan = db.query(PlatformSubscriptionPlan).filter(PlatformSubscriptionPlan.id == payload.plan_id).first()
    elif payload.plan_key:
        plan = db.query(PlatformSubscriptionPlan).filter(func.lower(PlatformSubscriptionPlan.plan_key) == payload.plan_key.strip().lower()).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Subscription plan not found.")

    now_utc = utc_now()
    end_utc = now_utc + timedelta(days=payload.duration_days)
    sub = (
        db.query(PlatformTenantSubscription)
        .filter(PlatformTenantSubscription.tenant_id == tenant.id)
        .order_by(PlatformTenantSubscription.created_at.desc())
        .with_for_update()
        .first()
    )
    prev_status = sub.status if sub else None
    applied_limits = {
        "plan_id": str(plan.id),
        "plan_key": plan.plan_key,
        "plan_name": plan.name,
        "billing_cycle": payload.billing_cycle,
        "max_users": plan.max_users,
        "max_branches": plan.max_branches,
        "storage_limit_gb": plan.storage_limit_gb,
        "storage_limit_bytes": plan.storage_limit_gb * 1024 * 1024 * 1024,
        "features": list(plan.features_json or []),
        "enabled_modules": list(plan.enabled_modules_json or []) or get_industry_enabled_modules(tenant.industry),
        "limits": dict(plan.limits_json or {}),
    }

    if not sub:
        sub = PlatformTenantSubscription(
            tenant_id=tenant.id,
            plan_id=plan.id,
            selected_plan_id=plan.id,
            selected_billing_cycle=payload.billing_cycle,
            status="Active",
            billing_cycle=payload.billing_cycle,
            auto_renew=False,
            starts_at=now_utc.replace(tzinfo=None),
            ends_at=end_utc.replace(tzinfo=None),
            renewal_date=end_utc.date(),
            activated_at=now_utc,
            activated_by=actor_id,
            is_complimentary=True,
            applied_limits_json=applied_limits,
        )
        db.add(sub)
        db.flush()
    else:
        sub.plan_id = plan.id
        sub.selected_plan_id = plan.id
        sub.selected_billing_cycle = payload.billing_cycle
        sub.billing_cycle = payload.billing_cycle
        sub.status = "Active"
        sub.auto_renew = False
        sub.starts_at = now_utc.replace(tzinfo=None)
        sub.ends_at = end_utc.replace(tzinfo=None)
        sub.renewal_date = end_utc.date()
        sub.activated_at = now_utc
        sub.activated_by = actor_id
        sub.is_complimentary = True
        sub.applied_limits_json = applied_limits

    tenant.status = "Active"
    camp = db.query(PlatformSubscriptionReminderCampaign).filter(PlatformSubscriptionReminderCampaign.tenant_id == tenant.id).first()
    if camp:
        camp.campaign_status = "Stopped_Subscribed"
        camp.stopped_at = now_utc
        camp.stopped_reason = f"Complimentary subscription activated: {payload.reason}"

    record_subscription_event(
        db=db,
        tenant_id=tenant.id,
        subscription_id=sub.id,
        actor_user_id=actor_id,
        event_type="COMPLIMENTARY_ACTIVATED",
        previous_status=prev_status,
        new_status="Active",
        description=f"Complimentary {plan.name} subscription granted for {payload.duration_days} days: {payload.reason}",
    )
    log_audit(
        db=db,
        tenant_id=platform_tenant.id,
        user_id=actor_id,
        action="GRANT_COMPLIMENTARY_SUBSCRIPTION",
        module="platform_billing",
        record_id=sub.id,
        description=f"Granted complimentary {plan.name} subscription to {tenant.name}: {payload.reason}",
        after_data={"plan": plan.name, "duration_days": payload.duration_days, "reason": payload.reason},
    )
    db.commit()
    db.refresh(sub)
    return {"message": "Complimentary subscription activated.", "subscription": serialize_subscription(db, sub)}


@router.get("/reminders/campaigns")
def list_reminder_campaigns(
    campaign_status: str | None = Query(default=None),
    platform_user: dict = Depends(require_platform_permission("platform.billing.view")),
    db: Session = Depends(get_db),
):
    """PART 12 – View trial and post-trial 30-day reminder campaign statuses across tenants."""
    q = db.query(PlatformSubscriptionReminderCampaign)
    if campaign_status:
        q = q.filter(PlatformSubscriptionReminderCampaign.campaign_status == campaign_status)
    rows = q.order_by(PlatformSubscriptionReminderCampaign.updated_at.desc()).all()
    return {
        "items": [serialize_reminder_campaign(db, c) for c in rows],
        "total": len(rows),
    }


@router.post("/reminders/run")
def run_reminder_campaigns_now(
    reference_date: date | None = Query(default=None),
    force_retry: bool = Query(default=False),
    platform_user: dict = Depends(require_platform_permission("platform.billing.manage")),
    db: Session = Depends(get_db),
):
    """Trigger pre-expiration trial reminders and post-trial 30-day campaign processing."""
    from datetime import time, timezone
    ref_dt = datetime.combine(reference_date, time(12, 0), tzinfo=timezone.utc) if reference_date else utc_now()
    summary = process_trial_and_post_trial_reminders(db, reference_time=ref_dt, force_retry=force_retry)
    return {"message": "Reminder campaign run completed.", **summary}


@router.post("/renewals/generate-invoices")
def run_renewal_invoice_generation_now(
    reference_date: date | None = Query(default=None),
    lead_days: int = Query(default=7, ge=0, le=60),
    platform_user: dict = Depends(require_platform_permission("platform.billing.manage")),
    db: Session = Depends(get_db),
):
    """PART 10 – Trigger renewal invoice generation for upcoming subscription renewals."""
    summary = generate_upcoming_renewal_invoices(db, today=reference_date, lead_days=lead_days)
    return {"message": "Renewal invoice generation completed.", **summary}


@router.get("/subscriptions/audit-history")
def list_subscription_audit_history(
    tenant_id: UUID | None = Query(default=None),
    event_type: str | None = Query(default=None),
    platform_user: dict = Depends(require_platform_permission("platform.billing.view")),
    db: Session = Depends(get_db),
):
    """PART 12 – View subscription and payment verification audit history across tenants."""
    q = db.query(PlatformSubscriptionEvent)
    if tenant_id:
        q = q.filter(PlatformSubscriptionEvent.tenant_id == tenant_id)
    if event_type:
        q = q.filter(PlatformSubscriptionEvent.event_type == event_type)
    events = q.order_by(PlatformSubscriptionEvent.created_at.desc()).limit(200).all()
    return {
        "items": [
            {
                "id": str(ev.id),
                "tenant_id": str(ev.tenant_id),
                "subscription_id": str(ev.subscription_id) if ev.subscription_id else None,
                "invoice_id": str(ev.invoice_id) if ev.invoice_id else None,
                "payment_id": str(ev.payment_id) if ev.payment_id else None,
                "actor_user_id": str(ev.actor_user_id) if ev.actor_user_id else None,
                "event_type": ev.event_type,
                "previous_status": ev.previous_status,
                "new_status": ev.new_status,
                "description": ev.description,
                "metadata": ev.metadata_json or {},
                "created_at": ev.created_at.isoformat() if ev.created_at else None,
            }
            for ev in events
        ],
        "total": len(events),
    }


@router.get("/subscriptions/{subscription_id}/events")
def get_subscription_events_by_id(
    subscription_id: UUID,
    platform_user: dict = Depends(require_platform_permission("platform.billing.view")),
    db: Session = Depends(get_db),
):
    events = (
        db.query(PlatformSubscriptionEvent)
        .filter(PlatformSubscriptionEvent.subscription_id == subscription_id)
        .order_by(PlatformSubscriptionEvent.created_at.desc())
        .all()
    )
    return {
        "items": [
            {
                "id": str(ev.id),
                "event_type": ev.event_type,
                "previous_status": ev.previous_status,
                "new_status": ev.new_status,
                "description": ev.description,
                "metadata": ev.metadata_json or {},
                "created_at": ev.created_at.isoformat() if ev.created_at else None,
            }
            for ev in events
        ],
        "total": len(events),
    }
