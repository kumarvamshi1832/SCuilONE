"""Non-blocking local Ollama client (llama3.2:1b) with Python fallback extraction."""
import asyncio
import json
import logging
import re
import socket
import time
import urllib.error
import urllib.request
from typing import Any, Callable

from app.core.ai_config import (
    FORBIDDEN_OLLAMA_PATHS,
    get_ollama_config,
    validate_ollama_base_url,
    validate_ollama_model_tag,
)

logger = logging.getLogger(__name__)

ALLOWED_API_PATHS = {"/api/version", "/api/tags", "/api/chat"}
TRANSIENT_HTTP_CODES = {502, 503, 504}

_CUSTOM_OLLAMA_HOOK: Callable[[str, str, dict | None], dict] | None = None


class OllamaServiceError(Exception):
    """Raised when local Ollama is unreachable or returns an unrecoverable error."""


def set_ollama_test_hook(hook: Callable[[str, str, dict | None], dict] | None) -> None:
    """Optional test hook for simulating Ollama responses or failures in unit tests."""
    global _CUSTOM_OLLAMA_HOOK
    _CUSTOM_OLLAMA_HOOK = hook


def _sync_ollama_http_call(
    method: str,
    path: str,
    payload: dict | None = None,
    timeout_seconds: int = 45,
    base_url: str | None = None,
) -> dict:
    """Synchronous HTTP call to local Ollama, meant to run via asyncio.to_thread()."""
    if path in FORBIDDEN_OLLAMA_PATHS or path not in ALLOWED_API_PATHS:
        raise ValueError(f"Disallowed Ollama API path: {path}")

    if _CUSTOM_OLLAMA_HOOK is not None:
        return _CUSTOM_OLLAMA_HOOK(method, path, payload)

    cfg = get_ollama_config()
    validated_base = validate_ollama_base_url(base_url or cfg["base_url"])
    url = f"{validated_base}{path}"

    body_bytes = None
    headers = {"Accept": "application/json"}
    if payload is not None:
        body_bytes = json.dumps(payload).encode("utf-8")
        headers["Content-Type"] = "application/json"

    req = urllib.request.Request(url=url, data=body_bytes, headers=headers, method=method.upper())
    with urllib.request.urlopen(req, timeout=timeout_seconds) as resp:
        raw = resp.read().decode("utf-8", errors="replace")
        return json.loads(raw) if raw.strip() else {}


async def _async_ollama_request(
    method: str,
    path: str,
    payload: dict | None = None,
) -> tuple[dict, float]:
    """Execute local Ollama HTTP request in a worker thread with bounded transient retries."""
    cfg = get_ollama_config()
    max_retries = cfg["max_retries"]
    timeout_seconds = cfg["timeout_seconds"]
    base_url = cfg["base_url"]

    last_exc: Exception | None = None
    started = time.monotonic()

    for attempt in range(max_retries + 1):
        try:
            data = await asyncio.to_thread(
                _sync_ollama_http_call,
                method,
                path,
                payload,
                timeout_seconds,
                base_url,
            )
            latency_ms = round((time.monotonic() - started) * 1000.0, 2)
            return data, latency_ms
        except urllib.error.HTTPError as exc:
            last_exc = exc
            if exc.code not in TRANSIENT_HTTP_CODES or attempt >= max_retries:
                break
        except (urllib.error.URLError, TimeoutError, socket.timeout, ConnectionError) as exc:
            last_exc = exc
            if attempt >= max_retries:
                break
        except Exception as exc:
            last_exc = exc
            break

        await asyncio.sleep(0.4 * (attempt + 1))

    raise OllamaServiceError(f"Local Ollama request to {path} failed: {last_exc}") from last_exc


async def check_ollama_health() -> dict:
    """Check local Ollama server availability and verify configured model presence."""
    cfg = get_ollama_config()
    target_model = validate_ollama_model_tag(cfg["model"])
    started = time.monotonic()
    try:
        version_data, _ = await _async_ollama_request("GET", "/api/version")
        tags_data, _ = await _async_ollama_request("GET", "/api/tags")
        latency_ms = round((time.monotonic() - started) * 1000.0, 2)

        models = tags_data.get("models") or []
        installed_names = {
            str(m.get("name") or m.get("model") or "").strip()
            for m in models
            if isinstance(m, dict)
        }
        model_present = target_model in installed_names

        return {
            "available": True,
            "ollama_version": str(version_data.get("version") or "unknown"),
            "configured_model": target_model,
            "model_present": model_present,
            "latency_ms": latency_ms,
            "error": None if model_present else f"Model '{target_model}' is not present in local Ollama.",
        }
    except Exception as exc:
        latency_ms = round((time.monotonic() - started) * 1000.0, 2)
        return {
            "available": False,
            "ollama_version": None,
            "configured_model": target_model,
            "model_present": False,
            "latency_ms": latency_ms,
            "error": str(exc),
        }


