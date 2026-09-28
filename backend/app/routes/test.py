from fastapi import APIRouter, Depends

from app.core.dependencies import get_current_user


router = APIRouter(
    prefix="/api/v1/test",
    tags=["Test"]
)


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