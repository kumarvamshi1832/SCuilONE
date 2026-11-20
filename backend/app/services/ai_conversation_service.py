"""Stateful AI conversation orchestrator, Python validator, and requirement confirmation service."""
import re
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy import func, or_
from sqlalchemy.orm import Session, selectinload

from app.core.ai_config import get_ollama_config
from app.core.industry_registry import normalize_industry_key
from app.models.account import Account
from app.models.ai_conversation import AIConversation, AIMessage
from app.models.customer_portal import CustomerPortalInvitation
from app.models.buyer_requirement import BuyerRequirement
from app.models.contact import Contact
from app.models.deal import Deal
from app.models.lead import Lead
from app.models.notification import Notification
from app.models.software_requirement import SoftwareRequirement
from app.models.tenant import Tenant
from app.models.user import User
from app.models.role import Role
from app.models.user_role import UserRole
from app.schemas.ai_conversation import (
    RESIDENTIAL_PROPERTY_TYPES,
    RealEstateExtractedRequirement,
    SoftwareExtractedRequirement,
    sanitize_text,
)
from app.services.audit_service import log_audit
from app.services.ollama_service import run_ollama_extraction

# Only ask customers for details needed to create a useful requirement.
# All other extracted fields remain optional and are included when supplied.
REAL_ESTATE_REQUIRED_FIELDS = [
    "buy_or_rent",
    "city",
    "property_type",
]

SOFTWARE_REQUIRED_FIELDS = [
    "project_type",
    "business_objective",
]

MAX_USER_MESSAGES_PER_CONVERSATION = 60

FIELD_LABELS = {
    "buy_or_rent": "whether you want to Buy, Rent or Lease",
    "city": "preferred city",
    "locality": "preferred locality / neighborhood",
    "property_type": "property type (e.g., Apartment, Villa, Plot, Office)",
    "bedrooms": "number of bedrooms (BHK)",
    "min_budget": "minimum budget",
    "max_budget": "maximum budget",
    "min_area": "minimum area",
    "max_area": "maximum area",
    "area_unit": "area unit (sqft, sqm, sqyd, acre)",
    "possession_timeline": "purchase or possession timeline",
    "amenities": "desired amenities (or 'None')",
    "parking": "parking requirement (e.g., 1 covered car parking)",
    "project_type": "project type (Website, Web Application, Mobile Application, API Development, or Custom Software)",
    "business_objective": "core business objective",
    "features": "key features required",
    "user_roles": "user roles (e.g., Admin, Customer, Staff)",
    "expected_users": "expected number of users",
    "platforms": "target platforms (e.g., Web, iOS, Android)",
    "integrations": "third-party integrations (or 'None')",
    "security_requirements": "security/compliance requirements",
    "design_preferences": "UI/UX design preferences",
    "technology_preferences": "technology stack preferences (or 'Open')",
    "timeline": "expected delivery timeline or target date",
}


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def naive_utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def resolve_tenant_ai_industry(db: Session, tenant_id: UUID) -> str:
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    norm = normalize_industry_key(tenant.industry)
    if norm == "real_estate":
        return "real_estate"
    if norm == "software_companies":
        return "software"
    raise HTTPException(
        status_code=403,
        detail=f"AI requirement collection is supported for Real Estate and Software Services tenants (current: {tenant.industry}).",
    )


def verify_portal_customer_relationships(db: Session, portal: dict) -> tuple[Account, Contact, Lead | None]:
    """Verify portal ownership and link a lead only when the relationship is unambiguous."""
    tenant_id = portal["tenant_id"]
    account_id = portal["account_id"]
    contact_id = portal["contact_id"]

    account = db.query(Account).filter(
        Account.id == account_id,
        Account.tenant_id == tenant_id,
    ).first()
    contact = db.query(Contact).filter(
        Contact.id == contact_id,
        Contact.tenant_id == tenant_id,
        Contact.account_id == account_id,
    ).first()
    if not account or not contact:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Customer portal contact or account relationship is invalid for this tenant.",
        )

    # Some trusted callers may supply a lead explicitly. Validate both tenant and
    # relationship before using it; never accept an arbitrary/cross-tenant ID.
    explicit_lead_id = portal.get("lead_id")
    if explicit_lead_id:
        explicit_lead = db.query(Lead).filter(
            Lead.id == explicit_lead_id,
            Lead.tenant_id == tenant_id,
        ).first()
        if explicit_lead and (
            explicit_lead.account_id == account_id
            or (
                contact.email and explicit_lead.email
                and explicit_lead.email.strip().lower() == contact.email.strip().lower()
            )
        ):
            return account, contact, explicit_lead

    # Email is the strongest available relationship in the current portal schema.
    # Use it only when it identifies exactly one lead in this tenant.
    emails = {
        value.strip().lower()
        for value in (contact.email, portal.get("email"))
        if value and value.strip()
    }
    if emails:
        email_matches = db.query(Lead).filter(
            Lead.tenant_id == tenant_id,
            func.lower(Lead.email).in_(emails),
        ).all()
        if len(email_matches) == 1:
            return account, contact, email_matches[0]
        if len(email_matches) > 1:
            return account, contact, None

    # An account may legitimately have many leads. Link by account only if there
    # is exactly one candidate; otherwise keep lead_id NULL.
    account_matches = db.query(Lead).filter(
        Lead.tenant_id == tenant_id,
        Lead.account_id == account_id,
    ).all()
    lead = account_matches[0] if len(account_matches) == 1 else None
    return account, contact, lead


