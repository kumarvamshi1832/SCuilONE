"""Authentication and authorization dependencies for Real Estate Companies and Global Agencies
(both Free External agencies and Paid Registered agency tenants).
"""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.orm import Session

from app.core.dependencies import get_db, require_active_user
from app.core.security import create_access_token, decode_access_token
from app.models.agency import Agency, AgencyMember, AgencySession
from app.models.tenant import Tenant

_bearer = HTTPBearer(auto_error=False)
AGENCY_SESSION_EXPIRE_DAYS = 7


def _utc_now() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def hash_token(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def create_free_agency_tokens(db: Session, agency: Agency, member: AgencyMember) -> dict:
    """Create JWT access token (portal_type='agency_external') and rotating AgencySession."""
    raw_refresh = secrets.token_urlsafe(48)
    now = _utc_now()
    expires_at = now + timedelta(days=AGENCY_SESSION_EXPIRE_DAYS)
    session = AgencySession(
        agency_id=agency.id,
        agency_member_id=member.id,
        token_hash=hash_token(raw_refresh),
        expires_at=expires_at,
        revoked=False,
        created_at=now,
    )
    db.add(session)
    db.flush()

    access_token = create_access_token({
        "portal_type": "agency_external",
        "token_type": "access",
        "agency_id": str(agency.id),
        "agency_member_id": str(member.id),
        "role": member.role,
        "sid": str(session.id),
    })
    return {
        "access_token": access_token,
        "refresh_token": raw_refresh,
        "refresh_token_expires_at": expires_at.isoformat(),
        "token_type": "bearer",
    }


def require_real_estate_company(
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
) -> dict:
    """Ensure the authenticated staff user belongs to a Real Estate Company tenant."""
    tenant_id = UUID(str(current_user["tenant_id"]))
    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found.")
    if tenant.business_type != "real_estate_company":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This action is restricted to Real Estate Company accounts.",
        )
    return {
        **current_user,
        "tenant_uuid": tenant.id,
        "user_uuid": UUID(str(current_user["user_id"])),
        "business_type": tenant.business_type,
    }


def require_agency_actor(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer),
    db: Session = Depends(get_db),
) -> dict:
    """Authenticate either a Free External Agency member OR a Paid Real Estate Agency staff user.

    Returns a normalized agency actor context:
    {
        "agency_id": UUID,
        "agency_code": str,
        "operating_mode": "free_external" | "paid_tenant",
        "tenant_id": UUID | None,
        "actor_id": UUID,
        "agency_member_id": UUID | None,
        "email": str,
        "role": str,
    }
    """
    if credentials is None or not credentials.credentials:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Agency authentication required.")

    payload = decode_access_token(credentials.credentials)

    # Path A: Free External Agency token (portal_type == 'agency_external')
    if payload.get("portal_type") == "agency_external":
        if payload.get("token_type") != "access":
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid agency access token.")
        try:
            agency_id = UUID(str(payload["agency_id"]))
            member_id = UUID(str(payload["agency_member_id"]))
            session_id = UUID(str(payload["sid"]))
        except (KeyError, ValueError, TypeError):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid agency token identifiers.")

        now = _utc_now()
        session = (
            db.query(AgencySession)
            .filter(
                AgencySession.id == session_id,
                AgencySession.agency_id == agency_id,
                AgencySession.agency_member_id == member_id,
                AgencySession.revoked.is_(False),
                AgencySession.expires_at > now,
            )
            .first()
        )
        if not session:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Agency session expired or revoked.")

        agency = db.query(Agency).filter(Agency.id == agency_id).first()
        member = (
            db.query(AgencyMember)
            .filter(AgencyMember.id == member_id, AgencyMember.agency_id == agency_id)
            .first()
        )
        if not agency or agency.status != "Active" or not member or member.status != "Active":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Agency account is not active.")

        return {
            "agency_id": agency.id,
            "agency_code": agency.agency_code,
            "operating_mode": agency.operating_mode,
            "tenant_id": agency.tenant_id,
            "actor_id": member.id,
            "agency_member_id": member.id,
            "email": member.email,
            "role": member.role,
        }

    # Path B: Paid Real Estate Agency staff JWT (standard staff token, no portal_type)
    if payload.get("portal_type"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only Real Estate Agency accounts may access this endpoint.",
        )

    try:
        user_id = UUID(str(payload["user_id"]))
        tenant_id = UUID(str(payload["tenant_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid staff token.")

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if not tenant or tenant.status not in ("Active", "Trial"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Tenant account is not active.")
    if tenant.business_type != "real_estate_agency":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is restricted to Real Estate Agency accounts.",
        )

    agency = db.query(Agency).filter(Agency.tenant_id == tenant.id).first()
    if not agency or agency.status != "Active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Linked agency profile is not active.")

    member = (
        db.query(AgencyMember)
        .filter(AgencyMember.agency_id == agency.id, AgencyMember.user_id == user_id)
        .first()
    )
    return {
        "agency_id": agency.id,
        "agency_code": agency.agency_code,
        "operating_mode": agency.operating_mode,
        "tenant_id": tenant.id,
        "actor_id": user_id,
        "agency_member_id": member.id if member else None,
        "email": member.email if member else agency.verified_email,
        "role": member.role if member else "agency_agent",
    }


def require_paid_agency(agency_ctx: dict = Depends(require_agency_actor)) -> dict:
    """Block free external agencies from paid-only independent agency capabilities."""
    if agency_ctx.get("operating_mode") != "paid_tenant" or not agency_ctx.get("tenant_id"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This capability requires a paid SCuilONE Real Estate Agency subscription.",
        )
    return agency_ctx
