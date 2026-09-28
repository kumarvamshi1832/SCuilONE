from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.models.tenant import Tenant
from app.schemas.tenant import TenantCreate, TenantResponse


router = APIRouter(
    prefix="/api/v1/tenants",
    tags=["Tenants"]
)


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()


@router.post("/", response_model=TenantResponse)
def create_tenant(
    tenant: TenantCreate,
    db: Session = Depends(get_db)
):
    new_tenant = Tenant(
        name=tenant.name
    )

    db.add(new_tenant)
    db.commit()
    db.refresh(new_tenant)

    return new_tenant