from datetime import datetime, timezone
import hashlib
import json
import logging
import os
from pathlib import Path
import re
from typing import Any

logger = logging.getLogger("scuilone.monitoring")

# Severity ranking for automatic escalation comparisons (Section 6)
SEVERITY_RANK: dict[str, int] = {
    "Low": 1,
    "Medium": 2,
    "High": 3,
    "Critical": 4,
}

# Canonical monitored service names (Section 2 & Section 10)
SERVICE_API_GATEWAY = "API Gateway"
SERVICE_POSTGRESQL = "PostgreSQL Database"
SERVICE_BACKGROUND_WORKER = "Background Worker"
SERVICE_EMAIL_ADAPTER = "Email / Notification Adapter"
SERVICE_OBJECT_STORAGE = "Object Storage Adapter"
SERVICE_SYSTEM_RESOURCES = "System Resources"

ALL_MONITORED_SERVICES: tuple[str, ...] = (
    SERVICE_API_GATEWAY,
    SERVICE_POSTGRESQL,
    SERVICE_BACKGROUND_WORKER,
    SERVICE_EMAIL_ADAPTER,
    SERVICE_OBJECT_STORAGE,
)

# Normal client HTTP statuses that MUST NOT be treated as infrastructure incidents (Section 6)
IGNORED_CLIENT_HTTP_STATUSES: set[int] = {400, 401, 403, 404, 405, 409, 413, 422, 429}

# Default configurable monitoring thresholds (Sections 4, 5, 6, 8, 9, 11, 13)
DEFAULT_MONITORING_THRESHOLDS: dict[str, Any] = {
    "environment": os.environ.get("SCUILONE_ENV", "production"),
    "polling_interval_seconds": int(os.environ.get("MONITORING_POLL_INTERVAL_SECONDS", "60")),
    "api_5xx_incident_threshold": int(os.environ.get("MONITORING_API_5XX_THRESHOLD", "3")),
    "api_5xx_critical_threshold": int(os.environ.get("MONITORING_API_5XX_CRITICAL_THRESHOLD", "10")),
    "api_window_minutes": int(os.environ.get("MONITORING_API_WINDOW_MINUTES", "15")),
    "api_error_rate_degraded_pct": float(os.environ.get("MONITORING_API_ERROR_RATE_DEGRADED_PCT", "5.0")),
    "api_error_rate_unavailable_pct": float(os.environ.get("MONITORING_API_ERROR_RATE_UNAVAILABLE_PCT", "25.0")),
    "api_latency_degraded_ms": float(os.environ.get("MONITORING_API_LATENCY_DEGRADED_MS", "1000.0")),
    "db_latency_degraded_ms": float(os.environ.get("MONITORING_DB_LATENCY_DEGRADED_MS", "500.0")),
    "worker_heartbeat_stale_seconds": int(os.environ.get("MONITORING_WORKER_STALE_SECONDS", "300")),
    "email_failure_threshold": int(os.environ.get("MONITORING_EMAIL_FAILURE_THRESHOLD", "2")),
    "storage_failure_threshold": int(os.environ.get("MONITORING_STORAGE_FAILURE_THRESHOLD", "2")),
    "recovery_consecutive_checks_required": int(os.environ.get("MONITORING_RECOVERY_CHECKS_REQUIRED", "2")),
    "unresolved_reminder_minutes": int(os.environ.get("MONITORING_UNRESOLVED_REMINDER_MINUTES", "60")),
    "health_history_retention_days": int(os.environ.get("MONITORING_RETENTION_DAYS", "30")),
    "cpu_degraded_pct": float(os.environ.get("MONITORING_CPU_DEGRADED_PCT", "85.0")),
    "cpu_critical_pct": float(os.environ.get("MONITORING_CPU_CRITICAL_PCT", "95.0")),
    "memory_degraded_pct": float(os.environ.get("MONITORING_MEMORY_DEGRADED_PCT", "85.0")),
    "memory_critical_pct": float(os.environ.get("MONITORING_MEMORY_CRITICAL_PCT", "95.0")),
    "disk_degraded_pct": float(os.environ.get("MONITORING_DISK_DEGRADED_PCT", "85.0")),
    "disk_critical_pct": float(os.environ.get("MONITORING_DISK_CRITICAL_PCT", "95.0")),
    "fallback_log_path": os.environ.get(
        "MONITORING_FALLBACK_LOG_PATH", "logs/platform_db_outage_fallback.jsonl"
    ),
}

# Sensitive field names and patterns that must NEVER appear in logs or diagnostics (Section 3 & Section 12)
SENSITIVE_KEY_SUBSTRINGS: tuple[str, ...] = (
    "password",
    "passwd",
    "secret",
    "token",
    "otp",
    "api_key",
    "apikey",
    "authorization",
    "cookie",
    "credential",
    "private_key",
    "encryption_key",
    "database_url",
    "smtp_password",
    "cloudinary_api_secret",
    "recovery_code",
)

