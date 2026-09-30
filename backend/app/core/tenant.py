from fastapi import Depends, HTTPException, status

from app.core.dependencies import get_current_user


def get_current_tenant(
    current_user: dict = Depends(get_current_user)
):
    tenant_id = current_user.get("tenant_id")

    if not tenant_id:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Tenant information missing"
        )

    return tenant_id