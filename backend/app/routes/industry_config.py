from copy import deepcopy
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.core.dependencies import require_active_user
from app.database.connection import SessionLocal
from app.models.tenant import Tenant
from app.models.industry_pack import IndustryPack
from app.models.tenant_industry_config import TenantIndustryConfig
from app.schemas.industry_config import IndustryConfigUpdate
from app.core.permissions import require_permission
from app.services.audit_service import log_audit

router = APIRouter(prefix="/api/v1/industry", tags=["Industry Configuration"])

COMMON_MODULES = [
    {"key": "leads", "label": "Leads", "endpoint": "/api/v1/leads"},
    {"key": "contacts", "label": "Contacts", "endpoint": "/api/v1/contacts"},
    {"key": "accounts", "label": "Accounts", "endpoint": "/api/v1/accounts"},
    {"key": "deals", "label": "Deals", "endpoint": "/api/v1/deals"},
    {"key": "activities", "label": "Activities & Tasks", "endpoint": "/api/v1/activities"},
]
SOFTWARE_MODULES = [
    {"key": "software_requirements", "label": "Software Requirements", "endpoint": "/api/v1/software-requirements"},
    {"key": "software_estimates", "label": "Software Estimates", "endpoint": "/api/v1/software-estimates"},
    {"key": "software_contracts", "label": "Software Contracts", "endpoint": "/api/v1/software-contracts"},
    {"key": "software_projects", "label": "Software Projects", "endpoint": "/api/v1/software-projects"},
    {"key": "software_sprints", "label": "Software Sprints", "endpoint": "/api/v1/software-sprints"},
]

REAL_ESTATE_MODULES = [
    {"key": "properties", "label": "Properties", "endpoint": "/api/v1/properties", "api_available": False},
    {"key": "buildings", "label": "Buildings", "endpoint": "/api/v1/buildings", "api_available": False},
    {"key": "real_estate_projects", "label": "Projects", "endpoint": "/api/v1/projects", "api_available": False},
    {"key": "buyer_requirements", "label": "Buyer Requirements", "endpoint": "/api/v1/buyer-requirements", "api_available": False},
    {"key": "property_matches", "label": "Property Matches", "endpoint": "/api/v1/property-matches", "api_available": False},
    {"key": "site_visits", "label": "Site Visits", "endpoint": "/api/v1/site-visits", "api_available": False},
    {"key": "bookings", "label": "Bookings", "endpoint": "/api/v1/bookings", "api_available": False},
]


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def classify_industry(value: str) -> str:
    normalized = " ".join(value.strip().lower().replace("_", " ").replace("-", " ").split())
    if "software" in normalized or "it consulting" in normalized:
        return "software"
    if "real estate" in normalized:
        return "real_estate"
    return "other"


