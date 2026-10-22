import re
import string

from fastapi import HTTPException


MIN_PASSWORD_LENGTH = 15
MAX_PASSWORD_LENGTH = 128

COMMON_PASSWORDS = {
    "password",
    "password123",
    "password1234",
    "password@123",
    "password@1234",
    "admin",
    "admin123",
    "qwerty",
    "qwerty123",
    "welcome",
    "welcome123",
    "letmein",
    "iloveyou",
    "abc123",
    "123456",
    "12345678",
    "123456789",
    "changeme",
    "passw0rd",
}


def validate_password(
    password: str,
    identifiers: list[str] | None = None,
) -> None:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValueError(
            f"Password must contain at least "
            f"{MIN_PASSWORD_LENGTH} characters"
        )

    if len(password) > MAX_PASSWORD_LENGTH:
        raise ValueError(
            f"Password cannot exceed {MAX_PASSWORD_LENGTH} characters"
        )

    if not re.search(r"[A-Z]", password):
        raise ValueError(
            "Password must contain at least one uppercase letter"
        )

    if not re.search(r"[a-z]", password):
        raise ValueError(
            "Password must contain at least one lowercase letter"
        )

    if not re.search(r"[0-9]", password):
        raise ValueError(
            "Password must contain at least one number"
        )

    if not any(char in string.punctuation for char in password):
        raise ValueError(
            "Password must contain at least one special character"
        )

    normalized = re.sub(r"[^a-z0-9]", "", password.lower())

    if normalized in COMMON_PASSWORDS:
        raise ValueError("This password is too common")

    if any(
        normalized.startswith(common)
        and normalized[len(common):].isdigit()
        for common in COMMON_PASSWORDS
    ):
        raise ValueError(
            "Avoid common passwords and predictable number variations"
        )

    alphabet = string.ascii_lowercase
    digits = string.digits

    for sequence in (alphabet, alphabet[::-1], digits, digits[::-1]):
        for index in range(len(sequence) - 2):
            if sequence[index:index + 3] in normalized:
                raise ValueError(
                    "Password cannot contain sequential letters "
                    "or numbers such as abc, cba, 123 or 321"
                )

    if re.search(r"(.)\1{3,}", password, re.IGNORECASE):
        raise ValueError(
            "Password cannot contain four or more repeated characters"
        )

    for identifier in identifiers or []:
        if not identifier:
            continue

        value = identifier.strip().lower()

        if "@" in value:
            value = value.split("@", 1)[0]

        value = re.sub(r"[^a-z0-9]", "", value)

        if len(value) >= 4 and value in normalized:
            raise ValueError(
                "Password cannot contain your email username "
                "or company/name identifier"
            )


def ensure_password_policy(
    password: str,
    identifiers: list[str] | None = None,
) -> None:
    try:
        validate_password(password, identifiers)
    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail=str(exc),
        ) from exc
