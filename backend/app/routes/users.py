import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.core.dependencies import get_current_user
from app.core.security import hash_password
from app.models.user import User
from app.models.role import Role
from app.models.user_role import UserRole
from app.schemas.user import UserCreate, UserUpdate

router = APIRouter(
    prefix="/api/v1/users",
    tags=["Users"]
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def parse_uuid(val: str, field_name: str = "ID") -> uuid.UUID:
    if isinstance(val, uuid.UUID):
        return val
    try:
        return uuid.UUID(str(val))
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {field_name} UUID format")


@router.get("/")
def get_users(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tenant_uuid = parse_uuid(current_user["tenant_id"], "tenant")

    users_with_roles = db.query(User, Role.name).outerjoin(
        UserRole, User.id == UserRole.user_id
    ).outerjoin(
        Role, UserRole.role_id == Role.id
    ).filter(
        User.tenant_id == tenant_uuid
    ).all()

    result = []
    for user, role_name in users_with_roles:
        result.append({
            "id": str(user.id),
            "full_name": user.full_name,
            "email": user.email,
            "tenant_id": str(user.tenant_id),
            "role": role_name or "User",
            "status": "Active"
        })

    return result


@router.get("/roles")
def get_roles(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    roles = db.query(Role).all()
    return [role.name for role in roles if role.name not in ["Platform Super Admin", "Platform Support"]]


@router.post("/")
def create_user(
    data: UserCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tenant_uuid = parse_uuid(current_user["tenant_id"], "tenant")

    existing_user = db.query(User).filter(
        User.email == data.email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )

    role = db.query(Role).filter(
        Role.name == data.role
    ).first()

    if not role:
        raise HTTPException(
            status_code=400,
            detail="Role not found"
        )

    new_user = User(
        tenant_id=tenant_uuid,
        full_name=data.full_name,
        email=data.email,
        password=hash_password(data.password)
    )

    db.add(new_user)
    db.flush()

    user_role = UserRole(
        user_id=new_user.id,
        role_id=role.id
    )

    db.add(user_role)

    db.commit()
    db.refresh(new_user)

    return {
        "message": "User created successfully",
        "user": {
            "id": str(new_user.id),
            "full_name": new_user.full_name,
            "email": new_user.email,
            "tenant_id": str(new_user.tenant_id),
            "role": role.name,
            "status": "Active"
        }
    }


@router.get("/{user_id}")
def get_user_by_id(
    user_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_uuid = parse_uuid(user_id, "user")
    tenant_uuid = parse_uuid(current_user["tenant_id"], "tenant")

    user_with_role = db.query(User, Role.name).outerjoin(
        UserRole, User.id == UserRole.user_id
    ).outerjoin(
        Role, UserRole.role_id == Role.id
    ).filter(
        User.id == user_uuid,
        User.tenant_id == tenant_uuid
    ).first()

    if not user_with_role:
        raise HTTPException(status_code=404, detail="User not found")

    user, role_name = user_with_role

    return {
        "id": str(user.id),
        "full_name": user.full_name,
        "email": user.email,
        "tenant_id": str(user.tenant_id),
        "role": role_name or "User",
        "status": "Active"
    }


@router.put("/{user_id}")
def update_user_role(
    user_id: str,
    data: UserUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_uuid = parse_uuid(user_id, "user")
    tenant_uuid = parse_uuid(current_user["tenant_id"], "tenant")

    user = db.query(User).filter(
        User.id == user_uuid,
        User.tenant_id == tenant_uuid
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    role = db.query(Role).filter(
        Role.name == data.role
    ).first()

    if not role:
        raise HTTPException(status_code=400, detail="Role not found")

    user_role = db.query(UserRole).filter(
        UserRole.user_id == user.id
    ).first()

    if user_role:
        user_role.role_id = role.id
    else:
        user_role = UserRole(user_id=user.id, role_id=role.id)
        db.add(user_role)

    db.commit()

    return {
        "id": str(user.id),
        "full_name": user.full_name,
        "email": user.email,
        "tenant_id": str(user.tenant_id),
        "role": role.name,
        "status": data.status or "Active",
        "message": "User updated successfully"
    }


@router.delete("/{user_id}")
def delete_user(
    user_id: str,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_uuid = parse_uuid(user_id, "user")
    tenant_uuid = parse_uuid(current_user["tenant_id"], "tenant")

    user = db.query(User).filter(
        User.id == user_uuid,
        User.tenant_id == tenant_uuid
    ).first()

    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    db.query(UserRole).filter(UserRole.user_id == user.id).delete()
    db.delete(user)
    db.commit()

    return {"message": "User deleted successfully"}