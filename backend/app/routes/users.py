from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal
from app.core.dependencies import get_current_user
from app.core.security import hash_password
from app.models.user import User
from app.models.role import Role
from app.models.user_role import UserRole
from app.schemas.user import UserCreate


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