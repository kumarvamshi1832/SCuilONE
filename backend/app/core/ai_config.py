"""Local Ollama configuration and strict loopback security validation."""
import os
from urllib.parse import urlparse

DEFAULT_OLLAMA_BASE_URL = "http://localhost:11434"
DEFAULT_OLLAMA_MODEL = "llama3.2:1b"
ALLOWED_LOOPBACK_HOSTS = {"localhost", "127.0.0.1", "::1"}


def allowed_ollama_hosts() -> set[str]:
    """Loopback hosts plus any explicitly allow-listed host (OLLAMA_ALLOWED_HOSTS=host1,host2).

    Only add a host on a private network or behind an authenticated proxy; Ollama itself has no auth.
    """
    extra = {h.strip().lower() for h in os.environ.get("OLLAMA_ALLOWED_HOSTS", "").split(",") if h.strip()}
    return ALLOWED_LOOPBACK_HOSTS | extra
FORBIDDEN_OLLAMA_PATHS = {"/api/pull", "/api/create", "/api/delete", "/api/push", "/api/copy"}


def validate_ollama_base_url(raw_url: str | None) -> str:
    """Ensure the Ollama base URL points strictly to a local loopback address."""
    url = (raw_url or DEFAULT_OLLAMA_BASE_URL).strip().rstrip("/")
    parsed = urlparse(url)

    if parsed.scheme not in {"http", "https"}:
        raise ValueError("OLLAMA_BASE_URL must use http or https.")

    if parsed.username or parsed.password:
        raise ValueError("OLLAMA_BASE_URL must not contain embedded credentials.")

    if parsed.query or parsed.fragment:
        raise ValueError("OLLAMA_BASE_URL must not contain query parameters or fragments.")

    hostname = (parsed.hostname or "").strip().lower()
    if hostname not in allowed_ollama_hosts():
        raise ValueError(
            f"Rejected Ollama host '{hostname}'. Only localhost, 127.0.0.1, ::1 "
            "or hosts listed in OLLAMA_ALLOWED_HOSTS are permitted."
        )

    if parsed.path and parsed.path not in {"", "/"}:
        raise ValueError("OLLAMA_BASE_URL must not include a sub-path.")

    return url


def validate_ollama_model_tag(raw_model: str | None) -> str:
    """Validate the configured Ollama model tag while keeping llama3.2:1b as default."""
    model = (raw_model or DEFAULT_OLLAMA_MODEL).strip()
    if not model:
        return DEFAULT_OLLAMA_MODEL
    if any(ch.isspace() or ch in {"/", "\\", ";", "&", "|"} for ch in model) or len(model) > 80:
        raise ValueError("Invalid OLLAMA_MODEL tag format.")
    return model


def get_ollama_config() -> dict:
    """Return validated local Ollama configuration from Settings or environment."""
    try:
        from app.database.connection import settings
        raw_url = getattr(settings, "OLLAMA_BASE_URL", None)
        raw_model = getattr(settings, "OLLAMA_MODEL", None)
        raw_timeout = getattr(settings, "OLLAMA_TIMEOUT_SECONDS", 45)
        raw_retries = getattr(settings, "OLLAMA_MAX_RETRIES", 2)
        raw_temp = getattr(settings, "OLLAMA_TEMPERATURE", 0.1)
    except Exception:
        raw_url = os.environ.get("OLLAMA_BASE_URL", DEFAULT_OLLAMA_BASE_URL)
        raw_model = os.environ.get("OLLAMA_MODEL", DEFAULT_OLLAMA_MODEL)
        raw_timeout = int(os.environ.get("OLLAMA_TIMEOUT_SECONDS", "45"))
        raw_retries = int(os.environ.get("OLLAMA_MAX_RETRIES", "2"))
        raw_temp = float(os.environ.get("OLLAMA_TEMPERATURE", "0.1"))

    base_url = validate_ollama_base_url(raw_url)
    model_tag = validate_ollama_model_tag(raw_model)
    timeout_seconds = max(5, min(int(raw_timeout or 45), 120))
    max_retries = max(0, min(int(raw_retries if raw_retries is not None else 2), 3))
    temperature = max(0.0, min(float(raw_temp if raw_temp is not None else 0.1), 1.0))

    return {
        "base_url": base_url,
        "model": model_tag,
        "timeout_seconds": timeout_seconds,
        "max_retries": max_retries,
        "temperature": temperature,
    }
