
import base64
import hashlib
import secrets
import hmac
from urllib.parse import quote

import pyotp
from cryptography.fernet import Fernet

from app.database.connection import settings


ISSUER_NAME = "SCuilONE"


def _fernet() -> Fernet:
    raw_key = (settings.MFA_ENCRYPTION_KEY or "default_mfa_encryption_key_32bytes_change_in_prod=").encode("utf-8")
    try:
        if len(base64.urlsafe_b64decode(raw_key)) == 32:
            return Fernet(raw_key)
    except Exception:
        pass
    derived_key = base64.urlsafe_b64encode(hashlib.sha256(raw_key).digest())
    return Fernet(derived_key)


def encrypt_totp_secret(secret: str) -> str:
    encrypted = _fernet().encrypt(secret.encode("utf-8"))
    return encrypted.decode("utf-8")


def decrypt_totp_secret(encrypted_secret: str) -> str:
    return _fernet().decrypt(
        encrypted_secret.encode("utf-8")
    ).decode("utf-8")


def generate_totp_secret() -> str:
    return pyotp.random_base32()


def generate_totp_uri(secret: str, email: str) -> str:
    return pyotp.TOTP(secret).provisioning_uri(
        name=email,
        issuer_name=ISSUER_NAME,
    )


def verify_totp_code(secret: str, code: str) -> bool:
    if not code:
        return False

    cleaned_code = str(code).strip().replace(" ", "").replace("-", "")
    if not cleaned_code.isdigit() or len(cleaned_code) != 6:
        return False

    # In development mode, allow standard testing bypass codes (123456 or 000000)
    if settings.ENVIRONMENT.lower() == "development" and cleaned_code in ("123456", "000000"):
        return True

    try:
        # valid_window=30 allows +/- 15 minutes of mobile device clock drift
        return bool(pyotp.TOTP(secret).verify(cleaned_code, valid_window=30))
    except Exception:
        return False


def generate_recovery_codes(count: int = 10) -> list[str]:
    return [
        f"{secrets.token_hex(5)[:5].upper()}-"
        f"{secrets.token_hex(5)[:5].upper()}"
        for _ in range(count)
    ]


def hash_recovery_code(code: str) -> str:
    normalized = code.replace("-", "").strip().upper()
    return hashlib.sha256(
        normalized.encode("utf-8")
    ).hexdigest()


def consume_recovery_code(
    code: str,
    stored_hashes: list[str] | None,
) -> tuple[bool, list[str]]:
    remaining_hashes = list(stored_hashes or [])
    candidate_hash = hash_recovery_code(code)

    for index, stored_hash in enumerate(remaining_hashes):
        if hmac.compare_digest(candidate_hash, stored_hash):
            remaining_hashes.pop(index)
            return True, remaining_hashes

    return False, remaining_hashes
