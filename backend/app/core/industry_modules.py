from copy import deepcopy
from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_active_user
from app.database.connection import SessionLocal
from app.models.tenant import Tenant
from app.models.industry_pack import IndustryPack
from app.models.tenant_industry_config import TenantIndustryConfig
from app.services.subscription_service import (
    enforce_subscription_crm_access,
    get_effective_plan_resources,
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def classify_industry(value: str) -> str:
    from app.core.industry_registry import normalize_industry_key, INDUSTRY_REGISTRY
    key = normalize_industry_key(value)
    if key not in INDUSTRY_REGISTRY:
        # Preserve unsupported historical values rather than silently assigning an unrelated pack.
        return key or "unmapped"
    return INDUSTRY_REGISTRY[key]["module_pack_key"]


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

        # PART 6 & PART 11 – Ensure subscription/trial is active before allowing any CRM business module
        sub = enforce_subscription_crm_access(db, tenant_id)
        if sub is not None:
            plan_resources = get_effective_plan_resources(db, tenant_id)
            if not plan_resources.get("crm_access_allowed"):
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=plan_resources.get(
                        "reason",
                        "Subscription is not active. Please subscribe to access CRM modules.",
                    ),
                )
            plan_enabled_modules = plan_resources.get("enabled_modules")
            if isinstance(plan_enabled_modules, list) and plan_enabled_modules and module_key not in plan_enabled_modules:
                raise HTTPException(
                    status_code=status.HTTP_403_FORBIDDEN,
                    detail=f"The '{module_key}' module is not included in your current subscription plan.",
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
