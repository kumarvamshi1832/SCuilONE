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


def require_any_permission(*permission_names: str):
    def permission_checker(
        current_user: dict = Depends(require_active_user),
        db: Session = Depends(get_db)
    ):
        user_id = UUID(str(current_user["user_id"]))

        user_perms = (
            db.query(Permission.name)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(UserRole, UserRole.role_id == RolePermission.role_id)
            .filter(UserRole.user_id == user_id)
            .all()
        )
        user_perm_set = {p[0].lower() for p in user_perms}

        for p_name in permission_names:
            if p_name.lower() in user_perm_set:
                return True

        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="You do not have permission to perform this action"
        )

    return permission_checker


def check_is_team_lead(current_user: dict, db: Session) -> bool:
    role_str = (current_user.get("role") or "").upper()
    team_lead_roles = ("OWNER", "ADMIN", "MANAGER", "AUDITOR", "READ_ONLY", "READ-ONLY")
    if any(r in role_str for r in team_lead_roles):
        return True

    user_id = UUID(str(current_user["user_id"]))
    from app.models.role import Role
    user_roles = (
        db.query(Role)
        .join(UserRole, UserRole.role_id == Role.id)
        .filter(UserRole.user_id == user_id)
        .all()
    )
    for r in user_roles:
        r_name = r.name.upper()
        if any(lead_role in r_name for lead_role in team_lead_roles):
            return True

    return False