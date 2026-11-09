from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.core.platform_rbac import require_platform_permission
from app.database.connection import SessionLocal
from app.models.tenant import Tenant
from app.schemas.tenant import TenantCreate, TenantResponse


router = APIRouter(
    prefix="/api/v1/tenants",
    tags=["Tenants"],
)


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


@router.post(
    "/",
    response_model=TenantResponse,
    dependencies=[Depends(require_platform_permission("platform.tenants.manage"))],
)
def create_tenant(
    tenant: TenantCreate,
    db: Session = Depends(get_db),
):
    cleaned_name = (tenant.name or "").strip()
    if len(cleaned_name) < 2:
        raise HTTPException(status_code=422, detail="Tenant name must be at least 2 characters.")
    if db.query(Tenant).filter(func.lower(Tenant.name) == cleaned_name.lower()).first():
        raise HTTPException(status_code=409, detail="A tenant with this name already exists.")

    from app.services.subscription_service import provision_tenant_global_free_trial

    new_tenant = Tenant(
        name=cleaned_name,
        industry=getattr(tenant, "industry", None) or "Software Services",
        status="Trial",
        is_platform=False,
    )

    db.add(new_tenant)
    db.flush()
    provision_tenant_global_free_trial(db, new_tenant)
    db.commit()
    db.refresh(new_tenant)

    return new_tenant