def parse_json_safely(raw_text: str) -> dict:
    """Extract and parse a JSON object from raw model output safely."""
    if not raw_text:
        return {}
    cleaned = raw_text.strip()
    if cleaned.startswith("```"):
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned, flags=re.IGNORECASE)
        cleaned = re.sub(r"\s*```$", "", cleaned)
    try:
        parsed = json.loads(cleaned)
        if isinstance(parsed, dict):
            return parsed
    except Exception:
        pass

    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        try:
            parsed = json.loads(match.group(0))
            if isinstance(parsed, dict):
                return parsed
        except Exception:
            pass
    return {}


KNOWN_CITIES = {
    "hyderabad", "bengaluru", "bangalore", "mumbai", "pune", "chennai",
    "delhi", "noida", "gurgaon", "gurugram", "kolkata", "ahmedabad",
    "kochi", "visakhapatnam",
}


def extract_real_estate_heuristics(message: str) -> dict[str, Any]:
    """Deterministic Python extraction of explicit Real Estate facts from customer text."""
    text = message.strip()
    lower = text.lower()
    extracted: dict[str, Any] = {}

    wants_buy = bool(re.search(r"\b(buy|buying|purchase|purchasing)\b", lower))
    wants_rent = bool(re.search(r"\b(rent|renting|lease|leasing|rental)\b", lower))
    if wants_buy and not wants_rent:
        extracted["buy_or_rent"] = "Buy"
    elif wants_rent and not wants_buy:
        extracted["buy_or_rent"] = "Rent"
    # If both words appear (e.g. "buy or rent"), leave it unset so the assistant asks.

    for keyword, canonical in (
        ("independent house", "Independent House"),
        ("apartment", "Apartment"),
        ("flat", "Apartment"),
        ("villa", "Villa"),
        ("bungalow", "Villa"),
        ("plot", "Plot"),
        ("warehouse", "Warehouse"),
        ("office", "Office"),
        ("shop", "Shop"),
        ("commercial", "Commercial"),
    ):
        if re.search(rf"\b{re.escape(keyword)}s?\b", lower):
            extracted["property_type"] = canonical
            break

    bhk_match = re.search(r"(\d+)\s*(?:bhk|bed(?:room)?s?|br)\b", lower)
    if bhk_match:
        extracted["bedrooms"] = int(bhk_match.group(1))

    city_pattern = "|".join(KNOWN_CITIES)
    city_match = re.search(rf"\b({city_pattern})\b", lower)
    if city_match:
        city_val = city_match.group(1).title()
        if city_val == "Bangalore":
            city_val = "Bengaluru"
        extracted["city"] = city_val

    near_matches = re.finditer(
        r"\b(?:locality\s*(?:is|:)?|location\s*(?:is|:)?|near|at|in)\s+([A-Za-z][A-Za-z0-9\s\-]{2,40}?)(?=,|\.|\bwith\b|\bbudget\b|\band\b|\bfor\b|\barea\b|\bnear\b|$)",
        text,
        flags=re.IGNORECASE,
    )
    for near_match in near_matches:
        candidate = near_match.group(1).strip()
        if candidate.lower() not in KNOWN_CITIES and candidate.lower() != "india":
            extracted["locality"] = candidate
            break

    area_range = re.search(
        r"(\d{3,6}(?:\.\d+)?)\s*(?:to|\-|–)\s*(\d{3,6}(?:\.\d+)?)\s*(sq\.?\s*ft|sqft|square feet|sqm|sq\.?\s*m|sqyd|sq\.?\s*yd|acres?)",
        lower,
    )
    if area_range:
        extracted["min_area"] = area_range.group(1)
        extracted["max_area"] = area_range.group(2)
        extracted["area_unit"] = area_range.group(3)
    else:
        single_area = re.search(
            r"(\d{3,6}(?:\.\d+)?)\s*(sq\.?\s*ft|sqft|square feet|sqm|sq\.?\s*m|sqyd|sq\.?\s*yd|acres?)",
            lower,
        )
        if single_area:
            extracted["min_area"] = single_area.group(1)
            extracted["max_area"] = single_area.group(1)
            extracted["area_unit"] = single_area.group(2)

    budget_range = re.search(
        r"(?:budget|price)?[^0-9\n]{0,20}(\d+(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|crore|crores|cr|k)?\s*(?:to|\-|–)\s*(\d+(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|crore|crores|cr|k)\b",
        lower,
    )
    if budget_range:
        u1 = budget_range.group(2) or budget_range.group(4)
        u2 = budget_range.group(4)
        extracted["min_budget"] = f"{budget_range.group(1)} {u1}"
        extracted["max_budget"] = f"{budget_range.group(3)} {u2}"
    else:
        single_budget = re.search(
            r"(?:budget|up\s*to|under|around|max(?:imum)?\s*budget)\s*(?:is|of|:)?\s*(?:rs\.?|inr|₹)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|crore|crores|cr|k)?\b",
            lower,
        )
        if single_budget and (single_budget.group(2) or len(single_budget.group(1).replace(",", "")) >= 4):
            unit_part = f" {single_budget.group(2)}" if single_budget.group(2) else ""
            extracted["max_budget"] = f"{single_budget.group(1)}{unit_part}"

    timeline_match = re.search(
        r"\b(ready to move|immediate(?:ly)?|next\s+(?:month|week|year)|within\s+\d+\s*(?:months?|days?|weeks?|years?)|\d+\s*(?:months?|years?)\s*timeline|under construction)\b",
        lower,
    )
    if timeline_match:
        extracted["possession_timeline"] = timeline_match.group(1)

    found_amenities = []
    for kw in (
        "gym", "swimming pool", "clubhouse", "security", "power backup",
        "lift", "elevator", "park", "garden", "play area", "cctv", "gated community",
    ):
        if re.search(rf"\b{re.escape(kw)}\b", lower):
            found_amenities.append(kw.title())
    if found_amenities:
        extracted["amenities"] = found_amenities

    parking_match = re.search(
        r"(\d+\s*(?:covered\s+|car\s+|bike\s+)?parking|covered parking|car parking|no parking|parking required)",
        lower,
    )
    if parking_match:
        extracted["parking"] = parking_match.group(1)

    return extracted


