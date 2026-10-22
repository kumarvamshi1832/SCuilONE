
import hashlib
import secrets
import hmac
from urllib.parse import quote

import pyotp
from cryptography.fernet import Fernet

from app.database.connection import settings


ISSUER_NAME = "SCuilONE"


def _fernet() -> Fernet:
    return Fernet(settings.MFA_ENCRYPTION_KEY.encode("utf-8"))


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
    account_name = quote(email, safe="")
    issuer = quote(ISSUER_NAME, safe="")

    return (
        f"otpauth://totp/{issuer}:{account_name}"
        f"?secret={secret}&issuer={issuer}"
        "&algorithm=SHA1&digits=6&period=30"
    )


def verify_totp_code(secret: str, code: str) -> bool:
    if not code or not code.isdigit() or len(code) != 6:
        return False

    return pyotp.TOTP(secret).verify(
        code,
        valid_window=1,
    )


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
