from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session

from app.core.security import decode_access_token
from app.database.connection import SessionLocal
from app.models.user import User


security = HTTPBearer()


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    payload = decode_access_token(credentials.credentials)

    user_id = payload.get("user_id")
    tenant_id = payload.get("tenant_id")
    role = payload.get("role")

    if not user_id or not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token data"
        )

    try:
        user_uuid = UUID(str(user_id))
        tenant_uuid = UUID(str(tenant_id))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token identifiers"
        )

    user = db.query(User).filter(
        User.id == user_uuid,
        User.tenant_id == tenant_uuid
    ).first()

    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found"
        )

    return {
        "user_id": str(user.id),
    "tenant_id": str(user.tenant_id),
    "role": role,
    "status": user.status,
    "must_change_password": user.must_change_password,
    "profile_completed": user.profile_completed,
    "token_purpose": payload.get("purpose", "access")
    }


def require_active_user(current_user: dict = Depends(get_current_user)):
    if current_user["token_purpose"] == "onboarding":
        raise HTTPException(
            status_code=403,
            detail="Please log in again after completing onboarding"
        )

    if current_user["status"] != "Active":
        raise HTTPException(
            status_code=403,
            detail="Complete onboarding before accessing CRM modules"
        )

    if current_user["must_change_password"]:
        raise HTTPException(
            status_code=403,
            detail="Change your password before continuing"
        )

    if not current_user["profile_completed"]:
        raise HTTPException(
            status_code=403,
            detail="Complete your profile before continuing"
        )

    return current_user