def extract_software_heuristics(message: str) -> dict[str, Any]:
    """Deterministic Python extraction of explicit Software Services facts from customer text."""
    text = message.strip()
    lower = text.lower()
    extracted: dict[str, Any] = {}

    for keyword, canonical in (
        ("mobile application", "Mobile Application"),
        ("mobile app", "Mobile Application"),
        ("web application", "Web Application"),
        ("web app", "Web Application"),
        ("website", "Website"),
        ("api development", "API Development"),
        ("rest api", "API Development"),
        ("custom software", "Custom Software"),
        ("enterprise software", "Enterprise Software"),
        ("integration", "Integration"),
        ("maintenance", "Maintenance"),
    ):
        if keyword in lower:
            extracted["project_type"] = canonical
            break

    platforms = []
    for p_kw, label in (
        ("web", "Web"),
        ("ios", "iOS"),
        ("android", "Android"),
        ("windows", "Windows"),
        ("macos", "macOS"),
        ("linux", "Linux"),
        ("cloud", "Cloud"),
    ):
        if re.search(rf"\b{re.escape(p_kw)}\b", lower):
            platforms.append(label)
    if platforms:
        extracted["platforms"] = ", ".join(platforms)

    budget_range = re.search(
        r"(\d+(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|crore|crores|cr|k)?\s*(?:to|\-|–)\s*(\d+(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|crore|crores|cr|k)\b",
        lower,
    )
    if budget_range:
        u1 = budget_range.group(2) or budget_range.group(4)
        u2 = budget_range.group(4)
        extracted["min_budget"] = f"{budget_range.group(1)} {u1}"
        extracted["max_budget"] = f"{budget_range.group(3)} {u2}"
    else:
        single_budget = re.search(
            r"(?:budget|up\s*to|under|around|max(?:imum)?\s*budget)\s*(?:is|of|:)?\s*(?:rs\.?|inr|usd|\$|₹)?\s*(\d+(?:,\d+)*(?:\.\d+)?)\s*(lakh|lakhs|lac|lacs|crore|crores|cr|k)?\b",
            lower,
        )
        if single_budget and (single_budget.group(2) or len(single_budget.group(1).replace(",", "")) >= 4):
            unit_part = f" {single_budget.group(2)}" if single_budget.group(2) else ""
            extracted["max_budget"] = f"{single_budget.group(1)}{unit_part}"

    if "usd" in lower or "$" in lower:
        extracted["currency"] = "USD"
    elif "eur" in lower or "€" in lower:
        extracted["currency"] = "EUR"
    elif "inr" in lower or "₹" in lower or "lakh" in lower or "crore" in lower:
        extracted["currency"] = "INR"

    timeline_match = re.search(
        r"\b(\d+\s*(?:months?|weeks?|days?)|by\s+\d{4}-\d{2}-\d{2}|\d{4}-\d{2}-\d{2})\b",
        lower,
    )
    if timeline_match:
        extracted["timeline"] = timeline_match.group(1).replace("by ", "").strip()

    users_match = re.search(
        r"(\d+(?:,\d+)*\+?\s*(?:expected\s+|concurrent\s+|active\s+|daily\s+)?users)",
        lower,
    )
    if users_match:
        extracted["expected_users"] = users_match.group(1)

    return extracted


