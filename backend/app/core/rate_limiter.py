import os

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def portal_or_ip_key(request: Request) -> str:
    """Rate-limit per authenticated portal user when known, otherwise per client IP."""
    portal_user_id = getattr(request.state, "portal_user_id", None)
    if portal_user_id:
        return f"portal:{portal_user_id}"
    return get_remote_address(request)


# Use Redis in production (RATE_LIMIT_STORAGE_URI=redis://...) so limits are shared across workers.
storage_uri = os.getenv("RATE_LIMIT_STORAGE_URI", "memory://")

limiter = Limiter(
    key_func=portal_or_ip_key,
    storage_uri=storage_uri,
    headers_enabled=True,
)
