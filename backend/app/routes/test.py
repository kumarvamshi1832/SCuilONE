from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from app.core.dependencies import get_current_user
from app.core.tenant import get_current_tenant
from app.database.connection import SessionLocal
from app.models.user import User


router = APIRouter(
    prefix="/api/v1/test",
    tags=["Test"]
)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()



@router.get("/tenant")
def get_my_tenant(
    current_user: dict = Depends(get_current_user)
):
    return {
        "message": "Tenant identified successfully",
        "user_id": current_user["user_id"],
        "tenant_id": current_user["tenant_id"],
        "role": current_user["role"]
    }

from fastapi import APIRouter, Depends

from app.core.permissions import require_permission

router = APIRouter(
    prefix="/api/v1/test",
    tags=["Test"]
)


@router.get("/lead-view")
def test_lead_view(
    permission=Depends(require_permission("lead.view"))
):
    return {
        "message": "You have permission to view leads"
    }


@router.post("/lead-create")
def test_lead_create(
    permission=Depends(require_permission("lead.create"))
):
    return {
        "message": "You have permission to create leads"
    }


@router.get("/tenant")
def test_tenant(
    tenant_id=Depends(get_current_tenant)
):
    return {
        "message": "Tenant identified successfully",
        "tenant_id": str(tenant_id)
    }


@router.get("/tenant-users")
def test_tenant_users(
    tenant_id=Depends(get_current_tenant),
    db: Session = Depends(get_db)
):
    users = db.query(User).filter(
        User.tenant_id == tenant_id
    ).all()

    return {
        "tenant_id": str(tenant_id),
        "users": [
            {
                "id": str(user.id),
                "full_name": user.full_name,
                "email": user.email,
                "tenant_id": str(user.tenant_id)
            }
            for user in users
        ]
    }