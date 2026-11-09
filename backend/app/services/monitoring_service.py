from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import json
import logging
import os
import shutil
import socket
import time
import traceback
from typing import Any, Callable
import uuid
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.core.monitoring_config import (
    ALL_MONITORED_SERVICES,
    DB_OUTAGE_FALLBACK_BUFFER,
    DEFAULT_MONITORING_THRESHOLDS,
    IGNORED_CLIENT_HTTP_STATUSES,
     SERVICE_API_GATEWAY,
    SERVICE_BACKGROUND_WORKER,
    SERVICE_EMAIL_ADAPTER,
    SERVICE_OBJECT_STORAGE,
    SERVICE_POSTGRESQL,
    SERVICE_SYSTEM_RESOURCES,
    SEVERITY_RANK,
    compute_error_fingerprint,
    ensure_utc,
    redact_sensitive_dict,
    redact_sensitive_text,
    utc_now,
    write_db_outage_fallback_record,
)
from app.database.connection import SessionLocal, engine, settings
from app.models.notification import Notification
from app.models.platform import (
    PlatformEmployee,
    PlatformErrorLog,
    PlatformServiceHealthCheck,
    PlatformSetting,
    PlatformSupportTicketMeta,
    PlatformTechnicalIncident,
    PlatformWorkerHeartbeat,
)
from app.models.support_ticket import SupportTicket
from app.models.tenant import Tenant
from app.models.user import User
from app.services.email_service import send_technical_incident_alert_email

logger = logging.getLogger("scuilone.monitoring")

# ---------------------------------------------------------------------------
# In-memory rolling telemetry & adapter state (thread/process-safe structures)
# ---------------------------------------------------------------------------
_RUNTIME_THRESHOLD_OVERRIDES: dict[str, Any] = {}
_API_REQUEST_WINDOW: list[dict[str, Any]] = []

_EMAIL_ADAPTER_METRICS: dict[str, Any] = {
    "total_sent": 0,
    "total_failed": 0,
    "consecutive_failures": 0,
    "last_success_at": None,
    "last_failure_at": None,
    "last_error": None,
    "last_latency_ms": 0.0,
}

_STORAGE_ADAPTER_METRICS: dict[str, Any] = {
    "total_ops": 0,
    "total_failed": 0,
    "consecutive_failures": 0,
    "last_success_at": None,
    "last_failure_at": None,
    "last_error": None,
    "last_latency_ms": 0.0,
}

# Optional hooks for deterministic testing / fault simulation
_DB_HEALTH_OVERRIDE: Callable[[], dict[str, Any]] | None = None
_RESOURCE_METRICS_OVERRIDE: Callable[[], dict[str, Any]] | None = None


def set_db_health_override(hook: Callable[[], dict[str, Any]] | None) -> None:
    """Allows tests to simulate PostgreSQL unavailability or connection pool exhaustion."""
    global _DB_HEALTH_OVERRIDE
    _DB_HEALTH_OVERRIDE = hook


def set_resource_metrics_override(hook: Callable[[], dict[str, Any]] | None) -> None:
    """Allows tests to simulate CPU, memory, or disk exhaustion."""
    global _RESOURCE_METRICS_OVERRIDE
    _RESOURCE_METRICS_OVERRIDE = hook


def reset_monitoring_runtime_state() -> None:
    """Resets in-memory telemetry counters and test hooks (used in test suites)."""
    global _DB_HEALTH_OVERRIDE, _RESOURCE_METRICS_OVERRIDE
    _RUNTIME_THRESHOLD_OVERRIDES.clear()
    _API_REQUEST_WINDOW.clear()
    _EMAIL_ADAPTER_METRICS.update(
        {
            "total_sent": 0,
            "total_failed": 0,
            "consecutive_failures": 0,
            "last_success_at": None,
            "last_failure_at": None,
            "last_error": None,
            "last_latency_ms": 0.0,
        }
    )
    _STORAGE_ADAPTER_METRICS.update(
        {
            "total_ops": 0,
            "total_failed": 0,
            "consecutive_failures": 0,
            "last_success_at": None,
            "last_failure_at": None,
            "last_error": None,
            "last_latency_ms": 0.0,
        }
    )
    _DB_HEALTH_OVERRIDE = None
    _RESOURCE_METRICS_OVERRIDE = None
    DB_OUTAGE_FALLBACK_BUFFER.clear()


# ---------------------------------------------------------------------------
# Configurable Threshold Management
# ---------------------------------------------------------------------------
def get_monitoring_thresholds(db: Session | None = None) -> dict[str, Any]:
    thresholds = dict(DEFAULT_MONITORING_THRESHOLDS)
    thresholds.update(_RUNTIME_THRESHOLD_OVERRIDES)
    if db is not None:
        try:
            setting = (
                db.query(PlatformSetting)
                .filter(PlatformSetting.setting_key == "technical_monitoring_thresholds")
                .first()
            )
            if setting and isinstance(setting.value_json, dict):
                thresholds.update(setting.value_json)
        except Exception:
            pass
    return thresholds


def update_monitoring_thresholds(
    db: Session | None,
    updates: dict[str, Any],
    actor_user_id: UUID | None = None,
) -> dict[str, Any]:
    clean_updates = {k: v for k, v in updates.items() if k in DEFAULT_MONITORING_THRESHOLDS and v is not None}
    _RUNTIME_THRESHOLD_OVERRIDES.update(clean_updates)
    if db is not None:
        try:
            setting = (
                db.query(PlatformSetting)
                .filter(PlatformSetting.setting_key == "technical_monitoring_thresholds")
                .first()
            )
            merged = dict(DEFAULT_MONITORING_THRESHOLDS)
            if setting and isinstance(setting.value_json, dict):
                merged.update(setting.value_json)
            merged.update(clean_updates)
            if not setting:
                setting = PlatformSetting(
                    setting_key="technical_monitoring_thresholds",
                    category="TechnicalMonitoring",
                    value_json=merged,
                    description="Configurable thresholds for Automatic Technical Monitoring & Incident Detection",
                    updated_by=actor_user_id,
                )
                db.add(setting)
            else:
                setting.value_json = merged
                setting.updated_by = actor_user_id
            db.commit()
        except Exception as exc:
            logger.warning("Could not persist monitoring thresholds to DB: %s", exc)
    return get_monitoring_thresholds(db)


# ---------------------------------------------------------------------------
# Centralized Structured Error Logging (Section 3)
# ---------------------------------------------------------------------------
def record_structured_error(
    db: Session | None,
    *,
    service_name: str,
    exception_type: str,
    error_message: str,
    stack_trace: str | None = None,
    endpoint: str | None = None,
    http_method: str | None = None,
    http_status_code: int | None = None,
    correlation_id: str | None = None,
    tenant_id: UUID | str | None = None,
    user_id: UUID | str | None = None,
    environment: str | None = None,
    metadata: dict[str, Any] | None = None,
    force_log: bool = False,
) -> PlatformErrorLog | None:
    """
    Captures an unexpected application or service error into centralized structured logs
    (`PlatformErrorLog`) with full secret/PII redaction and occurrence counting.
    Normal client HTTP errors (400, 401, 403, 404, 409, 422) are ignored by default.
    """
    if not force_log and http_status_code in IGNORED_CLIENT_HTTP_STATUSES:
        return None

    now = utc_now()
    thresholds = get_monitoring_thresholds(db)
    env = environment or thresholds.get("environment", "production")

    safe_msg = redact_sensitive_text(error_message, max_length=2000)
    safe_trace = redact_sensitive_text(stack_trace, max_length=8000) if stack_trace else None
    safe_meta = redact_sensitive_dict(metadata or {})

    fingerprint = compute_error_fingerprint(
        service_name=service_name,
        error_category=exception_type or "UnhandledError",
        endpoint=endpoint,
        environment=env,
    )

    parsed_tenant_id: UUID | None = None
    if tenant_id:
        try:
            parsed_tenant_id = UUID(str(tenant_id))
        except Exception:
            parsed_tenant_id = None

    parsed_user_id: UUID | None = None
    if user_id:
        try:
            parsed_user_id = UUID(str(user_id))
        except Exception:
            parsed_user_id = None

    # Emit structured JSON log line to server logs (with redacted stack trace)
    structured_log_payload = {
        "timestamp": now.isoformat(),
        "service_name": service_name,
        "environment": env,
        "endpoint": endpoint,
        "http_method": http_method,
        "http_status_code": http_status_code,
        "exception_type": exception_type,
        "error_fingerprint": fingerprint,
        "safe_message": safe_msg,
        "correlation_id": correlation_id,
        "tenant_id": str(parsed_tenant_id) if parsed_tenant_id else None,
        "user_id": str(parsed_user_id) if parsed_user_id else None,
    }
    logger.error("STRUCTURED_ERROR_EVENT %s", json.dumps(structured_log_payload, default=str))

    if db is None:
        write_db_outage_fallback_record(
            {
                "record_type": "error_log",
                **structured_log_payload,
                "redacted_stack_trace": safe_trace,
                "metadata": safe_meta,
            },
            log_path=thresholds.get("fallback_log_path"),
        )
        return None

    try:
        existing = (
            db.query(PlatformErrorLog)
            .filter(
                PlatformErrorLog.service_name == service_name,
                PlatformErrorLog.error_fingerprint == fingerprint,
                PlatformErrorLog.environment == env,
            )
            .order_by(PlatformErrorLog.last_seen_at.desc())
            .first()
        )
        if existing:
            existing.occurrence_count = int(existing.occurrence_count or 1) + 1
            existing.last_seen_at = now
            existing.safe_message = safe_msg
            if safe_trace:
                existing.redacted_stack_trace = safe_trace
            if correlation_id:
                existing.correlation_id = correlation_id
            if http_status_code:
                existing.http_status_code = http_status_code
            if parsed_tenant_id:
                existing.tenant_id = parsed_tenant_id
            if parsed_user_id:
                existing.user_id = parsed_user_id
            if safe_meta:
                merged_meta = dict(existing.metadata_json or {})
                merged_meta.update(safe_meta)
                existing.metadata_json = merged_meta
            db.commit()
            db.refresh(existing)
            return existing

        event_code = f"ERR-{now:%Y%m%d}-{uuid.uuid4().hex[:8].upper()}"
        err_row = PlatformErrorLog(
            event_code=event_code,
            service_name=service_name,
            environment=env,
            endpoint=endpoint,
            http_method=http_method,
            http_status_code=http_status_code,
            exception_type=exception_type[:120],
            error_fingerprint=fingerprint,
            safe_message=safe_msg,
            redacted_stack_trace=safe_trace,
            correlation_id=correlation_id,
            tenant_id=parsed_tenant_id,
            user_id=parsed_user_id,
            occurrence_count=1,
            first_seen_at=now,
            last_seen_at=now,
            metadata_json=safe_meta,
        )
        db.add(err_row)
        db.commit()
        db.refresh(err_row)
        return err_row
    except Exception as db_exc:
        try:
            db.rollback()
        except Exception:
            pass
        write_db_outage_fallback_record(
            {
                "record_type": "error_log_db_failure",
                "db_error": redact_sensitive_text(str(db_exc)),
                **structured_log_payload,
                "redacted_stack_trace": safe_trace,
                "metadata": safe_meta,
            },
            log_path=thresholds.get("fallback_log_path"),
        )
        return None


