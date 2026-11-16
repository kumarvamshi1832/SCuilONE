import re
from datetime import date, datetime
from decimal import Decimal, InvalidOperation
from typing import Any, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

CONTROL_CHAR_RE = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
SCRIPT_TAG_RE = re.compile(r"<\s*/?\s*script[^>]*>", re.IGNORECASE)

CANONICAL_PROPERTY_TYPES = {
    "apartment": "Apartment",
    "flat": "Apartment",
    "flats": "Apartment",
    "independent house": "Independent House",
    "independent home": "Independent House",
    "house": "Independent House",
    "villa": "Villa",
    "bungalow": "Villa",
    "plot": "Plot",
    "land": "Plot",
    "commercial": "Commercial",
    "office": "Office",
    "office space": "Office",
    "shop": "Shop",
    "retail shop": "Shop",
    "warehouse": "Warehouse",
    "godown": "Warehouse",
    "other": "Other",
}

RESIDENTIAL_PROPERTY_TYPES = {"Apartment", "Independent House", "Villa"}

CANONICAL_AREA_UNITS = {
    "sqft": "sqft",
    "sq ft": "sqft",
    "sq.ft": "sqft",
    "square feet": "sqft",
    "sqm": "sqm",
    "sq m": "sqm",
    "square meters": "sqm",
    "sqyd": "sqyd",
    "sq yd": "sqyd",
    "square yards": "sqyd",
    "gaj": "sqyd",
    "acre": "acre",
    "acres": "acre",
}

CANONICAL_SOFTWARE_TYPES = {
    "website": "Website",
    "web site": "Website",
    "web application": "Web Application",
    "webapp": "Web Application",
    "web app": "Web Application",
    "saas": "Web Application",
    "portal": "Web Application",
    "mobile application": "Mobile Application",
    "mobile app": "Mobile Application",
    "ios app": "Mobile Application",
    "android app": "Mobile Application",
    "api development": "API Development",
    "api": "API Development",
    "backend api": "API Development",
    "custom software": "Custom Software",
    "custom": "Custom Software",
    "enterprise software": "Enterprise Software",
    "erp": "Enterprise Software",
    "crm": "Enterprise Software",
    "integration": "Integration",
    "maintenance": "Maintenance",
    "support": "Maintenance",
    "other": "Other",
}

# Minimal information required to create a meaningful customer requirement.
# Preferences, ranges, quantities, integrations and timelines are optional.
REAL_ESTATE_REQUIRED_FIELDS = [
    "buy_or_rent",
    "city",
    "property_type",
]

SOFTWARE_REQUIRED_FIELDS = [
    "project_type",
    "business_objective",
]