def resolve_active_assignee(
    db: Session,
    tenant_id: UUID,
    lead: Lead | None,
    portal: dict | None = None,
) -> UUID | None:
    """Prefer the staff member who sent the portal invitation, then the linked lead owner."""
    candidate_ids: list[UUID] = []
    if portal:
        invitation = (
            db.query(CustomerPortalInvitation)
            .filter(
                CustomerPortalInvitation.tenant_id == tenant_id,
                CustomerPortalInvitation.portal_user_id == portal.get("portal_user_id"),
                CustomerPortalInvitation.revoked.is_(False),
            )
            .order_by(CustomerPortalInvitation.created_at.desc())
            .first()
        )
        if invitation and invitation.invited_by_user_id:
            candidate_ids.append(invitation.invited_by_user_id)
        # Support an explicitly resolved inviter supplied by a trusted internal caller.
        explicit_inviter = portal.get("invited_by_user_id")
        if explicit_inviter:
            candidate_ids.insert(0, explicit_inviter)

    if lead and lead.assigned_to:
        candidate_ids.append(lead.assigned_to)

    for candidate_id in candidate_ids:
        active_user = db.query(User.id).filter(
            User.id == candidate_id,
            User.tenant_id == tenant_id,
            User.status == "Active",
        ).first()
        if active_user:
            return candidate_id
    return None


def notify_requirement_managers(
    db: Session,
    tenant_id: UUID,
    contact: Contact,
    portal_email: str,
    target_module: str,
    target_record_id: UUID,
    industry_type: str,
) -> None:
    """Notify active tenant owners/admins/managers when no reliable salesperson exists."""
    manager_ids = [row[0] for row in (
        db.query(User.id)
        .join(UserRole, UserRole.user_id == User.id)
        .join(Role, Role.id == UserRole.role_id)
        .filter(
            User.tenant_id == tenant_id,
            User.status == "Active",
            Role.name.in_(("Tenant Owner", "Tenant Admin", "Manager")),
        )
        .distinct()
        .all()
    )]
    for manager_id in manager_ids:
        db.add(Notification(
            tenant_id=tenant_id,
            recipient_user_id=manager_id,
            workflow_id=None,
            title="Customer requirement needs assignment",
            message=(
                f"{contact.full_name} ({portal_email}) confirmed a {industry_type.replace('_', ' ')} "
                "requirement. No active invitation-linked salesperson or linked-lead owner was found; "
                "please assign it to a team member."
            ),
            notification_type="customer_portal",
            related_module=target_module,
            related_record_id=target_record_id,
            is_read=False,
        ))