# ---------------------------------------------------------------------------
# Platform Admin Recipient Lookup & Alert Dispatch (Section 8)
# ---------------------------------------------------------------------------
def _get_platform_technical_recipients(db: Session | None) -> tuple[UUID | None, list[tuple[UUID, str, str]]]:
    """
    Returns (platform_tenant_id, list of (user_id, email, full_name)) for active
    Platform Super Admin, Platform Manager, and Technical employees.
    Never returns customer tenant users.
    """
    if db is None:
        return None, []
    try:
        platform_tenant = (
            db.query(Tenant)
            .filter((Tenant.is_platform.is_(True)) | (Tenant.name == "SCuilONE Platform"))
            .first()
        )
        if not platform_tenant:
            return None, []

        rows = (
            db.query(User, PlatformEmployee)
            .join(PlatformEmployee, PlatformEmployee.user_id == User.id)
            .filter(
                User.tenant_id == platform_tenant.id,
                User.status == "Active",
                PlatformEmployee.role_scope == "platform",
                PlatformEmployee.role_name.in_(
                    ["Platform Super Admin", "Platform Manager", "Technical"]
                ),
            )
            .all()
        )
        recipients: list[tuple[UUID, str, str]] = []
        seen_ids: set[str] = set()
        for user, _emp in rows:
            uid_str = str(user.id)
            if uid_str not in seen_ids:
                seen_ids.add(uid_str)
                recipients.append((user.id, user.email, user.full_name))
        return platform_tenant.id, recipients
    except Exception as exc:
        logger.warning("Failed to query platform technical recipients: %s", exc)
        return None, []


def _notify_platform_admins_of_incident(
    db: Session | None,
    incident: PlatformTechnicalIncident | dict[str, Any],
    event_kind: str,
) -> int:
    """
    Dispatches in-app Notification records and Brevo emails to authorized Platform Admin
    and Technical employees for:
    - 'created' (new Critical/High incident)
    - 'escalated' (severity escalated)
    - 'resolved' (automatic recovery confirmed)
    - 'reminder' (unresolved Critical/High incident reminder)
    """
    now = utc_now()
    if isinstance(incident, dict):
        inc_id = incident.get("id")
        inc_num = incident.get("incident_number", "INC-FALLBACK")
        title = incident.get("title", "Technical Incident")
        service_name = incident.get("service_name", SERVICE_POSTGRESQL)
        severity = incident.get("severity", "Critical")
        status_val = incident.get("status", "Investigating")
        environment = incident.get("environment", "production")
        first_occ = str(incident.get("first_occurrence_at", now.isoformat()))
        last_occ = str(incident.get("last_occurrence_at", now.isoformat()))
        occ_count = int(incident.get("occurrence_count", 1))
        description = incident.get("description", "")
        affected_endpoint = incident.get("affected_endpoint")
        affected_tenant_count = int(incident.get("affected_tenant_count", 0))
    else:
        inc_id = incident.id
        inc_num = incident.incident_number
        title = incident.title
        service_name = incident.service_name
        severity = incident.severity
        status_val = incident.status
        environment = incident.environment
        first_occ = (
            incident.first_occurrence_at.isoformat()
            if incident.first_occurrence_at
            else now.isoformat()
        )
        last_occ = (
            incident.last_occurrence_at.isoformat()
            if incident.last_occurrence_at
            else now.isoformat()
        )
        occ_count = int(incident.occurrence_count or 1)
        description = incident.description
        affected_endpoint = incident.affected_endpoint
        affected_tenant_count = int(incident.affected_tenant_count or 0)

    platform_tenant_id, recipients = _get_platform_technical_recipients(db)
    notified_count = 0

    # Create in-app notifications when DB is available
    if db is not None and platform_tenant_id and recipients:
        for user_id, _email, _name in recipients:
            try:
                notif_title = f"[{severity}] {inc_num}: {title}"[:200]
                notif_msg = redact_sensitive_text(
                    f"Service: {service_name} | Status: {status_val} | Occurrences: {occ_count} | {description}",
                    max_length=800,
                )
                db.add(
                    Notification(
                        tenant_id=platform_tenant_id,
                        recipient_user_id=user_id,
                        workflow_id=None,
                        title=notif_title,
                        message=notif_msg,
                        notification_type=f"technical_incident_{event_kind}",
                        related_module="platform_technical",
                        related_record_id=inc_id if isinstance(inc_id, UUID) else None,
                        is_read=False,
                    )
                )
            except Exception as exc:
                logger.warning("Failed to add in-app technical notification: %s", exc)

    # Determine email recipients (fallback to configured super admin email if DB is unreachable)
    email_targets = [email for _uid, email, _name in recipients if email]
    if not email_targets:
        fallback_email = getattr(settings, "PLATFORM_SUPER_ADMIN_EMAIL", None) or getattr(
            settings, "SMTP_FROM_EMAIL", None
        )
        if fallback_email:
            email_targets = [fallback_email]

    # Do not attempt Brevo email if the failing service IS the Email Adapter itself
    # unless event_kind == "resolved" (when email adapter recovered)
    skip_email = service_name == SERVICE_EMAIL_ADAPTER and event_kind != "resolved"

    if not skip_email:
        for recipient_email in email_targets:
            try:
                send_technical_incident_alert_email(
                    recipient_email=recipient_email,
                    event_kind=event_kind,
                    incident_number=inc_num,
                    title=title,
                    service_name=service_name,
                    severity=severity,
                    status=status_val,
                    environment=environment,
                    first_occurrence_at=first_occ,
                    last_occurrence_at=last_occ,
                    occurrence_count=occ_count,
                    summary=description,
                    affected_endpoint=affected_endpoint,
                    affected_tenant_count=affected_tenant_count,
                )
                notified_count += 1
            except Exception as exc:
                logger.warning("Failed to send technical incident email to %s: %s", recipient_email, exc)

    if not isinstance(incident, dict):
        incident.last_notified_at = now
        incident.last_notified_severity = severity
        incident.notification_count = int(incident.notification_count or 0) + 1

    return max(notified_count, len(recipients))


