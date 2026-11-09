import time
from typing import Any, Callable

import cloudinary
import cloudinary.uploader

from app.database.connection import settings


cloudinary.config(
    cloud_name=settings.CLOUDINARY_CLOUD_NAME,
    api_key=settings.CLOUDINARY_API_KEY,
    api_secret=settings.CLOUDINARY_API_SECRET,
    secure=True,
)

_ORIGINAL_UPLOAD = getattr(cloudinary.uploader, "_scuilone_orig_upload", cloudinary.uploader.upload)
_ORIGINAL_DESTROY = getattr(cloudinary.uploader, "_scuilone_orig_destroy", cloudinary.uploader.destroy)
setattr(cloudinary.uploader, "_scuilone_orig_upload", _ORIGINAL_UPLOAD)
setattr(cloudinary.uploader, "_scuilone_orig_destroy", _ORIGINAL_DESTROY)

_STORAGE_HOOK: Callable[..., dict[str, Any]] | None = None


def set_storage_adapter_hook(hook: Callable[..., dict[str, Any]] | None) -> None:
    """Optional test hook to intercept or simulate Cloudinary upload/destroy failures."""
    global _STORAGE_HOOK
    _STORAGE_HOOK = hook


def _monitored_upload(*args: Any, **kwargs: Any) -> Any:
    started = time.monotonic()
    try:
        if _STORAGE_HOOK is not None:
            result = _STORAGE_HOOK("upload", *args, **kwargs)
        else:
            result = _ORIGINAL_UPLOAD(*args, **kwargs)
        latency_ms = (time.monotonic() - started) * 1000.0
        try:
            from app.services.monitoring_service import record_storage_operation

            record_storage_operation(success=True, latency_ms=latency_ms, operation="upload")
        except Exception:
            pass
        return result
    except Exception as exc:
        latency_ms = (time.monotonic() - started) * 1000.0
        try:
            from app.services.monitoring_service import record_storage_operation

            record_storage_operation(
                success=False,
                latency_ms=latency_ms,
                operation="upload",
                error=exc,
            )
        except Exception:
            pass
        raise


def _monitored_destroy(*args: Any, **kwargs: Any) -> Any:
    started = time.monotonic()
    try:
        if _STORAGE_HOOK is not None:
            result = _STORAGE_HOOK("destroy", *args, **kwargs)
        else:
            result = _ORIGINAL_DESTROY(*args, **kwargs)
        latency_ms = (time.monotonic() - started) * 1000.0
        try:
            from app.services.monitoring_service import record_storage_operation

            record_storage_operation(success=True, latency_ms=latency_ms, operation="destroy")
        except Exception:
            pass
        return result
    except Exception as exc:
        latency_ms = (time.monotonic() - started) * 1000.0
        try:
            from app.services.monitoring_service import record_storage_operation

            record_storage_operation(
                success=False,
                latency_ms=latency_ms,
                operation="destroy",
                error=exc,
            )
        except Exception:
            pass
        raise


cloudinary.uploader.upload = _monitored_upload
cloudinary.uploader.destroy = _monitored_destroy
