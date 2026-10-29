from uuid import UUID

from fastapi import Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.models.user_role import UserRole
from app.models.role_permission import RolePermission
from app.models.permission import Permission


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def require_permission(permission_name: str):
    def permission_checker(
        current_user: dict = Depends(require_active_user),
        db: Session = Depends(get_db)
    ):
        user_id = UUID(str(current_user["user_id"]))

        permission = (
            db.query(Permission)
            .filter(Permission.name == permission_name)
            .first()
        )

        if not permission:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Permission not found"
            )

        has_permission = (
            db.query(UserRole)
            .join(
                RolePermission,
                RolePermission.role_id == UserRole.role_id
            )
            .filter(
                UserRole.user_id == user_id,
                RolePermission.permission_id == permission.id
            )
            .first()
        )

        if not has_permission:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You do not have permission to perform this action"
            )

        return True

    return permission_checker