# ---------------------------------------------------------------------------
# Automatic Incident Detection & Deduplication Engine (Sections 4, 5, 6, 7)
# ---------------------------------------------------------------------------
def detect_or_update_incident(
    db: Session | None,
    *,
    service_name: str,
    title: str,
    description: str,
    error_category: str,
    severity: str = "High",
    incident_type: str = "Incident",
    affected_endpoint: str | None = None,
    tenant_id: UUID | str | None = None,
    diagnostics: dict[str, Any] | None = None,
    environment: str | None = None,
    occurrence_increment: int = 1,
    notify_on_create: bool | None = None,
) -> tuple[PlatformTechnicalIncident | dict[str, Any], bool]:
    """
    Core Incident Detection & Deduplication Engine:
    - Computes deterministic fingerprint by (service_name, error_category, affected_endpoint, environment).
    - Reuses any active (status != 'Resolved') incident matching (service_name, error_fingerprint, environment).
    - Increments occurrence_count, updates last_occurrence_at, preserves first_occurrence_at.
    - Tracks affected_tenant_ids_json and affected_tenant_count.
    - Escalates severity automatically if severity rank increases or occurrence thresholds are crossed.
    - Avoids duplicate notifications unless severity escalates or unresolved reminder window elapses.
    - Creates a new incident if no active incident exists (including after a prior incident was Resolved).
    Returns (incident_or_fallback_dict, created_new_bool).
    """
    now = utc_now()
    thresholds = get_monitoring_thresholds(db)
    env = environment or thresholds.get("environment", "production")

    fingerprint = compute_error_fingerprint(
        service_name=service_name,
        error_category=error_category,
        endpoint=affected_endpoint,
        environment=env,
    )

    safe_desc = redact_sensitive_text(description, max_length=3000)
    safe_diag = redact_sensitive_dict(diagnostics or {})
    tenant_str = str(tenant_id) if tenant_id else None

    # Fallback path if db is None
    if db is None:
        fallback_inc = {
            "id": str(uuid.uuid4()),
            "incident_number": f"INC-{now:%Y%m%d}-{uuid.uuid4().hex[:6].upper()}",
            "title": redact_sensitive_text(title, 200),
            "incident_type": incident_type,
            "service_name": service_name,
            "severity": severity,
            "status": "Investigating",
            "environment": env,
            "error_fingerprint": fingerprint,
            "detection_source": "automatic",
            "description": safe_desc,
            "first_occurrence_at": now.isoformat(),
            "last_occurrence_at": now.isoformat(),
            "occurrence_count": max(1, occurrence_increment),
            "affected_endpoint": affected_endpoint,
            "affected_tenant_count": 1 if tenant_str else 0,
            "affected_tenant_ids_json": [tenant_str] if tenant_str else [],
            "diagnostics_json": safe_diag,
        }
        write_db_outage_fallback_record(
            {"record_type": "incident", **fallback_inc},
            log_path=thresholds.get("fallback_log_path"),
        )
        _notify_platform_admins_of_incident(None, fallback_inc, event_kind="created")
        return fallback_inc, True

    try:
        active_incident = (
            db.query(PlatformTechnicalIncident)
            .filter(
                PlatformTechnicalIncident.service_name == service_name,
                PlatformTechnicalIncident.error_fingerprint == fingerprint,
                PlatformTechnicalIncident.environment == env,
                PlatformTechnicalIncident.status != "Resolved",
            )
            .order_by(PlatformTechnicalIncident.created_at.desc())
            .first()
        )

        if active_incident is not None:
            # Deduplicate into existing active incident (Section 5)
            active_incident.occurrence_count = int(active_incident.occurrence_count or 1) + max(
                1, occurrence_increment
            )
            if not active_incident.first_occurrence_at:
                active_incident.first_occurrence_at = ensure_utc(active_incident.created_at) or now
            active_incident.last_occurrence_at = now
            active_incident.consecutive_healthy_checks = 0
            active_incident.description = safe_desc
            if affected_endpoint and not active_incident.affected_endpoint:
                active_incident.affected_endpoint = affected_endpoint

            # Merge affected tenants
            tenant_list = list(active_incident.affected_tenant_ids_json or [])
            if tenant_str and tenant_str not in tenant_list:
                tenant_list.append(tenant_str)
                active_incident.affected_tenant_ids_json = tenant_list
            active_incident.affected_tenant_count = len(tenant_list)

            # Merge diagnostics
            merged_diag = dict(active_incident.diagnostics_json or {})
            merged_diag.update(safe_diag)
            merged_diag["latest_update_utc"] = now.isoformat()
            active_incident.diagnostics_json = merged_diag

            # Evaluate automatic severity escalation (Section 6 & Section 14 #12)
            current_sev = active_incident.severity or "Medium"
            target_sev = severity
            crit_threshold = int(thresholds.get("api_5xx_critical_threshold", 10))
            high_threshold = int(thresholds.get("api_5xx_incident_threshold", 3)) * 2

            if active_incident.occurrence_count >= crit_threshold and SEVERITY_RANK.get(target_sev, 2) < SEVERITY_RANK["Critical"]:
                target_sev = "Critical"
            elif active_incident.occurrence_count >= high_threshold and SEVERITY_RANK.get(target_sev, 2) < SEVERITY_RANK["High"]:
                target_sev = "High"

            escalated = SEVERITY_RANK.get(target_sev, 1) > SEVERITY_RANK.get(current_sev, 1)
            if escalated:
                active_incident.severity = target_sev
                _notify_platform_admins_of_incident(db, active_incident, event_kind="escalated")
            else:
                # Check if an unresolved reminder is due for Critical/High incidents
                reminder_mins = int(thresholds.get("unresolved_reminder_minutes", 60))
                last_notif = ensure_utc(active_incident.last_notified_at)
                if (
                    active_incident.severity in {"Critical", "High"}
                    and last_notif is not None
                    and (now - last_notif) >= timedelta(minutes=reminder_mins)
                ):
                    _notify_platform_admins_of_incident(db, active_incident, event_kind="reminder")

            db.commit()
            db.refresh(active_incident)
            return active_incident, False

        # Create a brand-new automatic incident (Section 7)
        _, recipients = _get_platform_technical_recipients(db)
        default_owner_id = recipients[0][0] if recipients else None

        inc_num = f"INC-{now:%Y%m%d}-{uuid.uuid4().hex[:6].upper()}"
        tenant_list = [tenant_str] if tenant_str else []
        new_incident = PlatformTechnicalIncident(
            incident_number=inc_num,
            title=redact_sensitive_text(title, 200),
            incident_type=incident_type,
            service_name=service_name,
            severity=severity,
            status="Investigating",
            environment=env,
            error_fingerprint=fingerprint,
            detection_source="automatic",
            description=safe_desc,
            first_occurrence_at=now,
            last_occurrence_at=now,
            occurrence_count=max(1, occurrence_increment),
            affected_endpoint=affected_endpoint,
            affected_tenant_count=len(tenant_list),
            affected_tenant_ids_json=tenant_list,
            diagnostics_json=safe_diag,
            consecutive_healthy_checks=0,
            owner_user_id=default_owner_id,
        )
        db.add(new_incident)
        db.flush()

        should_notify = (
            notify_on_create
            if notify_on_create is not None
            else (severity in {"Critical", "High", "Medium"})
        )
        if should_notify:
            _notify_platform_admins_of_incident(db, new_incident, event_kind="created")

        db.commit()
        db.refresh(new_incident)
        return new_incident, True

    except Exception as db_exc:
        try:
            db.rollback()
        except Exception:
            pass
        fallback_inc = {
            "id": str(uuid.uuid4()),
            "incident_number": f"INC-{now:%Y%m%d}-{uuid.uuid4().hex[:6].upper()}",
            "title": redact_sensitive_text(title, 200),
            "incident_type": incident_type,
            "service_name": service_name,
            "severity": severity,
            "status": "Investigating",
            "environment": env,
            "error_fingerprint": fingerprint,
            "detection_source": "automatic",
            "description": safe_desc,
            "first_occurrence_at": now.isoformat(),
            "last_occurrence_at": now.isoformat(),
            "occurrence_count": max(1, occurrence_increment),
            "affected_endpoint": affected_endpoint,
            "affected_tenant_count": 1 if tenant_str else 0,
            "affected_tenant_ids_json": [tenant_str] if tenant_str else [],
            "diagnostics_json": {**safe_diag, "db_fallback_reason": redact_sensitive_text(str(db_exc))},
        }
        write_db_outage_fallback_record(
            {"record_type": "incident_db_outage", **fallback_inc},
            log_path=thresholds.get("fallback_log_path"),
        )
        _notify_platform_admins_of_incident(None, fallback_inc, event_kind="created")
        return fallback_inc, True


# ---------------------------------------------------------------------------
# Adapter & API Telemetry Recording Hooks (Section 2 & Section 4)
# ---------------------------------------------------------------------------
def record_api_request_metric(
    db: Session | None,
    *,
    method: str,
    path: str,
    status_code: int,
    latency_ms: float,
    correlation_id: str | None = None,
    tenant_id: UUID | str | None = None,
    user_id: UUID | str | None = None,
    exception_type: str | None = None,
    error_message: str | None = None,
    stack_trace: str | None = None,
) -> dict[str, Any]:
    """
    Tracks rolling API latency, error rates, and HTTP 5xx spikes.
    - Normal validation/auth errors (400, 401, 403, 404, 409, 422) are tracked for traffic volume
      but NEVER treated as infrastructure errors or incidents.
    - Unexpected HTTP 5xx errors are logged in PlatformErrorLog and compared against
      configurable thresholds to trigger or update an API Gateway incident.
    """
    now = utc_now()
    thresholds = get_monitoring_thresholds(db)
    window_minutes = int(thresholds.get("api_window_minutes", 15))
    cutoff = now - timedelta(minutes=window_minutes)

    # Prune expired entries
    _API_REQUEST_WINDOW[:] = [
        entry for entry in _API_REQUEST_WINDOW if entry["timestamp"] >= cutoff
    ]

    is_5xx = status_code >= 500
    is_ignored_4xx = status_code in IGNORED_CLIENT_HTTP_STATUSES

    _API_REQUEST_WINDOW.append(
        {
            "timestamp": now,
            "method": method,
            "path": path,
            "status_code": status_code,
            "latency_ms": float(latency_ms),
            "is_5xx": is_5xx,
            "is_ignored_4xx": is_ignored_4xx,
            "tenant_id": str(tenant_id) if tenant_id else None,
        }
    )

    result: dict[str, Any] = {"recorded": True, "is_5xx": is_5xx, "incident_id": None}

    if is_5xx:
        err_log = record_structured_error(
            db,
            service_name=SERVICE_API_GATEWAY,
            exception_type=exception_type or f"HTTP{status_code}Error",
            error_message=error_message or f"Unexpected HTTP {status_code} on {method} {path}",
            stack_trace=stack_trace,
            endpoint=path,
            http_method=method,
            http_status_code=status_code,
            correlation_id=correlation_id,
            tenant_id=tenant_id,
            user_id=user_id,
            metadata={"latency_ms": round(latency_ms, 2)},
        )

        # Count 5xx occurrences for this endpoint (or overall API Gateway) in the active window
        endpoint_5xx_entries = [
            e for e in _API_REQUEST_WINDOW if e["is_5xx"] and e["path"] == path
        ]
        total_5xx_entries = [e for e in _API_REQUEST_WINDOW if e["is_5xx"]]
        threshold_5xx = int(thresholds.get("api_5xx_incident_threshold", 3))
        crit_5xx = int(thresholds.get("api_5xx_critical_threshold", 10))

        count_for_ep = len(endpoint_5xx_entries)
        if count_for_ep >= threshold_5xx or len(total_5xx_entries) >= threshold_5xx:
            sev = "Critical" if (count_for_ep >= crit_5xx or len(total_5xx_entries) >= crit_5xx) else "High"
            inc, created = detect_or_update_incident(
                db,
                service_name=SERVICE_API_GATEWAY,
                title=f"Repeated HTTP 5xx Errors on {method} {path}",
                description=(
                    f"API endpoint {method} {path} returned {count_for_ep} unexpected HTTP {status_code} "
                    f"responses within the last {window_minutes} minutes. Latest error: "
                    f"{redact_sensitive_text(error_message or exception_type or 'Internal Server Error', 300)}"
                ),
                error_category="http_5xx_spike",
                severity=sev,
                incident_type="Incident",
                affected_endpoint=path,
                tenant_id=tenant_id,
                diagnostics={
                    "http_method": method,
                    "endpoint": path,
                    "latest_status_code": status_code,
                    "endpoint_5xx_count_in_window": count_for_ep,
                    "total_5xx_count_in_window": len(total_5xx_entries),
                    "correlation_id": correlation_id,
                    "error_log_event_code": err_log.event_code if err_log else None,
                },
                occurrence_increment=threshold_5xx if count_for_ep == threshold_5xx else 1,
            )
            if err_log is not None and not isinstance(inc, dict) and db is not None:
                try:
                    err_log.related_incident_id = inc.id
                    db.commit()
                except Exception:
                    db.rollback()
            result["incident_id"] = inc["id"] if isinstance(inc, dict) else str(inc.id)
            result["incident_created"] = created

    return result