_JWT_PATTERN = re.compile(r"eyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}")
_BEARER_PATTERN = re.compile(r"(?i)(Bearer\s+)[A-Za-z0-9._\-+/=]+")
_DB_URL_PATTERN = re.compile(r"(?i)(postgresql(?:\+\w+)?|sqlite|mysql|redis)://[^\s\"'>]+")
_KV_SECRET_PATTERN = re.compile(
    r"(?i)((?:password|passwd|secret|token|otp|api_key|apikey|smtp_password|jwt_secret_key|mfa_encryption_key)\s*[=:]\s*)(?!\[REDACTED)([^\s,;\"'}]+)"
)

# In-memory fallback buffer when PostgreSQL itself is unreachable (Section 13)
DB_OUTAGE_FALLBACK_BUFFER: list[dict[str, Any]] = []


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def ensure_utc(dt: datetime | None) -> datetime | None:
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def redact_sensitive_text(value: str | None, max_length: int = 4000) -> str:
    """
    Scrubs passwords, JWT tokens, Bearer headers, database URLs, OTPs, and API keys
    from log messages and stack traces (Section 3).
    """
    if not value:
        return ""
    text = str(value)
    text = _JWT_PATTERN.sub("[REDACTED_JWT]", text)
    text = _BEARER_PATTERN.sub(r"\1[REDACTED_TOKEN]", text)
    text = _DB_URL_PATTERN.sub(r"\1://[REDACTED_CREDENTIALS]", text)
    text = _KV_SECRET_PATTERN.sub(r"\1[REDACTED]", text)
    if len(text) > max_length:
        text = text[:max_length] + "...[TRUNCATED]"
    return text


def redact_sensitive_dict(data: Any) -> Any:
    """Recursively redacts sensitive keys and values in a dictionary or list."""
    if isinstance(data, dict):
        cleaned: dict[str, Any] = {}
        for k, v in data.items():
            key_lower = str(k).lower()
            if any(sub in key_lower for sub in SENSITIVE_KEY_SUBSTRINGS):
                cleaned[str(k)] = "[REDACTED]"
            else:
                cleaned[str(k)] = redact_sensitive_dict(v)
        return cleaned
    if isinstance(data, list):
        return [redact_sensitive_dict(item) for item in data[:100]]
    if isinstance(data, str):
        return redact_sensitive_text(data, max_length=1000)
    return data


def compute_error_fingerprint(
    service_name: str,
    error_category: str,
    endpoint: str | None = None,
    environment: str = "production",
) -> str:
    """
    Computes a deterministic error fingerprint for incident deduplication (Section 5).
    Groups incidents by (service_name, error_category, normalized_endpoint, environment).
    """
    norm_service = (service_name or "unknown").strip().lower().replace(" ", "_")
    norm_cat = (error_category or "error").strip().lower().replace(" ", "_")
    norm_env = (environment or "production").strip().lower()
    norm_ep = (endpoint or "global").strip().lower()
    raw = f"{norm_service}|{norm_cat}|{norm_ep}|{norm_env}"
    digest = hashlib.sha256(raw.encode("utf-8")).hexdigest()[:16]
    return f"fp:{norm_service}:{norm_cat}:{digest}"


def write_db_outage_fallback_record(record: dict[str, Any], log_path: str | None = None) -> dict[str, Any]:
    """
    Section 13 – Fallback strategy when PostgreSQL itself is unavailable:
    Writes a structured, redacted JSONL incident/error record to local container storage
    and keeps an in-memory buffer so incidents detected during a DB outage are never lost
    and can be synchronized back into PostgreSQL once connectivity recovers.
    """
    safe_record = redact_sensitive_dict(
        {
            "fallback_id": f"FB-{utc_now():%Y%m%d%H%M%S}-{os.urandom(3).hex().upper()}",
            "recorded_at": utc_now().isoformat(),
            **record,
        }
    )
    DB_OUTAGE_FALLBACK_BUFFER.append(safe_record)
    if len(DB_OUTAGE_FALLBACK_BUFFER) > 500:
        del DB_OUTAGE_FALLBACK_BUFFER[:-500]

    target_path = Path(log_path or DEFAULT_MONITORING_THRESHOLDS["fallback_log_path"])
    try:
        target_path.parent.mkdir(parents=True, exist_ok=True)
        with target_path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(safe_record, default=str) + "\n")
    except Exception as exc:
        logger.error("Could not write fallback outage log file: %s", exc)

    logger.critical("DB_OUTAGE_FALLBACK_INCIDENT: %s", json.dumps(safe_record, default=str))
    return safe_record
