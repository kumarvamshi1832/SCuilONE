from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from uuid import UUID
from app.database.connection import SessionLocal
from app.core.dependencies import get_current_user
from app.core.security import hash_password
from app.models.user import User
from app.models.role import Role
from app.models.user_role import UserRole
from app.schemas.user import UserCreate, UserUpdate
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session


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


@router.post("/")
def create_user(
    data: UserCreate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

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
        tenant_id=tenant_id,
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
            "role": role.name
        }
    }

@router.get("/")
def get_users(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    users = db.query(User).filter(
        User.tenant_id == tenant_id
    ).all()

    result = []

    for user in users:
        user_role = db.query(UserRole).filter(
            UserRole.user_id == user.id
        ).first()

        role_name = None

        if user_role:
            role = db.query(Role).filter(
                Role.id == user_role.role_id
            ).first()

            if role:
                role_name = role.name

        result.append({
            "id": str(user.id),
            "full_name": user.full_name,
            "email": user.email,
            "tenant_id": str(user.tenant_id),
            "role": role_name,
            "status": user.status,
            "created_at": user.created_at
        })

    return result

@router.get("/roles")
def get_roles(
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    roles = db.query(Role).all()

    return [
        role.name
        for role in roles
    ]


@router.get("/{user_id}")
def get_user(
    user_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == tenant_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    user_role = db.query(UserRole).filter(
        UserRole.user_id == user.id
    ).first()

    role_name = None

    if user_role:
        role = db.query(Role).filter(
            Role.id == user_role.role_id
        ).first()

        if role:
            role_name = role.name

    return {
        "id": str(user.id),
        "full_name": user.full_name,
        "email": user.email,
        "tenant_id": str(user.tenant_id),
        "role": role_name
    }

@router.put("/{user_id}")
def update_user(
    user_id: UUID,
    data: UserUpdate,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == tenant_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    role = db.query(Role).filter(
        Role.name == data.role
    ).first()

    if not role:
        raise HTTPException(
            status_code=400,
            detail="Role not found"
        )

    user.status = data.status

    user_role = db.query(UserRole).filter(
        UserRole.user_id == user.id
    ).first()

    if user_role:
        user_role.role_id = role.id
    else:
        user_role = UserRole(
            user_id=user.id,
            role_id=role.id
        )
        db.add(user_role)

    db.commit()
    db.refresh(user)

    return {
        "id": str(user.id),
        "full_name": user.full_name,
        "email": user.email,
        "tenant_id": str(user.tenant_id),
        "role": role.name,
        "status": user.status
    }

@router.delete("/{user_id}")
def delete_user(
    user_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    tenant_id = current_user["tenant_id"]

    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == tenant_id
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    user.status = "Inactive"

    db.commit()
    db.refresh(user)

    return {
        "message": "User deactivated successfully",
        "id": str(user.id),
        "status": user.status
    }