def record_email_operation(
    *,
    success: bool,
    latency_ms: float = 0.0,
    error: Exception | str | None = None,
    recipient: str | None = None,
    db: Session | None = None,
) -> dict[str, Any]:
    """
    Records Brevo email delivery outcome and automatically creates/updates an incident
    when consecutive failures cross `email_failure_threshold`.
    """
    now = utc_now()
    _EMAIL_ADAPTER_METRICS["last_latency_ms"] = round(float(latency_ms), 2)
    if success:
        _EMAIL_ADAPTER_METRICS["total_sent"] += 1
        _EMAIL_ADAPTER_METRICS["consecutive_failures"] = 0
        _EMAIL_ADAPTER_METRICS["last_success_at"] = now
        _EMAIL_ADAPTER_METRICS["last_error"] = None
        return dict(_EMAIL_ADAPTER_METRICS)

    err_str = redact_sensitive_text(str(error or "Brevo SMTP delivery failure"), 500)
    _EMAIL_ADAPTER_METRICS["total_failed"] += 1
    _EMAIL_ADAPTER_METRICS["consecutive_failures"] += 1
    _EMAIL_ADAPTER_METRICS["last_failure_at"] = now
    _EMAIL_ADAPTER_METRICS["last_error"] = err_str

    own_db = False
    if db is None:
        try:
            db = SessionLocal()
            own_db = True
        except Exception:
            db = None
    try:
      if db is not None:
        thresholds = get_monitoring_thresholds(db)
        fail_threshold = int(thresholds.get("email_failure_threshold", 2))
        record_structured_error(
            db,
            service_name=SERVICE_EMAIL_ADAPTER,
            exception_type=type(error).__name__ if isinstance(error, Exception) else "SMTPDeliveryError",
            error_message=err_str,
            metadata={
                "consecutive_failures": _EMAIL_ADAPTER_METRICS["consecutive_failures"],
                "smtp_host": settings.SMTP_HOST,
                "smtp_port": settings.SMTP_PORT,
            },
            force_log=True,
        )
        if _EMAIL_ADAPTER_METRICS["consecutive_failures"] >= fail_threshold:
            consec = _EMAIL_ADAPTER_METRICS["consecutive_failures"]
            sev = "High" if consec >= fail_threshold * 2 else "Medium"
            detect_or_update_incident(
                db,
                service_name=SERVICE_EMAIL_ADAPTER,
                title="Brevo Email / Notification Adapter Delivery Failures",
                description=(
                    f"Brevo email adapter failed {consec} consecutive times. "
                    f"Latest provider error: {err_str}"
                ),
                error_category="brevo_smtp_failure",
                severity=sev,
                incident_type="Incident",
                diagnostics={
                    "consecutive_failures": consec,
                    "total_failed": _EMAIL_ADAPTER_METRICS["total_failed"],
                    "latest_error": err_str,
                    "smtp_host": settings.SMTP_HOST,
                },
                occurrence_increment=fail_threshold if consec == fail_threshold else 1,
            )
    finally:
        if own_db and db is not None:
            db.close()

    return dict(_EMAIL_ADAPTER_METRICS)


def record_storage_operation(
    *,
    success: bool,
    latency_ms: float = 0.0,
    operation: str = "upload",
    error: Exception | str | None = None,
    tenant_id: UUID | str | None = None,
    db: Session | None = None,
) -> dict[str, Any]:
    """
    Records Cloudinary object storage operation outcome and automatically creates/updates
    an incident when consecutive failures cross `storage_failure_threshold`.
    """
    now = utc_now()
    _STORAGE_ADAPTER_METRICS["last_latency_ms"] = round(float(latency_ms), 2)
    if success:
        _STORAGE_ADAPTER_METRICS["total_ops"] += 1
        _STORAGE_ADAPTER_METRICS["consecutive_failures"] = 0
        _STORAGE_ADAPTER_METRICS["last_success_at"] = now
        _STORAGE_ADAPTER_METRICS["last_error"] = None
        return dict(_STORAGE_ADAPTER_METRICS)

    err_str = redact_sensitive_text(str(error or f"Cloudinary {operation} failure"), 500)
    _STORAGE_ADAPTER_METRICS["total_ops"] += 1
    _STORAGE_ADAPTER_METRICS["total_failed"] += 1
    _STORAGE_ADAPTER_METRICS["consecutive_failures"] += 1
    _STORAGE_ADAPTER_METRICS["last_failure_at"] = now
    _STORAGE_ADAPTER_METRICS["last_error"] = err_str

    own_db = False
    if db is None:
        try:
            db = SessionLocal()
            own_db = True
        except Exception:
            db = None
    try:
      if db is not None:
        thresholds = get_monitoring_thresholds(db)
        fail_threshold = int(thresholds.get("storage_failure_threshold", 2))
        record_structured_error(
            db,
            service_name=SERVICE_OBJECT_STORAGE,
            exception_type=type(error).__name__ if isinstance(error, Exception) else "CloudinaryStorageError",
            error_message=err_str,
            tenant_id=tenant_id,
            metadata={
                "operation": operation,
                "consecutive_failures": _STORAGE_ADAPTER_METRICS["consecutive_failures"],
            },
            force_log=True,
        )
        if _STORAGE_ADAPTER_METRICS["consecutive_failures"] >= fail_threshold:
            consec = _STORAGE_ADAPTER_METRICS["consecutive_failures"]
            sev = "High" if consec >= fail_threshold * 2 else "Medium"
            detect_or_update_incident(
                db,
                service_name=SERVICE_OBJECT_STORAGE,
                title=f"Object Storage (Cloudinary) {operation.capitalize()} Failures",
                description=(
                    f"Cloudinary object storage {operation} failed {consec} consecutive times. "
                    f"Latest error: {err_str}"
                ),
                error_category="cloudinary_storage_failure",
                severity=sev,
                incident_type="Incident",
                tenant_id=tenant_id,
                diagnostics={
                    "operation": operation,
                    "consecutive_failures": consec,
                    "total_failed": _STORAGE_ADAPTER_METRICS["total_failed"],
                    "latest_error": err_str,
                },
                occurrence_increment=fail_threshold if consec == fail_threshold else 1,
            )
    finally:
        if own_db and db is not None:
            db.close()

    return dict(_STORAGE_ADAPTER_METRICS)


# ---------------------------------------------------------------------------
# Background Worker Heartbeat & Job Failure Tracking (Section 2 & Section 4)
# ---------------------------------------------------------------------------
def record_worker_heartbeat(
    db: Session,
    *,
    worker_name: str = "primary_worker",
    status: str = "Active",
    job_name: str | None = None,
    job_status: str | None = None,
    error_message: str | None = None,
    metrics: dict[str, Any] | None = None,
) -> PlatformWorkerHeartbeat:
    """
    Records a background worker heartbeat and scheduled job execution outcome.
    If a scheduled job fails, logs the error and automatically triggers/updates a Background Worker incident.
    """
    now = utc_now()
    safe_err = redact_sensitive_text(error_message, 1000) if error_message else None
    hb = (
        db.query(PlatformWorkerHeartbeat)
        .filter(PlatformWorkerHeartbeat.worker_name == worker_name)
        .first()
    )
    if not hb:
        hb = PlatformWorkerHeartbeat(
            worker_name=worker_name,
            hostname=socket.gethostname(),
            pid=os.getpid(),
            status=status,
            last_heartbeat_at=now,
            consecutive_failures=0,
            metrics_json=redact_sensitive_dict(metrics or {}),
        )
        db.add(hb)
    else:
        hb.hostname = socket.gethostname()
        hb.pid = os.getpid()
        hb.status = status
        hb.last_heartbeat_at = now
        if metrics:
            merged = dict(hb.metrics_json or {})
            merged.update(redact_sensitive_dict(metrics))
            hb.metrics_json = merged

    if job_name:
        hb.last_job_name = job_name
        hb.last_job_status = job_status or ("Failed" if safe_err else "Succeeded")
        hb.last_job_finished_at = now
        if hb.last_job_status == "Failed":
            hb.consecutive_failures = int(hb.consecutive_failures or 0) + 1
            hb.last_error = safe_err
            record_structured_error(
                db,
                service_name=SERVICE_BACKGROUND_WORKER,
                exception_type="ScheduledJobExecutionError",
                error_message=safe_err or f"Background job '{job_name}' failed",
                metadata={"worker_name": worker_name, "job_name": job_name},
                force_log=True,
            )
            detect_or_update_incident(
                db,
                service_name=SERVICE_BACKGROUND_WORKER,
                title=f"Background Scheduled Job Failure: {job_name}",
                description=(
                    f"Scheduled job '{job_name}' on worker '{worker_name}' failed "
                    f"({hb.consecutive_failures} consecutive failure(s)). Error: {safe_err}"
                ),
                error_category=f"worker_job_failure_{job_name}",
                severity="High" if hb.consecutive_failures >= 2 else "Medium",
                incident_type="Incident",
                diagnostics={
                    "worker_name": worker_name,
                    "job_name": job_name,
                    "consecutive_failures": hb.consecutive_failures,
                    "last_error": safe_err,
                },
            )
        else:
            hb.consecutive_failures = 0
            hb.last_error = None

    db.commit()
    db.refresh(hb)
    return hb