async def run_ollama_extraction(
    industry_type: str,
    current_data: dict[str, Any],
    missing_fields: list[str],
    user_message: str,
    recent_history: list[dict[str, str]],
) -> tuple[dict[str, Any], str | None, str, float | None]:
    """Call local Ollama llama3.2:1b to extract fields and generate a conversational follow-up."""
    cfg = get_ollama_config()
    model_tag = validate_ollama_model_tag(cfg["model"])

    if industry_type == "real_estate":
        schema_keys = (
            "buy_or_rent (Buy or Rent), city, locality, property_type "
            "(Apartment, Villa, Independent House, Plot, Commercial, Office, Shop, Warehouse), "
            "bedrooms (integer), min_budget (number), max_budget (number), "
            "min_area (number), max_area (number), area_unit (sqft, sqm, sqyd, acre), "
            "possession_timeline, amenities (list of strings), parking, additional_preferences"
        )
    else:
        schema_keys = (
            "project_type (Website, Web Application, Mobile Application, API Development, Custom Software, Enterprise Software), "
            "title, business_objective, features (list of strings), user_roles (list of strings), "
            "expected_users, platforms, integrations, security_requirements, "
            "design_preferences, technology_preferences, min_budget (number), max_budget (number), "
            "currency (INR, USD, EUR), timeline, priority (Low, Medium, High, Critical), other_business_requirements"
        )

    system_prompt = (
        f"You are the SCuilONE {industry_type.replace('_', ' ').title()} CRM assistant. "
        "Your ONLY job is to extract structured customer requirement fields from the customer's message "
        "and politely ask about the next missing fields. "
        "Never invent values that the customer did not state. "
        "Never ask about fields that are already present in Known Data. "
        f"Allowed JSON keys inside 'extracted': {schema_keys}. "
        f"Currently Known Data: {json.dumps(current_data, default=str)}. "
        f"Currently Missing Fields: {json.dumps(missing_fields)}. "
        "Respond strictly with a valid JSON object matching this exact structure: "
        '{"extracted": { ...only newly mentioned or updated fields... }, "reply": "your polite conversational response"}'
    )

    messages = [{"role": "system", "content": system_prompt}]
    for turn in recent_history[-6:]:
        messages.append({"role": turn["role"], "content": turn["content"]})
    messages.append({"role": "user", "content": user_message})

    payload = {
        "model": model_tag,
        "messages": messages,
        "stream": False,
        "format": "json",
        "options": {
            "temperature": cfg["temperature"],
        },
    }

    heuristics = (
        extract_real_estate_heuristics(user_message)
        if industry_type == "real_estate"
        else extract_software_heuristics(user_message)
    )

    try:
        response_data, latency_ms = await _async_ollama_request("POST", "/api/chat", payload)
        raw_content = (
            (response_data.get("message") or {}).get("content")
            or response_data.get("response")
            or ""
        )
        parsed = parse_json_safely(raw_content)
        ai_extracted = parsed.get("extracted") if isinstance(parsed.get("extracted"), dict) else {}
        if not ai_extracted and isinstance(parsed, dict):
            ai_extracted = {
                k: v for k, v in parsed.items()
                if k not in {"reply", "message", "extracted", "status"} and v is not None and v != ""
            }
        merged_delta = {**ai_extracted, **heuristics}
        ai_reply = parsed.get("reply") if isinstance(parsed.get("reply"), str) else None
        return merged_delta, ai_reply, model_tag, latency_ms
    except OllamaServiceError as exc:
        logger.warning("Ollama extraction unavailable (%s); using Python deterministic extraction.", exc)
        return heuristics, None, model_tag, None
