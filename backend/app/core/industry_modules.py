
from copy import deepcopy
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_active_user
from app.database.connection import SessionLocal
from app.models.tenant import Tenant
from app.models.industry_pack import IndustryPack
from app.models.tenant_industry_config import TenantIndustryConfig


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def classify_industry(value: str) -> str:
    normalized = " ".join(
        value.strip()
        .lower()
        .replace("_", " ")
        .replace("-", " ")
        .split()
    )

    if "software" in normalized or "it consulting" in normalized:
        return "software"

    if "real estate" in normalized:
        return "real_estate"

    return "other"


def require_enabled_module(module_key: str):
    def check_module(
        current_user: dict = Depends(require_active_user),
        db: Session = Depends(get_db),
    ):
        try:
            tenant_id = UUID(str(current_user["tenant_id"]))
        except (KeyError, ValueError, TypeError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid tenant identifier.",
            )

        tenant = (
            db.query(Tenant)
            .filter(Tenant.id == tenant_id)
            .first()
        )

        if tenant is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Tenant not found.",
            )

        industry_key = classify_industry(tenant.industry or "")

        pack = (
            db.query(IndustryPack)
            .filter(
                IndustryPack.pack_key == industry_key,
                IndustryPack.is_active.is_(True),
            )
            .first()
        )

        if pack is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="No active Industry Pack is available for this tenant.",
            )

        tenant_config = (
            db.query(TenantIndustryConfig)
            .filter(TenantIndustryConfig.tenant_id == tenant.id)
            .first()
        )

        if (
            tenant_config is not None
            and tenant_config.industry_pack_id != pack.id
        ):
            tenant_config = None

        defaults = deepcopy(pack.default_config or {})
        overrides = (
            deepcopy(tenant_config.overrides or {})
            if tenant_config
            else {}
        )

        effective_config = {**defaults, **overrides}
        enabled_modules = effective_config.get("enabled_modules")

        if not isinstance(enabled_modules, list):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Module configuration is invalid.",
            )

        if module_key not in enabled_modules:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=(
                    f"The '{module_key}' module is disabled "
                    "for this tenant."
                ),
            )

        return True

    return check_module