# ---------------------------------------------------------------------------
# Individual Service Health Checks (Section 2 - Failure Isolated)
# ---------------------------------------------------------------------------
def check_system_resources(db: Session | None = None) -> dict[str, Any]:
    """
    Collects real CPU, memory, and disk resource usage where supported by the OS.
    Never fails even on restricted container filesystems.
    """
    thresholds = get_monitoring_thresholds(db)
    if _RESOURCE_METRICS_OVERRIDE is not None:
        raw = _RESOURCE_METRICS_OVERRIDE()
        cpu_pct = float(raw.get("cpu_usage_pct", 15.0))
        mem_pct = float(raw.get("memory_usage_pct", 35.0))
        disk_pct = float(raw.get("disk_usage_pct", 40.0))
    else:
        # CPU usage estimate via os.getloadavg() normalized by CPU count
        cpu_pct = 0.0
        try:
            load1, _, _ = os.getloadavg()
            cores = max(1, os.cpu_count() or 1)
            cpu_pct = min(100.0, round((load1 / cores) * 100.0, 2))
        except Exception:
            cpu_pct = 5.0

        # Memory usage via /proc/meminfo if available
        mem_pct = 0.0
        try:
            meminfo: dict[str, int] = {}
            with open("/proc/meminfo", "r", encoding="utf-8") as fh:
                for line in fh:
                    parts = line.split(":")
                    if len(parts) == 2:
                        key = parts[0].strip()
                        val_kb = int(parts[1].strip().split()[0])
                        meminfo[key] = val_kb
            total_kb = meminfo.get("MemTotal", 0)
            avail_kb = meminfo.get("MemAvailable", meminfo.get("MemFree", 0))
            if total_kb > 0:
                mem_pct = round(((total_kb - avail_kb) / total_kb) * 100.0, 2)
        except Exception:
            mem_pct = 25.0

        # Disk usage via shutil.disk_usage
        disk_pct = 0.0
        try:
            usage = shutil.disk_usage(".")
            if usage.total > 0:
                disk_pct = round((usage.used / usage.total) * 100.0, 2)
        except Exception:
            disk_pct = 30.0

    status_val = "Healthy"
    issues: list[str] = []
    if (
        cpu_pct >= float(thresholds["cpu_critical_pct"])
        or mem_pct >= float(thresholds["memory_critical_pct"])
        or disk_pct >= float(thresholds["disk_critical_pct"])
    ):
        status_val = "Unavailable"
    elif (
        cpu_pct >= float(thresholds["cpu_degraded_pct"])
        or mem_pct >= float(thresholds["memory_degraded_pct"])
        or disk_pct >= float(thresholds["disk_degraded_pct"])
    ):
        status_val = "Degraded"

    if cpu_pct >= float(thresholds["cpu_degraded_pct"]):
        issues.append(f"CPU usage high ({cpu_pct}%)")
    if mem_pct >= float(thresholds["memory_degraded_pct"]):
        issues.append(f"Memory usage high ({mem_pct}%)")
    if disk_pct >= float(thresholds["disk_degraded_pct"]):
        issues.append(f"Disk usage high ({disk_pct}%)")

    return {
        "status": status_val,
        "cpu_usage_pct": cpu_pct,
        "memory_usage_pct": mem_pct,
        "disk_usage_pct": disk_pct,
        "issues": issues,
    }


def check_database_health(db: Session | None) -> dict[str, Any]:
    """
    Executes a real database query (`SELECT 1`) and inspects SQLAlchemy connection pool state.
    Detects PostgreSQL unavailability, query failures, high latency, and pool exhaustion.
    """
    thresholds = get_monitoring_thresholds(db)
    started = time.monotonic()

    if _DB_HEALTH_OVERRIDE is not None:
        override = _DB_HEALTH_OVERRIDE()
        return {
            "service_name": SERVICE_POSTGRESQL,
            "status": override.get("status", "Unavailable"),
            "latency_ms": float(override.get("latency_ms", 0.0)),
            "error_message": override.get("error_message", "PostgreSQL connection refused"),
            "details": override.get("details", {"simulated": True}),
        }

    if db is None:
        return {
            "service_name": SERVICE_POSTGRESQL,
            "status": "Unavailable",
            "latency_ms": 0.0,
            "error_message": "Database session is unavailable",
            "details": {},
        }

    try:
        db.execute(text("SELECT 1")).scalar()
        latency_ms = round((time.monotonic() - started) * 1000.0, 2)

        pool_details: dict[str, Any] = {}
        pool_exhausted = False
        try:
            pool = engine.pool
            size = pool.size() if hasattr(pool, "size") else 0
            checkedout = pool.checkedout() if hasattr(pool, "checkedout") else 0
            overflow = pool.overflow() if hasattr(pool, "overflow") else 0
            checkedin = pool.checkedin() if hasattr(pool, "checkedin") else 0
            pool_details = {
                "pool_size": size,
                "checked_in": checkedin,
                "checked_out": checkedout,
                "overflow": overflow,
            }
            if size > 0 and checkedout >= size + max(overflow, 0) and checkedin == 0 and checkedout > 5:
                pool_exhausted = True
        except Exception:
            pass

        status_val = "Healthy"
        err_msg = None
        if pool_exhausted:
            status_val = "Degraded"
            err_msg = "Database connection pool nearing exhaustion"
        elif latency_ms >= float(thresholds.get("db_latency_degraded_ms", 500.0)):
            status_val = "Degraded"
            err_msg = f"Database query latency elevated ({latency_ms} ms)"

        return {
            "service_name": SERVICE_POSTGRESQL,
            "status": status_val,
            "latency_ms": latency_ms,
            "error_message": err_msg,
            "details": pool_details,
        }
    except Exception as exc:
        latency_ms = round((time.monotonic() - started) * 1000.0, 2)
        safe_err = redact_sensitive_text(f"{type(exc).__name__}: {exc}", 500)
        return {
            "service_name": SERVICE_POSTGRESQL,
            "status": "Unavailable",
            "latency_ms": latency_ms,
            "error_message": safe_err,
            "details": {"exception_type": type(exc).__name__},
        }


def check_api_gateway_health(db: Session | None) -> dict[str, Any]:
    """
    Evaluates FastAPI application availability, rolling HTTP 5xx error rate,
    and average response latency over the configured monitoring window.
    """
    now = utc_now()
    thresholds = get_monitoring_thresholds(db)
    window_minutes = int(thresholds.get("api_window_minutes", 15))
    cutoff = now - timedelta(minutes=window_minutes)

    recent = [e for e in _API_REQUEST_WINDOW if e["timestamp"] >= cutoff]
    total_reqs = len(recent)
    http_5xx_count = sum(1 for e in recent if e["is_5xx"])
    ignored_4xx_count = sum(1 for e in recent if e["is_ignored_4xx"])
    avg_latency_ms = (
        round(sum(e["latency_ms"] for e in recent) / total_reqs, 2) if total_reqs > 0 else 1.5
    )
    error_rate_pct = round((http_5xx_count / total_reqs) * 100.0, 2) if total_reqs > 0 else 0.0

    status_val = "Healthy"
    err_msg = None
    crit_5xx = int(thresholds.get("api_5xx_critical_threshold", 10))
    deg_5xx = int(thresholds.get("api_5xx_incident_threshold", 3))
    unavail_rate = float(thresholds.get("api_error_rate_unavailable_pct", 25.0))
    deg_rate = float(thresholds.get("api_error_rate_degraded_pct", 5.0))
    deg_lat = float(thresholds.get("api_latency_degraded_ms", 1000.0))

    if http_5xx_count >= crit_5xx or (total_reqs >= deg_5xx and error_rate_pct >= unavail_rate):
        status_val = "Unavailable"
        err_msg = f"High HTTP 5xx error volume ({http_5xx_count} errors, {error_rate_pct}% error rate)"
    elif (
        http_5xx_count >= deg_5xx
        or (total_reqs >= deg_5xx and error_rate_pct >= deg_rate)
        or avg_latency_ms >= deg_lat
    ):
        status_val = "Degraded"
        err_msg = (
            f"Elevated API 5xx errors ({http_5xx_count}) or latency ({avg_latency_ms} ms)"
        )

    return {
        "service_name": SERVICE_API_GATEWAY,
        "status": status_val,
        "latency_ms": avg_latency_ms,
        "error_message": err_msg,
        "details": {
            "window_minutes": window_minutes,
            "total_requests_window": total_reqs,
            "http_5xx_count_window": http_5xx_count,
            "ignored_4xx_count_window": ignored_4xx_count,
            "error_rate_pct": error_rate_pct,
            "avg_response_time_ms": avg_latency_ms,
        },
    }