FIELD_LABELS = {
    "buy_or_rent": "whether you want to Buy or Rent",
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


def sanitize_text(value: Any, max_len: int = 2000) -> str | None:
    """Clean optional AI text and convert model-generated empty-value labels to None."""
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    text = CONTROL_CHAR_RE.sub("", text)
    text = SCRIPT_TAG_RE.sub("", text)
    text = " ".join(text.split())
    if text.casefold() in {
        "n/a", "na", "none", "null", "not applicable",
        "not specified", "unspecified", "unknown",
    }:
        return None
    return text[:max_len] if text else None


def parse_positive_decimal(value: Any, max_val: Decimal = Decimal("999999999999.99")) -> Decimal | None:
    if value is None or value == "":
        return None
    if isinstance(value, (int, float, Decimal)):
        try:
            dec = Decimal(str(value)).quantize(Decimal("0.01"))
        except InvalidOperation:
            return None
        if dec < Decimal("0.00") or dec > max_val:
            return None
        return dec

    raw = (
        str(value)
        .strip()
        .lower()
        .replace(",", "")
        .replace("₹", "")
        .replace("rs.", "")
        .replace("rs", "")
        .replace("inr", "")
        .strip()
    )
    if not raw:
        return None

    multiplier = Decimal("1")
    if any(tok in raw for tok in ("crore", "crores", "cr")):
        multiplier = Decimal("10000000")
        raw = re.sub(r"(crores?|cr)\b", "", raw).strip()
    elif any(tok in raw for tok in ("lakh", "lakhs", "lac", "lacs", "l")):
        multiplier = Decimal("100000")
        raw = re.sub(r"(lakhs?|lacs?|l)\b", "", raw).strip()
    elif any(tok in raw for tok in ("thousand", "k")):
        multiplier = Decimal("1000")
        raw = re.sub(r"(thousands?|k)\b", "", raw).strip()

    match = re.search(r"(\d+(?:\.\d+)?)", raw)
    if not match:
        return None
    try:
        dec = (Decimal(match.group(1)) * multiplier).quantize(Decimal("0.01"))
    except InvalidOperation:
        return None
    if dec < Decimal("0.00") or dec > max_val:
        return None
    return dec


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


class RealEstateExtractedRequirement(BaseModel):
    buy_or_rent: Literal["Buy", "Rent"] | None = None
    city: str | None = None
    locality: str | None = None
    property_type: str | None = None
    bedrooms: int | None = None
    min_budget: Decimal | None = None
    max_budget: Decimal | None = None
    min_area: Decimal | None = None
    max_area: Decimal | None = None
    area_unit: str = "sqft"
    possession_timeline: str | None = None
    amenities: list[str] = Field(default_factory=list)
    parking: str | None = None
    additional_preferences: str | None = None

    @field_validator("buy_or_rent", mode="before")
    @classmethod
    def normalize_buy_or_rent(cls, v: Any) -> str | None:
        if v is None:
            return None
        s = str(v).strip().lower()
        if s in {"buy", "purchase", "sale", "buying", "own"}:
            return "Buy"
        if s in {"rent", "rental", "lease", "renting", "leasing"}:
            return "Rent"
        return None

    @field_validator("property_type", mode="before")
    @classmethod
    def normalize_property_type(cls, v: Any) -> str | None:
        if v is None:
            return None
        s = " ".join(str(v).strip().lower().split())
        if s in CANONICAL_PROPERTY_TYPES:
            return CANONICAL_PROPERTY_TYPES[s]
        for key, canonical in CANONICAL_PROPERTY_TYPES.items():
            if key in s:
                return canonical
        return None

    @field_validator("city", mode="before")
    @classmethod
    def clean_city(cls, v: Any) -> str | None:
        return sanitize_text(v, max_len=100)

    @field_validator("locality", mode="before")
    @classmethod
    def clean_locality(cls, v: Any) -> str | None:
        return sanitize_text(v, max_len=200)

    @field_validator("bedrooms", mode="before")
    @classmethod
    def clean_bedrooms(cls, v: Any) -> int | None:
        if v is None or v == "":
            return None
        if isinstance(v, int):
            return v if 0 <= v <= 100 else None
        m = re.search(r"(\d+)", str(v))
        if not m:
            return None
        val = int(m.group(1))
        return val if 0 <= val <= 100 else None

    @field_validator("min_budget", "max_budget", mode="before")
    @classmethod
    def clean_budget(cls, v: Any) -> Decimal | None:
        return parse_positive_decimal(v, max_val=Decimal("999999999999.99"))

    @field_validator("min_area", "max_area", mode="before")
    @classmethod
    def clean_area(cls, v: Any) -> Decimal | None:
        # A zero-area property is not a meaningful customer preference. Small
        # models sometimes emit 0/N/A for fields the customer never supplied.
        area = parse_positive_decimal(v, max_val=Decimal("9999999999.99"))
        return None if area is not None and area <= Decimal("0") else area

    @field_validator("area_unit", mode="before")
    @classmethod
    def clean_area_unit(cls, v: Any) -> str:
        if v is None:
            return "sqft"
        s = " ".join(str(v).strip().lower().split())
        return CANONICAL_AREA_UNITS.get(s, "sqft")

    @field_validator("possession_timeline", mode="before")
    @classmethod
    def clean_timeline(cls, v: Any) -> str | None:
        return sanitize_text(v, max_len=150)

    @field_validator("amenities", mode="before")
    @classmethod
    def clean_amenities(cls, v: Any) -> list[str]:
        if v is None:
            return []
        if isinstance(v, str):
            parts = [p.strip() for p in re.split(r"[,;/\n]+", v) if p.strip()]
        elif isinstance(v, (list, tuple, set)):
            parts = [str(p).strip() for p in v if str(p).strip()]
        else:
            return []
        cleaned = []
        seen = set()
        for item in parts:
            s = sanitize_text(item, max_len=80)
            if s and s.lower() not in seen:
                seen.add(s.lower())
                cleaned.append(s)
        return cleaned[:30]

    @field_validator("parking", mode="before")
    @classmethod
    def clean_parking(cls, v: Any) -> str | None:
        return sanitize_text(v, max_len=100)

    @field_validator("additional_preferences", mode="before")
    @classmethod
    def clean_prefs(cls, v: Any) -> str | None:
        return sanitize_text(v, max_len=2000)


class SoftwareExtractedRequirement(BaseModel):
    project_type: str | None = None
    title: str | None = None
    business_objective: str | None = None
    features: list[str] = Field(default_factory=list)
    user_roles: list[str] = Field(default_factory=list)
    expected_users: str | None = None
    platforms: str | None = None
    integrations: str | None = None
    security_requirements: str | None = None
    design_preferences: str | None = None
    technology_preferences: str | None = None
    min_budget: Decimal | None = None
    max_budget: Decimal | None = None
    currency: str = "INR"
    timeline: str | None = None
    target_date: date | None = None
    priority: Literal["Low", "Medium", "High", "Critical"] = "Medium"
    other_business_requirements: str | None = None

    @field_validator("project_type", mode="before")
    @classmethod
    def normalize_project_type(cls, v: Any) -> str | None:
        if v is None:
            return None
        s = " ".join(str(v).strip().lower().split())
        if s in CANONICAL_SOFTWARE_TYPES:
            return CANONICAL_SOFTWARE_TYPES[s]
        for key, canonical in CANONICAL_SOFTWARE_TYPES.items():
            if key in s:
                return canonical
        return None

    @field_validator("title", mode="before")
    @classmethod
    def clean_title(cls, v: Any) -> str | None:
        return sanitize_text(v, max_len=200)

    @field_validator("business_objective", mode="before")
    @classmethod
    def clean_objective(cls, v: Any) -> str | None:
        return sanitize_text(v, max_len=2000)

    @field_validator("features", "user_roles", mode="before")
    @classmethod
    def clean_string_list(cls, v: Any) -> list[str]:
        if v is None:
            return []
        if isinstance(v, str):
            parts = [p.strip() for p in re.split(r"[,;/\n]+", v) if p.strip()]
        elif isinstance(v, (list, tuple, set)):
            parts = [str(p).strip() for p in v if str(p).strip()]
        else:
            return []
        cleaned = []
        seen = set()
        for item in parts:
            s = sanitize_text(item, max_len=120)
            if s and s.lower() not in seen:
                seen.add(s.lower())
                cleaned.append(s)
        return cleaned[:40]

    @field_validator(
        "expected_users",
        "platforms",
        "integrations",
        "security_requirements",
        "design_preferences",
        "technology_preferences",
        "timeline",
        "other_business_requirements",
        mode="before",
    )
    @classmethod
    def clean_text_fields(cls, v: Any) -> str | None:
        if isinstance(v, (list, tuple)):
            v = ", ".join(str(x).strip() for x in v if str(x).strip())
        return sanitize_text(v, max_len=1000)

    @field_validator("min_budget", "max_budget", mode="before")
    @classmethod
    def clean_budget(cls, v: Any) -> Decimal | None:
        return parse_positive_decimal(v, max_val=Decimal("999999999999.99"))

    @field_validator("currency", mode="before")
    @classmethod
    def clean_currency(cls, v: Any) -> str:
        if v is None:
            return "INR"
        c = str(v).strip().upper()
        if re.match(r"^[A-Z]{3}$", c):
            return c
        return "INR"

    @field_validator("priority", mode="before")
    @classmethod
    def clean_priority(cls, v: Any) -> str:
        if v is None:
            return "Medium"
        s = str(v).strip().capitalize()
        if s in {"Low", "Medium", "High", "Critical"}:
            return s
        return "Medium"


def normalize_extracted_delta(industry_type: str, delta: dict[str, Any]) -> dict[str, Any]:
    """Normalize only fields emitted by the extractor, excluding schema defaults."""
    model_class = (
        RealEstateExtractedRequirement
        if industry_type == "real_estate"
        else SoftwareExtractedRequirement
    )
    model = model_class.model_validate(delta)
    # model_fields_set keeps explicitly supplied keys (including normalized null/empty
    # values) but does not fabricate defaults such as area_unit or list fields.
    return _serialize_json_safe(model.model_dump(include=model.model_fields_set))


def validate_and_analyze_extracted_data(
    industry_type: str,
    merged_raw: dict[str, Any],
) -> tuple[dict[str, Any], list[str], list[str]]:
    """Validate merged fields through Pydantic/Python and compute missing & unclear fields."""
    unclear: list[str] = []

    if industry_type == "real_estate":
        model = (
            RealEstateExtractedRequirement.model_validate(merged_raw)
            if hasattr(RealEstateExtractedRequirement, "model_validate")
            else RealEstateExtractedRequirement.parse_obj(merged_raw)
        )
        raw_dump = model.model_dump() if hasattr(model, "model_dump") else model.dict()
        clean = _serialize_json_safe(raw_dump)

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

    model_sw = (
        SoftwareExtractedRequirement.model_validate(merged_raw)
        if hasattr(SoftwareExtractedRequirement, "model_validate")
        else SoftwareExtractedRequirement.parse_obj(merged_raw)
    )
    raw_dump_sw = model_sw.model_dump() if hasattr(model_sw, "model_dump") else model_sw.dict()
    clean_sw = _serialize_json_safe(raw_dump_sw)

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
            f"- Budget Range: {data.get('min_budget') if data.get('min_budget') is not None else 'N/A'} to {data.get('max_budget') if data.get('max_budget') is not None else 'N/A'} INR\n"
            f"- Area Range: {data.get('min_area') if data.get('min_area') is not None else 'N/A'} to {data.get('max_area') if data.get('max_area') is not None else 'N/A'} {data.get('area_unit') or 'sqft'}\n"
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
        f"- Budget Range: {data.get('min_budget') if data.get('min_budget') is not None else 'N/A'} to {data.get('max_budget') if data.get('max_budget') is not None else 'N/A'} {data.get('currency') or 'INR'}\n"
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
    """Parse explicit calendar dates only; never turn relative durations into dates."""
    if not timeline_str:
        return None
    raw = timeline_str.strip()
    iso_match = re.search(r"(?<!\d)(\d{4}-\d{2}-\d{2})(?!\d)", raw)
    if iso_match:
        try:
            return date.fromisoformat(iso_match.group(1))
        except ValueError:
            return None
    for pattern in (
        "%d %B %Y", "%d %b %Y", "%B %d, %Y", "%b %d, %Y",
    ):
        try:
            return datetime.strptime(raw, pattern).date()
        except ValueError:
            continue
    return None


class AIConversationStartRequest(BaseModel):
    force_new: bool = False
    initial_message: str | None = Field(default=None, max_length=4000)


class AIMessageSendRequest(BaseModel):
    message: str = Field(min_length=1, max_length=4000)

    @field_validator("message")
    @classmethod
    def validate_nonblank(cls, v: str) -> str:
        cleaned = sanitize_text(v, max_len=4000)
        if not cleaned:
            raise ValueError("Message cannot be blank.")
        return cleaned


class AIRequirementConfirmRequest(BaseModel):
    confirmed: bool = True
    customer_notes: str | None = Field(default=None, max_length=2000)


class AIRequirementReviseRequest(BaseModel):
    correction_message: str | None = Field(default=None, max_length=4000)
    field_updates: dict[str, Any] | None = None

    @model_validator(mode="after")
    def require_message_or_updates(self):
        if not self.correction_message and not self.field_updates:
            raise ValueError("Provide either a correction_message or field_updates.")
        return self


class AIMessageResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    conversation_id: UUID
    sender_role: str
    content: str
    extracted_delta_json: dict | None = None
    created_at: datetime


class AIConversationSummaryResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    portal_user_id: UUID
    account_id: UUID
    contact_id: UUID
    lead_id: UUID | None = None
    industry_type: str
    status: str
    revision_number: int
    confirmed_revision_number: int | None = None
    missing_fields_json: list[str] = Field(default_factory=list)
    unclear_fields_json: list[str] = Field(default_factory=list)
    buyer_requirement_id: UUID | None = None
    software_requirement_id: UUID | None = None
    confirmed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime


class AIConversationResponse(AIConversationSummaryResponse):
    extracted_data_json: dict[str, Any] = Field(default_factory=dict)
    summary_text: str | None = None
    revision_history_json: list[dict[str, Any]] = Field(default_factory=list)
    messages: list[AIMessageResponse] = Field(default_factory=list)


class PortalAIStatusResponse(BaseModel):
    available: bool
    assistant_ready: bool
    message: str


class StaffAIDiagnosticsResponse(BaseModel):
    available: bool
    ollama_version: str | None = None
    configured_model: str
    model_present: bool
    latency_ms: float | None = None
    error: str | None = None
