"""Helpers for permission checks that depend on request data (e.g. the entity in the URL)."""
from uuid import UUID

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from app.models.permission import Permission
from app.models.role_permission import RolePermission
from app.models.user_role import UserRole


def user_has_permission(db: Session, current_user: dict, permission_name: str) -> bool:
    user_id = UUID(str(current_user["user_id"]))
    permission = db.query(Permission).filter(Permission.name == permission_name).first()
    if not permission:
        return False
    return (
        db.query(UserRole)
        .join(RolePermission, RolePermission.role_id == UserRole.role_id)
        .filter(UserRole.user_id == user_id, RolePermission.permission_id == permission.id)
        .first()
        is not None
    )


def require_permission_for(db: Session, current_user: dict, permission_name: str) -> None:
    if not user_has_permission(db, current_user, permission_name):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action",
        )