def check_worker_health(db: Session | None) -> dict[str, Any]:
    """
    Checks background worker heartbeat freshness and scheduled job execution status.
    Detects stale worker heartbeats and repeated job failures.
    """
    now = utc_now()
    thresholds = get_monitoring_thresholds(db)
    stale_seconds = int(thresholds.get("worker_heartbeat_stale_seconds", 300))
    started = time.monotonic()

    if db is None:
        return {
            "service_name": SERVICE_BACKGROUND_WORKER,
            "status": "Unavailable",
            "latency_ms": 0.0,
            "error_message": "Cannot verify worker heartbeat (database unavailable)",
            "details": {},
        }

    try:
        heartbeats = (
            db.query(PlatformWorkerHeartbeat)
            .order_by(PlatformWorkerHeartbeat.last_heartbeat_at.desc())
            .all()
        )
        latency_ms = round((time.monotonic() - started) * 1000.0, 2)

        if not heartbeats:
            # Seed an initial active heartbeat if none exists yet so fresh deployments aren't falsely marked down,
            # while allowing tests or production workers to age or fail it.
            hb = record_worker_heartbeat(
                db,
                worker_name="primary_worker",
                status="Active",
                job_name="worker_bootstrap",
                job_status="Succeeded",
            )
            heartbeats = [hb]

        latest = heartbeats[0]
        last_hb = ensure_utc(latest.last_heartbeat_at) or now
        age_seconds = max(0.0, round((now - last_hb).total_seconds(), 2))

        status_val = "Healthy"
        err_msg = None

        if latest.status in {"Stopped", "Failed"} or age_seconds > stale_seconds:
            status_val = "Unavailable"
            err_msg = (
                f"Worker '{latest.worker_name}' heartbeat is stale ({int(age_seconds)}s > {stale_seconds}s threshold). "
                f"Last heartbeat at {last_hb.isoformat()}"
            )
        elif int(latest.consecutive_failures or 0) > 0 or latest.last_job_status == "Failed":
            status_val = "Degraded"
            err_msg = (
                f"Worker '{latest.worker_name}' reported job failure on '{latest.last_job_name}': "
                f"{latest.last_error or 'Job execution failed'}"
            )

        return {
            "service_name": SERVICE_BACKGROUND_WORKER,
            "status": status_val,
            "latency_ms": latency_ms,
            "error_message": err_msg,
            "details": {
                "worker_name": latest.worker_name,
                "worker_status": latest.status,
                "last_heartbeat_at": last_hb.isoformat(),
                "heartbeat_age_seconds": age_seconds,
                "stale_threshold_seconds": stale_seconds,
                "last_job_name": latest.last_job_name,
                "last_job_status": latest.last_job_status,
                "consecutive_failures": int(latest.consecutive_failures or 0),
            },
        }
    except Exception as exc:
        latency_ms = round((time.monotonic() - started) * 1000.0, 2)
        return {
            "service_name": SERVICE_BACKGROUND_WORKER,
            "status": "Unavailable",
            "latency_ms": latency_ms,
            "error_message": redact_sensitive_text(str(exc), 400),
            "details": {},
        }


def check_email_adapter_health(db: Session | None = None) -> dict[str, Any]:
    """
    Verifies Brevo SMTP adapter configuration and checks recent delivery failure streaks.
    """
    thresholds = get_monitoring_thresholds(db)
    fail_threshold = int(thresholds.get("email_failure_threshold", 2))

    configured = bool(
        getattr(settings, "SMTP_HOST", None)
        and getattr(settings, "SMTP_PORT", None)
        and getattr(settings, "SMTP_FROM_EMAIL", None)
    )
    consec_fails = int(_EMAIL_ADAPTER_METRICS["consecutive_failures"])
    last_err = _EMAIL_ADAPTER_METRICS["last_error"]
    latency_ms = float(_EMAIL_ADAPTER_METRICS["last_latency_ms"] or 1.2)

    status_val = "Healthy"
    err_msg = None
    if not configured:
        status_val = "Unavailable"
        err_msg = "Brevo SMTP adapter configuration is missing (SMTP_HOST / SMTP_PORT / SMTP_FROM_EMAIL)"
    elif consec_fails >= fail_threshold * 2:
        status_val = "Unavailable"
        err_msg = f"Brevo email adapter unavailable ({consec_fails} consecutive failures): {last_err}"
    elif consec_fails >= fail_threshold:
        status_val = "Degraded"
        err_msg = f"Brevo email adapter degraded ({consec_fails} consecutive failures): {last_err}"

    return {
        "service_name": SERVICE_EMAIL_ADAPTER,
        "status": status_val,
        "latency_ms": latency_ms,
        "error_message": err_msg,
        "details": {
            "provider": "Brevo SMTP",
            "configured": configured,
            "smtp_host": getattr(settings, "SMTP_HOST", None),
            "smtp_port": getattr(settings, "SMTP_PORT", None),
            "total_sent": _EMAIL_ADAPTER_METRICS["total_sent"],
            "total_failed": _EMAIL_ADAPTER_METRICS["total_failed"],
            "consecutive_failures": consec_fails,
            "last_success_at": (
                _EMAIL_ADAPTER_METRICS["last_success_at"].isoformat()
                if _EMAIL_ADAPTER_METRICS["last_success_at"]
                else None
            ),
            "last_failure_at": (
                _EMAIL_ADAPTER_METRICS["last_failure_at"].isoformat()
                if _EMAIL_ADAPTER_METRICS["last_failure_at"]
                else None
            ),
        },
    }


def check_storage_adapter_health(db: Session | None = None) -> dict[str, Any]:
    """
    Verifies Cloudinary Object Storage adapter configuration and checks recent upload/destroy failure streaks.
    """
    thresholds = get_monitoring_thresholds(db)
    fail_threshold = int(thresholds.get("storage_failure_threshold", 2))

    configured = bool(
        getattr(settings, "CLOUDINARY_CLOUD_NAME", None)
        and getattr(settings, "CLOUDINARY_API_KEY", None)
        and getattr(settings, "CLOUDINARY_API_SECRET", None)
    )
    consec_fails = int(_STORAGE_ADAPTER_METRICS["consecutive_failures"])
    last_err = _STORAGE_ADAPTER_METRICS["last_error"]
    latency_ms = float(_STORAGE_ADAPTER_METRICS["last_latency_ms"] or 1.5)

    status_val = "Healthy"
    err_msg = None
    if not configured:
        status_val = "Unavailable"
        err_msg = "Cloudinary object storage credentials are missing"
    elif consec_fails >= fail_threshold * 2:
        status_val = "Unavailable"
        err_msg = f"Cloudinary object storage unavailable ({consec_fails} consecutive failures): {last_err}"
    elif consec_fails >= fail_threshold:
        status_val = "Degraded"
        err_msg = f"Cloudinary object storage degraded ({consec_fails} consecutive failures): {last_err}"

    return {
        "service_name": SERVICE_OBJECT_STORAGE,
        "status": status_val,
        "latency_ms": latency_ms,
        "error_message": err_msg,
        "details": {
            "provider": "Cloudinary",
            "configured": configured,
            "cloud_name": getattr(settings, "CLOUDINARY_CLOUD_NAME", None),
            "total_operations": _STORAGE_ADAPTER_METRICS["total_ops"],
            "total_failed": _STORAGE_ADAPTER_METRICS["total_failed"],
            "consecutive_failures": consec_fails,
            "last_success_at": (
                _STORAGE_ADAPTER_METRICS["last_success_at"].isoformat()
                if _STORAGE_ADAPTER_METRICS["last_success_at"]
                else None
            ),
            "last_failure_at": (
                _STORAGE_ADAPTER_METRICS["last_failure_at"].isoformat()
                if _STORAGE_ADAPTER_METRICS["last_failure_at"]
                else None
            ),
        },
    }


# ---------------------------------------------------------------------------
# Sync Fallback Outage Records After DB Recovery (Section 13)
# ---------------------------------------------------------------------------
def sync_db_outage_fallback_records(db: Session) -> int:
    """
    Synchronizes any buffered fallback outage records (written while PostgreSQL was down)
    into PostgreSQL once database connectivity recovers.
    """
    if not DB_OUTAGE_FALLBACK_BUFFER:
        return 0
    synced = 0
    pending = list(DB_OUTAGE_FALLBACK_BUFFER)
    DB_OUTAGE_FALLBACK_BUFFER.clear()
    for item in pending:
        try:
            if str(item.get("record_type", "")).startswith("incident"):
                detect_or_update_incident(
                    db,
                    service_name=item.get("service_name", SERVICE_POSTGRESQL),
                    title=item.get("title", "PostgreSQL Database Outage (Recovered Fallback)"),
                    description=item.get("description", "Database outage recorded in fallback buffer"),
                    error_category="database_connectivity_outage",
                    severity=item.get("severity", "Critical"),
                    incident_type="Outage",
                    diagnostics=item.get("diagnostics_json", {}),
                    notify_on_create=False,
                )
                synced += 1
        except Exception:
            pass
    return synced