def _serialize_json_safe(data: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in data.items():
        if isinstance(v, Decimal):
            out[k] = str(v)
        elif isinstance(v, (date, datetime)):
            out[k] = v.isoformat()
        elif isinstance(v, UUID):
            out[k] = str(v)
        else:
            out[k] = v
    return out


def validate_and_analyze_extracted_data(
    industry_type: str,
    merged_raw: dict[str, Any],
) -> tuple[dict[str, Any], list[str], list[str]]:
    """Validate merged fields through Pydantic/Python and compute missing & unclear fields."""
    unclear: list[str] = []

    if industry_type == "real_estate":
        model = RealEstateExtractedRequirement.model_validate(merged_raw)
        clean = _serialize_json_safe(model.model_dump())

        if model.min_budget is not None and model.max_budget is not None and model.min_budget > model.max_budget:
            unclear.append("min_budget cannot exceed max_budget")
        if model.min_area is not None and model.max_area is not None and model.min_area > model.max_area:
            unclear.append("min_area cannot exceed max_area")

        missing: list[str] = []
        for field in REAL_ESTATE_REQUIRED_FIELDS:
            if field == "bedrooms" and model.property_type and model.property_type not in RESIDENTIAL_PROPERTY_TYPES:
                continue
            val = getattr(model, field, None)
            if val is None or val == "" or val == []:
                missing.append(field)
        return clean, missing, unclear

    model_sw = SoftwareExtractedRequirement.model_validate(merged_raw)
    clean_sw = _serialize_json_safe(model_sw.model_dump())

    if model_sw.min_budget is not None and model_sw.max_budget is not None and model_sw.min_budget > model_sw.max_budget:
        unclear.append("min_budget cannot exceed max_budget")

    missing_sw: list[str] = []
    for field in SOFTWARE_REQUIRED_FIELDS:
        val = getattr(model_sw, field, None)
        if val is None or val == "" or val == []:
            missing_sw.append(field)
    return clean_sw, missing_sw, unclear


def build_requirement_summary(industry_type: str, data: dict[str, Any], revision_number: int = 1) -> str:
    """Generate a clear, deterministic summary of the Python-validated requirement."""
    if industry_type == "real_estate":
        amenities_str = ", ".join(data.get("amenities") or []) or "None specified"
        return (
            f"Real Estate Buyer Requirement Summary (Revision {revision_number}):\n"
            f"- Purpose: {data.get('buy_or_rent') or 'Not specified'}\n"
            f"- Property Type: {data.get('property_type') or 'Not specified'}\n"
            f"- City & Locality: {data.get('city') or 'N/A'}, {data.get('locality') or 'N/A'}\n"
            f"- Bedrooms: {data.get('bedrooms') if data.get('bedrooms') is not None else 'N/A'}\n"
            f"- Budget Range: {data.get('min_budget') or '0.00'} to {data.get('max_budget') or 'N/A'} INR\n"
            f"- Area Range: {data.get('min_area') or '0.00'} to {data.get('max_area') or 'N/A'} {data.get('area_unit') or 'sqft'}\n"
            f"- Possession Timeline: {data.get('possession_timeline') or 'N/A'}\n"
            f"- Amenities: {amenities_str}\n"
            f"- Parking: {data.get('parking') or 'N/A'}\n"
            f"- Additional Preferences: {data.get('additional_preferences') or 'None'}"
        )

    features_str = ", ".join(data.get("features") or []) or "None specified"
    roles_str = ", ".join(data.get("user_roles") or []) or "None specified"
    return (
        f"Software Services Requirement Summary (Revision {revision_number}):\n"
        f"- Project Type: {data.get('project_type') or 'Not specified'}\n"
        f"- Title: {data.get('title') or (str(data.get('project_type') or 'Software') + ' Project')}\n"
        f"- Business Objective: {data.get('business_objective') or 'N/A'}\n"
        f"- Key Features: {features_str}\n"
        f"- User Roles: {roles_str}\n"
        f"- Expected Users: {data.get('expected_users') or 'N/A'}\n"
        f"- Target Platforms: {data.get('platforms') or 'N/A'}\n"
        f"- Integrations: {data.get('integrations') or 'N/A'}\n"
        f"- Security Requirements: {data.get('security_requirements') or 'N/A'}\n"
        f"- Design Preferences: {data.get('design_preferences') or 'N/A'}\n"
        f"- Technology Preferences: {data.get('technology_preferences') or 'N/A'}\n"
        f"- Budget Range: {data.get('min_budget') or '0.00'} to {data.get('max_budget') or 'N/A'} {data.get('currency') or 'INR'}\n"
        f"- Timeline: {data.get('timeline') or 'N/A'}\n"
        f"- Additional Requirements: {data.get('other_business_requirements') or 'None'}"
    )


def build_follow_up_reply(
    industry_type: str,
    extracted_data: dict[str, Any],
    missing_fields: list[str],
    unclear_fields: list[str],
    summary_text: str | None,
    ai_suggested_reply: str | None = None,
) -> str:
    """Produce a helpful conversational response that never repeats already-answered fields."""
    if unclear_fields:
        return (
            "I noticed an inconsistency in the details provided: "
            + "; ".join(unclear_fields)
            + ". Could you please clarify those values?"
        )

    if not missing_fields and summary_text:
        return (
            "Thank you! I have collected all required details. Please review your requirement summary below "
            "and confirm if everything is accurate, or let me know if you would like any corrections:\n\n"
            f"{summary_text}"
        )

    next_batch = missing_fields[:3]
    prompts = [FIELD_LABELS.get(f, f.replace("_", " ")) for f in next_batch]
    if len(prompts) == 1:
        question_str = f"Could you please share your {prompts[0]}?"
    else:
        question_str = "Could you please share your " + ", ".join(prompts[:-1]) + f", and {prompts[-1]}?"

    if ai_suggested_reply and "?" in ai_suggested_reply and len(ai_suggested_reply) <= 450:
        return f"{ai_suggested_reply.strip()}\n\n({question_str})"
    return question_str


def parse_timeline_to_target_date(timeline_str: str | None) -> date | None:
    """Return a date only when the customer supplied an explicit calendar date.

    Relative durations (for example, '4 months' or 'in 2 weeks') remain as
    timeline text in the requirement notes and are not converted into invented
    calendar deadlines.
    """
    if not timeline_str:
        return None
    raw = timeline_str.strip()
    iso_match = re.search(r"(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)", raw)
    if iso_match:
        try:
            return date.fromisoformat(iso_match.group(1))
        except ValueError:
            return None

    # Accept explicit, unambiguous day-month-year calendar dates.
    patterns = (
        "%d %B %Y", "%d %b %Y", "%B %d, %Y", "%b %d, %Y",
    )
    for pattern in patterns:
        try:
            return datetime.strptime(raw, pattern).date()
        except ValueError:
            continue
    return None


def get_owned_conversation_or_404(
    db: Session,
    tenant_id: UUID,
    portal_user_id: UUID,
    conversation_id: UUID,
    lock: bool = False,
) -> AIConversation:
    query = (
        db.query(AIConversation)
        .options(selectinload(AIConversation.messages))
        .filter(
            AIConversation.id == conversation_id,
            AIConversation.tenant_id == tenant_id,
            AIConversation.portal_user_id == portal_user_id,
        )
    )
    if lock:
        query = query.with_for_update()
    conv = query.first()
    if not conv:
        raise HTTPException(status_code=404, detail="AI conversation not found for your account.")
    return conv


async def start_or_resume_ai_conversation(
    db: Session,
    portal: dict,
    force_new: bool = False,
    initial_message: str | None = None,
) -> AIConversation:
    tenant_id = portal["tenant_id"]
    portal_user_id = portal["portal_user_id"]
    account, contact, lead = verify_portal_customer_relationships(db, portal)
    industry_type = resolve_tenant_ai_industry(db, tenant_id)
    cfg = get_ollama_config()

    if not force_new:
        existing = (
            db.query(AIConversation)
            .options(selectinload(AIConversation.messages))
            .filter(
                AIConversation.tenant_id == tenant_id,
                AIConversation.portal_user_id == portal_user_id,
                AIConversation.industry_type == industry_type,
                AIConversation.status.in_(["Active", "Ready_For_Confirmation", "Revision_In_Progress"]),
            )
            .order_by(AIConversation.updated_at.desc())
            .first()
        )
        if existing:
            if initial_message and initial_message.strip():
                return await process_customer_ai_message(db, portal, existing.id, initial_message.strip())
            return existing

    initial_missing = (
        list(REAL_ESTATE_REQUIRED_FIELDS)
        if industry_type == "real_estate"
        else list(SOFTWARE_REQUIRED_FIELDS)
    )
    conv = AIConversation(
        tenant_id=tenant_id,
        portal_user_id=portal_user_id,
        account_id=account.id,
        contact_id=contact.id,
        lead_id=lead.id if lead else None,
        industry_type=industry_type,
        model_tag=cfg["model"],
        status="Active",
        extracted_data_json={},
        missing_fields_json=initial_missing,
        unclear_fields_json=[],
        revision_number=1,
        revision_history_json=[],
    )
    db.add(conv)
    db.flush()

    if industry_type == "real_estate":
        greeting = (
            f"Hello {contact.full_name}! I am your Real Estate requirement assistant. "
            "To help match the right properties for you, are you looking to Buy, Rent or Lease, "
            "and what city, locality, and property type do you prefer?"
        )
    else:
        greeting = (
            f"Hello {contact.full_name}! I am your Software Services requirement assistant. "
            "What type of software project are you planning (Website, Web Application, Mobile Application, "
            "API, or Custom Software), and what is your main business objective?"
        )

    db.add(
        AIMessage(
            tenant_id=tenant_id,
            conversation_id=conv.id,
            sender_role="assistant",
            content=greeting,
            model_tag=cfg["model"],
        )
    )
    log_audit(
        db,
        tenant_id=tenant_id,
        user_id=None,
        action="START_AI_CONVERSATION",
        module="ai_conversations",
        record_id=conv.id,
        description=f"Customer {portal['email']} started {industry_type} AI requirement conversation",
    )
    db.commit()
    db.refresh(conv)

    if initial_message and initial_message.strip():
        return await process_customer_ai_message(db, portal, conv.id, initial_message.strip())

    return get_owned_conversation_or_404(db, tenant_id, portal_user_id, conv.id)


async def process_customer_ai_message(
    db: Session,
    portal: dict,
    conversation_id: UUID,
    message_text: str,
) -> AIConversation:
    """Durable 2-commit message handler: commits customer message first, then runs Ollama & Python validation."""
    tenant_id = portal["tenant_id"]
    portal_user_id = portal["portal_user_id"]
    verify_portal_customer_relationships(db, portal)

    conv = get_owned_conversation_or_404(db, tenant_id, portal_user_id, conversation_id)
    if conv.status == "Closed":
        raise HTTPException(status_code=409, detail="This AI conversation is closed.")
    if conv.status == "Confirmed":
        raise HTTPException(
            status_code=409,
            detail="This requirement is already confirmed. Use the revise endpoint to start a controlled revision.",
        )

    user_sent = sum(1 for m in conv.messages if m.sender_role == "user")
    if user_sent >= MAX_USER_MESSAGES_PER_CONVERSATION:
        raise HTTPException(
            status_code=429,
            detail="Message limit reached for this conversation. Please confirm or start a new conversation.",
        )

    # COMMIT 1: Persist the customer's message before calling Ollama so it is never lost
    user_msg = AIMessage(
        tenant_id=tenant_id,
        conversation_id=conv.id,
        sender_role="user",
        content=message_text,
    )
    db.add(user_msg)
    conv.updated_at = utc_now()
    db.commit()
    db.refresh(conv)

    conv_id = conv.id
    industry_type = conv.industry_type
    recent_history = [
        {"role": m.sender_role, "content": m.content}
        for m in conv.messages
        if m.id != user_msg.id
    ][-6:]
    snapshot_data = dict(conv.extracted_data_json or {})
    snapshot_missing = list(conv.missing_fields_json or [])
    db.commit()  # end the transaction so no DB connection is held while waiting on Ollama

    delta, ai_reply, model_tag, latency_ms = await run_ollama_extraction(
        industry_type=industry_type,
        current_data=snapshot_data,
        missing_fields=snapshot_missing,
        user_message=message_text,
        recent_history=recent_history,
    )

    # Re-fetch with a row lock and merge against the freshest data (prevents lost updates
    # when two messages for the same conversation are processed at the same time).
    conv = get_owned_conversation_or_404(db, tenant_id, portal_user_id, conv_id, lock=True)
    current_data = dict(conv.extracted_data_json or {})

    merged_raw = dict(current_data)
    clean_delta: dict[str, Any] = {}
    for k, v in (delta or {}).items():
        if v is not None and v != "" and v != []:
            merged_raw[k] = v
            clean_delta[k] = v

    validated_data, missing_fields, unclear_fields = validate_and_analyze_extracted_data(
        conv.industry_type,
        merged_raw,
    )

    summary_text = None
    if not missing_fields and not unclear_fields:
        summary_text = build_requirement_summary(
            conv.industry_type,
            validated_data,
            revision_number=conv.revision_number,
        )
        conv.status = "Ready_For_Confirmation"
    elif conv.status == "Ready_For_Confirmation":
        conv.status = "Active"

    reply_text = build_follow_up_reply(
        industry_type=conv.industry_type,
        extracted_data=validated_data,
        missing_fields=missing_fields,
        unclear_fields=unclear_fields,
        summary_text=summary_text,
        ai_suggested_reply=ai_reply,
    )

    # COMMIT 2: Persist validated extraction state and assistant response
    conv.extracted_data_json = validated_data
    conv.missing_fields_json = missing_fields
    conv.unclear_fields_json = unclear_fields
    conv.summary_text = summary_text
    conv.model_tag = model_tag
    conv.updated_at = utc_now()

    assistant_msg = AIMessage(
        tenant_id=tenant_id,
        conversation_id=conv.id,
        sender_role="assistant",
        content=reply_text,
        extracted_delta_json=_serialize_json_safe(clean_delta) if clean_delta else None,
        model_tag=model_tag,
        latency_ms=latency_ms,
    )
    db.add(assistant_msg)
    db.commit()

    return get_owned_conversation_or_404(db, tenant_id, portal_user_id, conv.id)


def confirm_ai_requirement(
    db: Session,
    portal: dict,
    conversation_id: UUID,
    confirmed: bool,
    customer_notes: str | None = None,
) -> AIConversation:
    """Explicit customer confirmation creating or updating BuyerRequirement or SoftwareRequirement."""
    if not confirmed:
        raise HTTPException(
            status_code=400,
            detail="Explicit customer confirmation (confirmed=true) is required to save the requirement.",
        )

    tenant_id = portal["tenant_id"]
    portal_user_id = portal["portal_user_id"]
    account, contact, lead = verify_portal_customer_relationships(db, portal)

    conv = get_owned_conversation_or_404(db, tenant_id, portal_user_id, conversation_id, lock=True)

    # Idempotent return if already confirmed at current revision
    if conv.status == "Confirmed" and conv.confirmed_revision_number == conv.revision_number:
        return conv

    validated_data, missing_fields, unclear_fields = validate_and_analyze_extracted_data(
        conv.industry_type,
        dict(conv.extracted_data_json or {}),
    )
    if missing_fields or unclear_fields:
        raise HTTPException(
            status_code=422,
            detail={
                "message": "Requirement cannot be confirmed until all required fields are provided and valid.",
                "missing_fields": missing_fields,
                "unclear_fields": unclear_fields,
            },
        )

    now_aware = utc_now()
    now_naive = naive_utc_now()
    summary_text = build_requirement_summary(
        conv.industry_type,
        validated_data,
        revision_number=conv.revision_number,
    )
    conv.summary_text = summary_text

    if conv.industry_type == "real_estate":
        assigned_to = resolve_active_assignee(db, tenant_id, lead, portal=portal)
        structured_notes = (
            f"{summary_text}\n"
            f"Confirmed via Customer Portal by {portal['email']} at {now_aware.isoformat()}."
        )
        if customer_notes and customer_notes.strip():
            structured_notes += f"\nCustomer Confirmation Notes: {sanitize_text(customer_notes, 1000)}"

        min_b = Decimal(str(validated_data["min_budget"])) if validated_data.get("min_budget") is not None else None
        max_b = Decimal(str(validated_data["max_budget"])) if validated_data.get("max_budget") is not None else None
        min_a = Decimal(str(validated_data["min_area"])) if validated_data.get("min_area") is not None else None
        max_a = Decimal(str(validated_data["max_area"])) if validated_data.get("max_area") is not None else None

        if conv.buyer_requirement_id:
            req = (
                db.query(BuyerRequirement)
                .filter(
                    BuyerRequirement.id == conv.buyer_requirement_id,
                    BuyerRequirement.tenant_id == tenant_id,
                )
                .with_for_update()
                .first()
            )
            if not req:
                raise HTTPException(status_code=404, detail="Linked BuyerRequirement record not found.")
            req.requirement_type = validated_data["buy_or_rent"]
            req.budget_frequency = "One-time" if req.requirement_type == "Buy" else "Monthly"
            req.property_type = validated_data["property_type"]
            req.preferred_city = validated_data.get("city")
            req.preferred_location = validated_data.get("locality")
            req.min_budget = min_b
            req.max_budget = max_b
            req.bedrooms = validated_data.get("bedrooms")
            req.min_area = min_a
            req.max_area = max_a
            req.area_unit = validated_data.get("area_unit") or "sqft"
            req.notes = structured_notes
            req.updated_at = now_naive
            action_name = "CONFIRM_BUYER_REQUIREMENT_REVISION"
        else:
            req = BuyerRequirement(
                tenant_id=tenant_id,
                created_by=None,
                lead_id=lead.id if lead else None,
                contact_id=contact.id,
                assigned_to=assigned_to,
                requirement_type=validated_data["buy_or_rent"],
                budget_frequency="One-time" if validated_data["buy_or_rent"] == "Buy" else "Monthly",
                property_type=validated_data["property_type"],
                preferred_city=validated_data.get("city"),
                preferred_location=validated_data.get("locality"),
                min_budget=min_b,
                max_budget=max_b,
                bedrooms=validated_data.get("bedrooms"),
                min_area=min_a,
                max_area=max_a,
                area_unit=validated_data.get("area_unit") or "sqft",
                status="New",
                notes=structured_notes,
            )
            db.add(req)
            db.flush()
            conv.buyer_requirement_id = req.id
            action_name = "CONFIRM_BUYER_REQUIREMENT"

        target_record_id = req.id
        target_module = "buyer_requirements"
        notify_user_id = req.assigned_to
        if notify_user_id is None:
            notify_requirement_managers(
                db, tenant_id, contact, portal["email"], target_module,
                target_record_id, conv.industry_type,
            )
    else:
        deal = (
            db.query(Deal)
            .filter(
                Deal.tenant_id == tenant_id,
                or_(Deal.account_id == account.id, Deal.contact_id == contact.id),
            )
            .order_by(Deal.updated_at.desc())
            .first()
        )
        assigned_to = resolve_active_assignee(db, tenant_id, lead, portal=portal)
        title_val = (
            validated_data.get("title")
            or f"{validated_data['project_type']} - {validated_data['business_objective'][:120]}"
        )[:200]
        description_val = (
            f"Business Objective: {validated_data.get('business_objective')}\n"
            f"Features: {', '.join(validated_data.get('features') or [])}\n"
            f"User Roles: {', '.join(validated_data.get('user_roles') or [])}"
        )
        structured_notes = (
            f"Expected Users: {validated_data.get('expected_users')}\n"
            f"Security Requirements: {validated_data.get('security_requirements')}\n"
            f"Design Preferences: {validated_data.get('design_preferences')}\n"
            f"Technology Preferences: {validated_data.get('technology_preferences')}\n"
            f"Timeline: {validated_data.get('timeline')}\n"
            f"Other Requirements: {validated_data.get('other_business_requirements') or 'None'}\n"
            f"Confirmed via Customer Portal by {portal['email']} (Revision {conv.revision_number}) at {now_aware.isoformat()}."
        )
        if customer_notes and customer_notes.strip():
            structured_notes += f"\nCustomer Confirmation Notes: {sanitize_text(customer_notes, 1000)}"

        min_b = Decimal(str(validated_data["min_budget"])) if validated_data.get("min_budget") is not None else None
        max_b = Decimal(str(validated_data["max_budget"])) if validated_data.get("max_budget") is not None else None
        target_dt = parse_timeline_to_target_date(validated_data.get("timeline"))

        if conv.software_requirement_id:
            req_sw = (
                db.query(SoftwareRequirement)
                .filter(
                    SoftwareRequirement.id == conv.software_requirement_id,
                    SoftwareRequirement.tenant_id == tenant_id,
                )
                .with_for_update()
                .first()
            )
            if not req_sw:
                raise HTTPException(status_code=404, detail="Linked SoftwareRequirement record not found.")
            req_sw.title = title_val
            req_sw.description = description_val
            req_sw.software_type = validated_data["project_type"]
            req_sw.platforms = validated_data.get("platforms")
            req_sw.integrations = validated_data.get("integrations")
            req_sw.min_budget = min_b
            req_sw.max_budget = max_b
            req_sw.currency = validated_data.get("currency") or "INR"
            req_sw.target_date = target_dt
            req_sw.priority = validated_data.get("priority") or "Medium"
            req_sw.notes = structured_notes
            req_sw.updated_at = now_naive
            action_name = "CONFIRM_SOFTWARE_REQUIREMENT_REVISION"
        else:
            req_sw = SoftwareRequirement(
                tenant_id=tenant_id,
                created_by=None,
                deal_id=deal.id if deal else None,
                lead_id=lead.id if lead else None,
                account_id=account.id,
                contact_id=contact.id,
                assigned_to=assigned_to,
                title=title_val,
                description=description_val,
                software_type=validated_data["project_type"],
                platforms=validated_data.get("platforms"),
                integrations=validated_data.get("integrations"),
                min_budget=min_b,
                max_budget=max_b,
                currency=validated_data.get("currency") or "INR",
                target_date=target_dt,
                priority=validated_data.get("priority") or "Medium",
                status="New",
                notes=structured_notes,
            )
            db.add(req_sw)
            db.flush()
            conv.software_requirement_id = req_sw.id
            action_name = "CONFIRM_SOFTWARE_REQUIREMENT"

        target_record_id = req_sw.id
        target_module = "software_requirements"
        notify_user_id = req_sw.assigned_to
        if notify_user_id is None:
            notify_requirement_managers(
                db, tenant_id, contact, portal["email"], target_module,
                target_record_id, conv.industry_type,
            )

    history = list(conv.revision_history_json or [])
    snapshot_entry = {
        "revision_number": conv.revision_number,
        "confirmed_at": now_aware.isoformat(),
        "confirmed_by_portal_user_id": str(portal_user_id),
        "requirement_id": str(target_record_id),
        "extracted_data": validated_data,
        "customer_notes": sanitize_text(customer_notes, 1000) if customer_notes else None,
    }
    history.append(snapshot_entry)

    conv.status = "Confirmed"
    conv.confirmed_at = now_aware
    conv.confirmed_revision_number = conv.revision_number
    conv.revision_history_json = history
    conv.updated_at = now_aware

    db.add(
        AIMessage(
            tenant_id=tenant_id,
            conversation_id=conv.id,
            sender_role="system",
            content=f"Requirement confirmed by customer (Revision {conv.revision_number}).",
        )
    )

    if notify_user_id:
        db.add(
            Notification(
                tenant_id=tenant_id,
                recipient_user_id=notify_user_id,
                workflow_id=None,
                title=f"Customer Confirmed {conv.industry_type.replace('_', ' ').title()} Requirement"[:200],
                message=f"{contact.full_name} ({portal['email']}) confirmed requirement revision {conv.revision_number}.",
                notification_type="customer_portal",
                related_module=target_module,
                related_record_id=target_record_id,
                is_read=False,
            )
        )

    log_audit(
        db,
        tenant_id=tenant_id,
        user_id=None,
        action=action_name,
        module=target_module,
        record_id=target_record_id,
        description=f"Customer {portal['email']} confirmed {target_module} (revision {conv.revision_number})",
        after_data=snapshot_entry,
    )
    db.commit()
    return get_owned_conversation_or_404(db, tenant_id, portal_user_id, conv.id)


async def revise_ai_requirement(
    db: Session,
    portal: dict,
    conversation_id: UUID,
    correction_message: str | None = None,
    field_updates: dict[str, Any] | None = None,
) -> AIConversation:
    """Controlled revision workflow that never overwrites the confirmed requirement until re-confirmed."""
    tenant_id = portal["tenant_id"]
    portal_user_id = portal["portal_user_id"]
    verify_portal_customer_relationships(db, portal)

    conv = get_owned_conversation_or_404(db, tenant_id, portal_user_id, conversation_id, lock=True)
    if conv.status == "Closed":
        raise HTTPException(status_code=409, detail="Closed conversations cannot be revised.")

    if conv.status == "Confirmed":
        conv.revision_number = conv.revision_number + 1
        conv.status = "Revision_In_Progress"

    merged_raw = dict(conv.extracted_data_json or {})
    if field_updates:
        for k, v in field_updates.items():
            if v is not None:
                merged_raw[k] = v

    validated_data, missing_fields, unclear_fields = validate_and_analyze_extracted_data(
        conv.industry_type,
        merged_raw,
    )
    conv.extracted_data_json = validated_data
    conv.missing_fields_json = missing_fields
    conv.unclear_fields_json = unclear_fields
    if not missing_fields and not unclear_fields:
        conv.summary_text = build_requirement_summary(
            conv.industry_type,
            validated_data,
            revision_number=conv.revision_number,
        )
        conv.status = "Ready_For_Confirmation"
    else:
        conv.summary_text = None
        conv.status = "Revision_In_Progress"

    conv.updated_at = utc_now()
    if field_updates and not correction_message:
        reply_text = build_follow_up_reply(
            industry_type=conv.industry_type,
            extracted_data=validated_data,
            missing_fields=missing_fields,
            unclear_fields=unclear_fields,
            summary_text=conv.summary_text,
        )
        db.add(
            AIMessage(
                tenant_id=tenant_id,
                conversation_id=conv.id,
                sender_role="assistant",
                content=reply_text,
                extracted_delta_json=_serialize_json_safe(field_updates),
            )
        )
    db.commit()

    if correction_message and correction_message.strip():
        return await process_customer_ai_message(db, portal, conv.id, correction_message.strip())

    return get_owned_conversation_or_404(db, tenant_id, portal_user_id, conv.id)
