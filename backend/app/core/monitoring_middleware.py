import logging
import time
import traceback
import uuid
from typing import Callable

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from jose import jwt
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.monitoring_config import (
    IGNORED_CLIENT_HTTP_STATUSES,
    redact_sensitive_text,
)
from app.database.connection import SessionLocal, settings
from app.services.monitoring_service import record_api_request_metric

logger = logging.getLogger("scuilone.monitoring.middleware")


def _extract_safe_identity_from_request(request: Request) -> tuple[str | None, str | None]:
    """
    Safely extracts (tenant_id, user_id) from a Bearer JWT header if present,
    without logging or exposing the token and without bypassing route authentication.
    """
    auth_header = request.headers.get("Authorization") or request.headers.get("authorization")
    if not auth_header or not auth_header.lower().startswith("bearer "):
        return None, None
    token = auth_header.split(" ", 1)[1].strip()
    if not token:
        return None, None
    try:
        payload = jwt.decode(
            token,
            settings.JWT_SECRET_KEY,
            algorithms=[settings.JWT_ALGORITHM],
            options={"verify_exp": False},
        )
        tenant_id = payload.get("tenant_id")
        user_id = payload.get("user_id") or payload.get("sub")
        return (
            str(tenant_id) if tenant_id else None,
            str(user_id) if user_id else None,
        )
    except Exception:
        return None, None


class TechnicalMonitoringMiddleware(BaseHTTPMiddleware):
    """
    Production-grade FastAPI Request Monitoring & Error Capture Middleware (Sections 2, 3, 4, 6):
    - Generates or propagates `X-Correlation-ID` / `X-Request-ID` on every request and response.
    - Measures request execution latency in milliseconds.
    - Safely extracts tenant_id and user_id context when available.
    - Ignores normal client/validation HTTP status codes (400, 401, 403, 404, 409, 422).
    - Captures unexpected HTTP 5xx responses and unhandled exceptions into centralized
      structured logs (`PlatformErrorLog`) with full secret redaction, and triggers
      automatic incident detection when thresholds are crossed.
    """

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        correlation_id = (
            request.headers.get("X-Correlation-ID")
            or request.headers.get("X-Request-ID")
            or f"req-{uuid.uuid4().hex[:12]}"
        )
        request.state.correlation_id = correlation_id
        started = time.monotonic()
        tenant_id, user_id = _extract_safe_identity_from_request(request)
        method = request.method
        path = request.url.path

        try:
            response = await call_next(request)
            latency_ms = round((time.monotonic() - started) * 1000.0, 2)
            status_code = response.status_code
            response.headers["X-Correlation-ID"] = correlation_id
            response.headers["X-Response-Time-Ms"] = str(latency_ms)

            db = None
            try:
                if status_code >= 500:
                    db = SessionLocal()
                record_api_request_metric(
                    db,
                    method=method,
                    path=path,
                    status_code=status_code,
                    latency_ms=latency_ms,
                    correlation_id=correlation_id,
                    tenant_id=tenant_id,
                    user_id=user_id,
                    exception_type=f"HTTP{status_code}Response" if status_code >= 500 else None,
                    error_message=(
                        f"Endpoint {method} {path} returned HTTP {status_code}"
                        if status_code >= 500
                        else None
                    ),
                )
            except Exception as mon_exc:
                logger.warning("Monitoring metric hook error: %s", mon_exc)
            finally:
                if db is not None:
                    db.close()

            return response

        except Exception as exc:
            latency_ms = round((time.monotonic() - started) * 1000.0, 2)
            raw_trace = traceback.format_exc()
            safe_err_msg = redact_sensitive_text(f"{type(exc).__name__}: {exc}", 1000)
            safe_trace = redact_sensitive_text(raw_trace, 8000)

            db = None
            try:
                db = SessionLocal()
                record_api_request_metric(
                    db,
                    method=method,
                    path=path,
                    status_code=500,
                    latency_ms=latency_ms,
                    correlation_id=correlation_id,
                    tenant_id=tenant_id,
                    user_id=user_id,
                    exception_type=type(exc).__name__,
                    error_message=safe_err_msg,
                    stack_trace=safe_trace,
                )
            except Exception as mon_exc:
                logger.warning("Monitoring unhandled exception hook error: %s", mon_exc)
            finally:
                if db is not None:
                    db.close()

            # Return a safe 500 JSON response without leaking internal stack traces to tenants (Section 12)
            return JSONResponse(
                status_code=500,
                content={
                    "detail": "An unexpected internal server error occurred. Our technical team has been notified.",
                    "correlation_id": correlation_id,
                },
                headers={
                    "X-Correlation-ID": correlation_id,
                    "X-Response-Time-Ms": str(latency_ms),
                },
            )