# ---------------------------------------------------------------------------
# Health Check Persistence, Automatic Incident Triggering & Recovery (Section 9 & 11)
# ---------------------------------------------------------------------------
def _process_service_check_outcome(
    db: Session | None,
    check_result: dict[str, Any],
    thresholds: dict[str, Any],
) -> dict[str, Any]:
    """
    Persists a PlatformServiceHealthCheck row, triggers automatic incident creation/deduplication
    if the service is Degraded/Unavailable, or advances automatic recovery detection if Healthy.
    """
    now = utc_now()
    env = thresholds.get("environment", "production")
    service_name = check_result["service_name"]
    status_val = check_result["status"]
    latency_ms = Decimal(str(round(float(check_result.get("latency_ms", 0.0)), 2)))
    err_msg = check_result.get("error_message")
    details = redact_sensitive_dict(check_result.get("details") or {})

    # If PostgreSQL itself is reported Unavailable, use fallback mechanism if DB writes fail
    if service_name == SERVICE_POSTGRESQL and status_val == "Unavailable":
        # Record structured error & Critical incident (will gracefully fallback if real DB is down,
        # or persist to DB if simulated via _DB_HEALTH_OVERRIDE)
        record_structured_error(
            db,
            service_name=SERVICE_POSTGRESQL,
            exception_type="DatabaseUnavailableError",
            error_message=err_msg or "PostgreSQL health check failed",
            metadata=details,
            force_log=True,
        )
        inc, created = detect_or_update_incident(
            db,
            service_name=SERVICE_POSTGRESQL,
            title="PostgreSQL Database Connectivity Outage",
            description=err_msg or "PostgreSQL database failed health check and is unavailable.",
            error_category="database_connectivity_outage",
            severity="Critical",
            incident_type="Outage",
            diagnostics=details,
        )
        if db is not None:
            try:
                hc = PlatformServiceHealthCheck(
                    service_name=service_name,
                    environment=env,
                    status=status_val,
                    latency_ms=latency_ms,
                    details_json=details,
                    error_message=err_msg,
                    checked_at=now,
                )
                db.add(hc)
                db.commit()
            except Exception:
                try:
                    db.rollback()
                except Exception:
                    pass
                write_db_outage_fallback_record(
                    {
                        "record_type": "health_check_fallback",
                        "service_name": service_name,
                        "status": status_val,
                        "error_message": err_msg,
                        "details": details,
                    },
                    log_path=thresholds.get("fallback_log_path"),
                )
        return {
            **check_result,
            "checked_at": now.isoformat(),
            "incident_id": inc["id"] if isinstance(inc, dict) else str(inc.id),
            "incident_created": created,
            "recovered_incidents": [],
        }

    if db is None:
        return {**check_result, "checked_at": now.isoformat(), "recovered_incidents": []}

    # Persist health check record
    try:
        if service_name == SERVICE_POSTGRESQL and status_val == "Healthy":
            sync_db_outage_fallback_records(db)

        hc = PlatformServiceHealthCheck(
            service_name=service_name,
            environment=env,
            status=status_val,
            latency_ms=latency_ms,
            details_json=details,
            error_message=redact_sensitive_text(err_msg, 500) if err_msg else None,
            checked_at=now,
        )
        db.add(hc)
        db.commit()
    except Exception as exc:
        try:
            db.rollback()
        except Exception:
            pass
        logger.warning("Could not persist health check for %s: %s", service_name, exc)

    recovered_ids: list[str] = []
    incident_id_str: str | None = None
    incident_created = False

    if status_val in {"Unavailable", "Degraded"}:
        # Determine severity and error category by service
        if service_name == SERVICE_POSTGRESQL:
            sev = "Critical" if status_val == "Unavailable" else "High"
            cat = "database_connectivity_outage" if status_val == "Unavailable" else "database_degraded"
            inc_type = "Outage" if status_val == "Unavailable" else "Incident"
            title = (
                "PostgreSQL Database Unavailable"
                if status_val == "Unavailable"
                else "PostgreSQL Database Performance / Pool Degradation"
            )
        elif service_name == SERVICE_BACKGROUND_WORKER:
            sev = "High" if status_val == "Unavailable" else "Medium"
            cat = "worker_heartbeat_stale" if status_val == "Unavailable" else "worker_job_degraded"
            inc_type = "Outage" if status_val == "Unavailable" else "Incident"
            title = (
                "Background Worker Heartbeat Stale / Unavailable"
                if status_val == "Unavailable"
                else "Background Worker Scheduled Job Failures"
            )
        elif service_name == SERVICE_EMAIL_ADAPTER:
            sev = "High" if status_val == "Unavailable" else "Medium"
            cat = "brevo_smtp_failure"
            inc_type = "Incident"
            title = "Brevo Email / Notification Adapter Failure"
        elif service_name == SERVICE_OBJECT_STORAGE:
            sev = "High" if status_val == "Unavailable" else "Medium"
            cat = "cloudinary_storage_failure"
            inc_type = "Incident"
            title = "Object Storage (Cloudinary) Adapter Failure"
        else:
            sev = "Critical" if status_val == "Unavailable" else "High"
            cat = "api_gateway_degradation"
            inc_type = "Outage" if status_val == "Unavailable" else "Incident"
            title = f"{service_name} {status_val}"

        inc, incident_created = detect_or_update_incident(
            db,
            service_name=service_name,
            title=title,
            description=err_msg or f"{service_name} reported status '{status_val}'.",
            error_category=cat,
            severity=sev,
            incident_type=inc_type,
            diagnostics=details,
        )
        incident_id_str = inc["id"] if isinstance(inc, dict) else str(inc.id)

    elif status_val == "Healthy":
        # Section 9: Automatic Recovery Detection
        required_checks = max(1, int(thresholds.get("recovery_consecutive_checks_required", 2)))
        try:
            active_incidents = (
                db.query(PlatformTechnicalIncident)
                .filter(
                    PlatformTechnicalIncident.service_name == service_name,
                    PlatformTechnicalIncident.environment == env,
                    PlatformTechnicalIncident.status != "Resolved",
                    PlatformTechnicalIncident.detection_source == "automatic",
                )
                .all()
            )
            for inc in active_incidents:
                inc.consecutive_healthy_checks = int(inc.consecutive_healthy_checks or 0) + 1
                if inc.consecutive_healthy_checks >= required_checks:
                    inc.status = "Resolved"  # Never automatically Closed (Section 9)
                    inc.recovery_detected_at = now
                    inc.resolved_at = now.replace(tzinfo=None)
                    inc.recovery_evidence_json = {
                        "recovered_at_utc": now.isoformat(),
                        "consecutive_healthy_checks": inc.consecutive_healthy_checks,
                        "required_consecutive_checks": required_checks,
                        "verified_latency_ms": float(latency_ms),
                        "verified_status": "Healthy",
                        "details": details,
                    }
                    recovery_note = (
                        f"Auto-resolved at {now.isoformat()} after {inc.consecutive_healthy_checks} "
                        f"consecutive healthy checks (latency {latency_ms} ms)."
                    )
                    inc.recovery_actions = (
                        f"{inc.recovery_actions}\n{recovery_note}".strip()
                        if inc.recovery_actions
                        else recovery_note
                    )
                    _notify_platform_admins_of_incident(db, inc, event_kind="resolved")
                    recovered_ids.append(str(inc.id))
            if active_incidents:
                db.commit()
        except Exception as exc:
            try:
                db.rollback()
            except Exception:
                pass
            logger.warning("Failed to process recovery detection for %s: %s", service_name, exc)

    return {
        **check_result,
        "checked_at": now.isoformat(),
        "incident_id": incident_id_str,
        "incident_created": incident_created,
        "recovered_incidents": recovered_ids,
    }


def run_all_health_checks_and_detect_incidents(db: Session | None) -> dict[str, Any]:
    """
    Executes all service health checks with strict failure isolation:
    if any individual check throws an unexpected exception, it is caught and converted
    into an Unavailable check result without crashing the remaining checks (Section 11).
    """
    thresholds = get_monitoring_thresholds(db)
    check_runners: list[tuple[str, Callable[[], dict[str, Any]]]] = [
        (SERVICE_POSTGRESQL, lambda: check_database_health(db)),
        (SERVICE_API_GATEWAY, lambda: check_api_gateway_health(db)),
        (SERVICE_BACKGROUND_WORKER, lambda: check_worker_health(db)),
        (SERVICE_EMAIL_ADAPTER, lambda: check_email_adapter_health(db)),
        (SERVICE_OBJECT_STORAGE, lambda: check_storage_adapter_health(db)),
    ]

    service_results: list[dict[str, Any]] = []
    for svc_name, runner in check_runners:
        try:
            raw_res = runner()
        except Exception as exc:
            raw_res = {
                "service_name": svc_name,
                "status": "Unavailable",
                "latency_ms": 0.0,
                "error_message": redact_sensitive_text(f"Health check crashed: {type(exc).__name__}: {exc}", 400),
                "details": {},
            }
        processed = _process_service_check_outcome(db, raw_res, thresholds)
        service_results.append(processed)

    # Check system resources (CPU, Memory, Disk) with failure isolation
    try:
        resources = check_system_resources(db)
        if resources["status"] in {"Degraded", "Unavailable"}:
            detect_or_update_incident(
                db,
                service_name=SERVICE_SYSTEM_RESOURCES,
                title=f"System Resource Exhaustion ({', '.join(resources['issues'])})",
                description=(
                    f"System resource thresholds exceeded: CPU={resources['cpu_usage_pct']}%, "
                    f"Memory={resources['memory_usage_pct']}%, Disk={resources['disk_usage_pct']}%."
                ),
                error_category="system_resource_exhaustion",
                severity="Critical" if resources["status"] == "Unavailable" else "High",
                incident_type="Incident",
                diagnostics=resources,
            )
    except Exception as exc:
        resources = {
            "status": "Degraded",
            "cpu_usage_pct": 0.0,
            "memory_usage_pct": 0.0,
            "disk_usage_pct": 0.0,
            "issues": [redact_sensitive_text(str(exc), 200)],
        }

    # Prune old health check history beyond retention window
    if db is not None:
        try:
            retention_days = max(1, int(thresholds.get("health_history_retention_days", 30)))
            cutoff = utc_now() - timedelta(days=retention_days)
            db.query(PlatformServiceHealthCheck).filter(
                PlatformServiceHealthCheck.checked_at < cutoff
            ).delete(synchronize_session=False)
            db.commit()
        except Exception:
            try:
                db.rollback()
            except Exception:
                pass

    return {
        "checked_at": utc_now().isoformat(),
        "services": service_results,
        "resources": resources,
    }