@router.get("/config")
def get_industry_config(
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    """Return module configuration for the authenticated tenant's industry."""
    try:
        tenant_id = UUID(str(current_user["tenant_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid tenant identifier in authenticated user context.")

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found.")

    industry_key = classify_industry(tenant.industry or "")
    modules = [
        {**module, "industry_specific": False, "api_available": True}
        for module in COMMON_MODULES
    ]
    if industry_key == "software":
        modules.extend({**module, "industry_specific": True, "api_available": True} for module in SOFTWARE_MODULES)
        related_activity_modules = ["software_project", "software_sprint"]
    elif industry_key == "real_estate":
        modules.extend({**module, "industry_specific": True} for module in REAL_ESTATE_MODULES)
        related_activity_modules = ["property", "building", "real_estate_project", "buyer_requirement", "property_match", "site_visit", "booking"]
    else:
        related_activity_modules = []

    pack = db.query(IndustryPack).filter(
        IndustryPack.pack_key == industry_key,
        IndustryPack.is_active.is_(True),
    ).first() if industry_key != "other" else None
    tenant_config = db.query(TenantIndustryConfig).filter(
        TenantIndustryConfig.tenant_id == tenant.id
    ).first() if pack else None
    if tenant_config and tenant_config.industry_pack_id != pack.id:
        tenant_config = None

    defaults = deepcopy(pack.default_config or {}) if pack else {}
    overrides = deepcopy(tenant_config.overrides or {}) if tenant_config else {}
    effective = {**defaults, **overrides}
    available_keys = {module["key"] for module in modules}
    enabled = effective.get("enabled_modules")
    if not isinstance(enabled, list):
        enabled = list(available_keys)
    enabled_set = set(enabled) & available_keys
    modules = [{**module, "enabled": module["key"] in enabled_set} for module in modules]

    return {
        "tenant_id": str(tenant.id),
        "tenant_name": tenant.name,
        "industry": tenant.industry,
        "industry_key": industry_key,
        "common_modules": modules[:len(COMMON_MODULES)],
        "industry_modules": modules[len(COMMON_MODULES):],
        "modules": modules,
        "related_activity_modules": related_activity_modules,
        "industry_pack": {"key": pack.pack_key, "name": pack.name, "version": pack.version} if pack else None,
        "enabled_modules": sorted(enabled_set),
        "configuration": effective,
        "configuration_overrides": overrides,
    }


@router.get("/packs")
def list_industry_packs(
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    packs = db.query(IndustryPack).filter(IndustryPack.is_active.is_(True)).order_by(IndustryPack.name).all()
    return {"items": [{
        "key": pack.pack_key,
        "name": pack.name,
        "description": pack.description,
        "version": pack.version,
        "default_config": pack.default_config,
    } for pack in packs]}


@router.patch("/config", dependencies=[Depends(require_permission("industry_config.update"))])
def update_industry_config(
    payload: IndustryConfigUpdate,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    try:
        tenant_id = UUID(str(current_user["tenant_id"]))
        user_id = UUID(str(current_user["user_id"]))
    except (KeyError, ValueError, TypeError):
        raise HTTPException(status_code=401, detail="Invalid authenticated user context.")

    tenant = db.query(Tenant).filter(Tenant.id == tenant_id).first()
    if tenant is None:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    industry_key = classify_industry(tenant.industry or "")
    pack = db.query(IndustryPack).filter(
        IndustryPack.pack_key == industry_key,
        IndustryPack.is_active.is_(True),
    ).first()
    if pack is None:
        raise HTTPException(status_code=400, detail="No configurable industry pack is available for this tenant's industry.")

    changes = payload.model_dump(exclude_unset=True)
    if not changes:
        raise HTTPException(status_code=400, detail="Provide at least one configuration field to update.")

    available_modules = set(COMMON_MODULES[i]["key"] for i in range(len(COMMON_MODULES)))
    if industry_key == "software":
        available_modules.update(item["key"] for item in SOFTWARE_MODULES)
    elif industry_key == "real_estate":
        available_modules.update(item["key"] for item in REAL_ESTATE_MODULES)
    if changes.get("enabled_modules") is not None:
        unknown = set(changes["enabled_modules"]) - available_modules
        if unknown:
            raise HTTPException(status_code=422, detail={"message": "Modules do not belong to this industry pack.", "unknown_modules": sorted(unknown)})
    defaults = pack.default_config or {}
    for field_name in ("dashboard_widgets", "report_widgets"):
        if changes.get(field_name) is not None:
            allowed_widgets = set(defaults.get(field_name, []))
            unknown_widgets = set(changes[field_name]) - allowed_widgets
            if unknown_widgets:
                raise HTTPException(
                    status_code=422,
                    detail={"message": f"Unknown {field_name.replace('_', ' ')} for this industry pack.", "unknown_widgets": sorted(unknown_widgets)},
                )

    config = db.query(TenantIndustryConfig).filter(TenantIndustryConfig.tenant_id == tenant.id).first()
    if config and config.industry_pack_id != pack.id:
        config = None
    if config is None:
        config = TenantIndustryConfig(tenant_id=tenant.id, industry_pack_id=pack.id, overrides={})
        db.add(config)
        db.flush()

    before = deepcopy(config.overrides or {})
    after = deepcopy(before)
    for key, value in changes.items():
        if value is None:
            after.pop(key, None)
        else:
            after[key] = value
    config.overrides = after
    config.updated_by = user_id
    log_audit(
        db=db, tenant_id=tenant.id, user_id=user_id, action="update",
        module="industry_config", record_id=config.id,
        description=f"Updated {pack.name} tenant configuration",
        before_data=before, after_data=after,
    )
    db.commit()
    db.refresh(config)
    return {
        "message": "Industry configuration updated successfully.",
        "tenant_id": str(tenant.id),
        "industry_pack": {"key": pack.pack_key, "name": pack.name, "version": pack.version},
        "configuration": {**(pack.default_config or {}), **(config.overrides or {})},
        "configuration_overrides": config.overrides,
        "updated_at": config.updated_at.isoformat() if config.updated_at else None,
    }