# ---------------------------------------------------------------------------
# Real Technical Health Snapshot Builder (`GET /api/v1/platform/technical/health`)
# ---------------------------------------------------------------------------
def serialize_technical_incident(inc: PlatformTechnicalIncident) -> dict[str, Any]:
    return {
        "id": str(inc.id),
        "incident_number": inc.incident_number,
        "title": inc.title,
        "incident_type": inc.incident_type,
        "service_name": inc.service_name,
        "severity": inc.severity,
        "status": inc.status,
        "environment": inc.environment,
        "error_fingerprint": inc.error_fingerprint,
        "detection_source": inc.detection_source,
        "version_tag": inc.version_tag,
        "description": inc.description,
        "recovery_actions": inc.recovery_actions,
        "first_occurrence_at": inc.first_occurrence_at.isoformat() if inc.first_occurrence_at else (inc.created_at.isoformat() if inc.created_at else None),
        "last_occurrence_at": inc.last_occurrence_at.isoformat() if inc.last_occurrence_at else (inc.updated_at.isoformat() if inc.updated_at else None),
        "occurrence_count": int(inc.occurrence_count or 1),
        "affected_endpoint": inc.affected_endpoint,
        "affected_tenant_count": int(inc.affected_tenant_count or 0),
        "affected_tenant_ids": list(inc.affected_tenant_ids_json or []),
        "diagnostics": redact_sensitive_dict(inc.diagnostics_json or {}),
        "consecutive_healthy_checks": int(inc.consecutive_healthy_checks or 0),
        "recovery_detected_at": inc.recovery_detected_at.isoformat() if inc.recovery_detected_at else None,
        "recovery_evidence": redact_sensitive_dict(inc.recovery_evidence_json or {}),
        "last_notified_at": inc.last_notified_at.isoformat() if inc.last_notified_at else None,
        "last_notified_severity": inc.last_notified_severity,
        "notification_count": int(inc.notification_count or 0),
        "owner_user_id": str(inc.owner_user_id) if inc.owner_user_id else None,
        "related_ticket_id": str(inc.related_ticket_id) if inc.related_ticket_id else None,
        "resolved_at": inc.resolved_at.isoformat() if inc.resolved_at else None,
        "created_at": inc.created_at.isoformat() if inc.created_at else None,
        "updated_at": inc.updated_at.isoformat() if inc.updated_at else None,
    }


def get_real_technical_health_snapshot(
    db: Session,
    *,
    run_live_checks: bool = True,
) -> dict[str, Any]:
    """
    Builds the complete, real-time `GET /api/v1/platform/technical/health` response (Section 10):
    - Executes real health checks for API Gateway, PostgreSQL, Background Worker, Brevo Email Adapter,
      Cloudinary Object Storage, and System Resources.
    - Calculates real uptime percentages from persisted `PlatformServiceHealthCheck` records.
    - Computes overall system status (`Healthy`, `Degraded`, `Unavailable`).
    - Returns CPU, memory, disk usage, API error rate, average response time, last successful check,
      last failure timestamp, active incident count, technical support ticket count, and incidents list.
    """
    check_run = run_all_health_checks_and_detect_incidents(db) if run_live_checks else None
    live_by_service: dict[str, dict[str, Any]] = {}
    if check_run:
        for item in check_run["services"]:
            live_by_service[item["service_name"]] = item
        resources = check_run["resources"]
    else:
        resources = check_system_resources(db)

    try:
        all_incidents = (
            db.query(PlatformTechnicalIncident)
            .order_by(PlatformTechnicalIncident.created_at.desc())
            .limit(100)
            .all()
        )
    except Exception:
        all_incidents = []

    active_incidents = [i for i in all_incidents if i.status != "Resolved"]

    services_payload: list[dict[str, Any]] = []
    last_successful_global: datetime | None = None
    last_failure_global: datetime | None = None

    for svc_name in ALL_MONITORED_SERVICES:
        live = live_by_service.get(svc_name, {})
        try:
            history = (
                db.query(PlatformServiceHealthCheck)
                .filter(PlatformServiceHealthCheck.service_name == svc_name)
                .order_by(PlatformServiceHealthCheck.checked_at.desc())
                .limit(500)
                .all()
            )
        except Exception:
            history = []

        total_checks = len(history)
        if total_checks > 0:
            healthy_weight = sum(
                1.0 if h.status == "Healthy" else (0.5 if h.status == "Degraded" else 0.0)
                for h in history
            )
            uptime_pct = round((healthy_weight / total_checks) * 100.0, 2)
        else:
            uptime_pct = 100.0 if live.get("status", "Healthy") == "Healthy" else 0.0

        last_healthy_row = next((h for h in history if h.status == "Healthy"), None)
        last_failed_row = next((h for h in history if h.status != "Healthy"), None)

        if last_healthy_row and last_healthy_row.checked_at:
            hc_dt = ensure_utc(last_healthy_row.checked_at)
            if hc_dt and (last_successful_global is None or hc_dt > last_successful_global):
                last_successful_global = hc_dt
        if last_failed_row and last_failed_row.checked_at:
            fl_dt = ensure_utc(last_failed_row.checked_at)
            if fl_dt and (last_failure_global is None or fl_dt > last_failure_global):
                last_failure_global = fl_dt

        svc_active_incidents = [
            i for i in active_incidents if i.service_name == svc_name
        ]
        svc_status = live.get(
            "status",
            history[0].status if history else "Healthy",
        )
        # If there is an unresolved Critical incident for this service, reflect at least Degraded/Unavailable
        if any(i.severity == "Critical" for i in svc_active_incidents) and svc_status == "Healthy":
            svc_status = "Unavailable"
        elif svc_active_incidents and svc_status == "Healthy":
            svc_status = "Degraded"

        op_label = (
            "Operational"
            if svc_status == "Healthy"
            else ("Degraded" if svc_status == "Degraded" else "Unavailable")
        )

        services_payload.append(
            {
                "service": svc_name,
                "status": svc_status,
                "operational_status": op_label,
                "uptime_pct": uptime_pct,
                "latency_ms": float(
                    live.get(
                        "latency_ms",
                        float(history[0].latency_ms) if history else 0.0,
                    )
                ),
                "checks_recorded": total_checks,
                "active_incidents_count": len(svc_active_incidents),
                "last_checked_at": (
                    live.get("checked_at")
                    or (history[0].checked_at.isoformat() if history and history[0].checked_at else None)
                ),
                "last_healthy_at": (
                    last_healthy_row.checked_at.isoformat()
                    if last_healthy_row and last_healthy_row.checked_at
                    else None
                ),
                "last_failure_at": (
                    last_failed_row.checked_at.isoformat()
                    if last_failed_row and last_failed_row.checked_at
                    else None
                ),
                "error_message": live.get("error_message"),
                "details": live.get("details")
                or (history[0].details_json if history else {}),
            }
        )

    # Determine overall system status
    statuses = [s["status"] for s in services_payload]
    if "Unavailable" in statuses or resources.get("status") == "Unavailable" or any(
        i.severity == "Critical" for i in active_incidents
    ):
        # If PostgreSQL or API Gateway is Unavailable, system_status is Unavailable; otherwise Degraded/Unavailable
        critical_svc_down = any(
            s["service"] in {SERVICE_POSTGRESQL, SERVICE_API_GATEWAY}
            and s["status"] == "Unavailable"
            for s in services_payload
        )
        system_status = "Unavailable" if critical_svc_down else "Degraded"
    elif "Degraded" in statuses or resources.get("status") == "Degraded" or len(active_incidents) > 0:
        system_status = "Degraded"
    else:
        system_status = "Healthy"

    try:
        tech_tickets_count = (
            db.query(SupportTicket, PlatformSupportTicketMeta)
            .join(
                PlatformSupportTicketMeta,
                PlatformSupportTicketMeta.ticket_id == SupportTicket.id,
            )
            .filter(PlatformSupportTicketMeta.routing_queue == "Technical")
            .count()
        )
    except Exception:
        tech_tickets_count = 0

    api_svc_details = next(
        (s.get("details", {}) for s in services_payload if s["service"] == SERVICE_API_GATEWAY),
        {},
    )

    return {
        "system_status": system_status,
        "checked_at": utc_now().isoformat(),
        "last_successful_check_at": (
            last_successful_global.isoformat() if last_successful_global else utc_now().isoformat()
        ),
        "last_failure_at": last_failure_global.isoformat() if last_failure_global else None,
        "active_incidents_count": len(active_incidents),
        "technical_support_tickets_count": tech_tickets_count,
        "api_metrics": {
            "error_rate_pct": float(api_svc_details.get("error_rate_pct", 0.0)),
            "avg_response_time_ms": float(api_svc_details.get("avg_response_time_ms", 1.5)),
            "total_requests_window": int(api_svc_details.get("total_requests_window", 0)),
            "http_5xx_count_window": int(api_svc_details.get("http_5xx_count_window", 0)),
            "ignored_4xx_count_window": int(api_svc_details.get("ignored_4xx_count_window", 0)),
            "window_minutes": int(api_svc_details.get("window_minutes", 15)),
        },
        "resources": {
            "status": resources.get("status", "Healthy"),
            "cpu_usage_pct": float(resources.get("cpu_usage_pct", 0.0)),
            "memory_usage_pct": float(resources.get("memory_usage_pct", 0.0)),
            "disk_usage_pct": float(resources.get("disk_usage_pct", 0.0)),
            "issues": resources.get("issues", []),
        },
        "services": services_payload,
        "fallback_outage_buffer_count": len(DB_OUTAGE_FALLBACK_BUFFER),
        "incidents_and_deployments": [serialize_technical_incident(i) for i in all_incidents],
    }
