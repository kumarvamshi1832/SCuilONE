import io

from fastapi import UploadFile, File
from PIL import Image, UnidentifiedImageError

from app.core.cloudinary_config import cloudinary

import hashlib
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from uuid import UUID
from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user
from app.core.permissions import require_permission
from app.core.security import hash_password, verify_password

from app.models.user import User
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.user_invitation import UserInvitation

from app.schemas.user import (
    UserCreate,
    UserUpdate,
    UserProfileUpdate,
    ChangePasswordRequest,
)

from app.services.email_service import send_user_invitation_email


router = APIRouter(
    prefix="/api/v1/users",
    tags=["Users"],
)


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("user.create")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(current_user["tenant_id"])
    email = str(data.email).lower().strip()

    existing_user = db.query(User).filter(
        User.email == email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered",
        )

    role = db.query(Role).filter(
        Role.name == data.role
    ).first()

    if not role:
        raise HTTPException(
            status_code=400,
            detail="Role not found",
        )

    invitation_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(
        invitation_token.encode("utf-8")
    ).hexdigest()

    new_user = User(
        tenant_id=tenant_id,
        full_name=data.full_name.strip(),
        email=email,
        password=secrets.token_urlsafe(48),
        status="Inactive",
        must_change_password=True,
        profile_completed=False,
    )

    try:
        db.add(new_user)
        db.flush()

        db.add(
            UserRole(
                user_id=new_user.id,
                role_id=role.id,
            )
        )

        invitation = UserInvitation(
            user_id=new_user.id,
            token_hash=token_hash,
            expires_at=datetime.now(timezone.utc)
            + timedelta(hours=24),
            used=False,
        )

        db.add(invitation)
        db.commit()
        db.refresh(new_user)

    except Exception:
        db.rollback()
        raise

    try:
        await send_user_invitation_email(
            recipient_email=new_user.email,
            full_name=new_user.full_name,
            invitation_token=invitation_token,
        )
    except Exception:
        db.rollback()

        db.query(UserInvitation).filter(
            UserInvitation.token_hash == token_hash
        ).delete(synchronize_session=False)

        db.query(UserRole).filter(
            UserRole.user_id == new_user.id
        ).delete(synchronize_session=False)

        db.query(User).filter(
            User.id == new_user.id
        ).delete(synchronize_session=False)

        db.commit()

        raise HTTPException(
            status_code=502,
            detail=(
                "Invitation email could not be sent. "
                "Please try again."
            ),
        )

    return {
        "message": "User created and invitation sent successfully",
        "user": {
            "id": str(new_user.id),
            "full_name": new_user.full_name,
            "email": new_user.email,
            "tenant_id": str(new_user.tenant_id),
            "role": role.name,
            "status": new_user.status,
        },
    }


@router.get("/")
def get_users(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("user.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(current_user["tenant_id"])

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
            "profile_completed": user.profile_completed,
            "photo_url": user.photo_url,
            "created_at": user.created_at,
        })

    return result


@router.get("/roles")
def get_roles(
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("user.view")),
    db: Session = Depends(get_db),
):
    return [
        role.name
        for role in db.query(Role).order_by(Role.name).all()
    ]


# --------------------------------------------------
# MY PROFILE ROUTES
# Keep these BEFORE routes containing {user_id}
# --------------------------------------------------

@router.get("/me")
def get_my_profile(
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    user_id = UUID(current_user["user_id"])
    tenant_id = UUID(current_user["tenant_id"])

    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == tenant_id,
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
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
        "phone": user.phone,
        "job_title": user.job_title,
        "photo_url": user.photo_url,
        "tenant_id": str(user.tenant_id),
        "role": role_name,
        "status": user.status,
        "profile_completed": user.profile_completed,
        "created_at": user.created_at,
        "updated_at": user.updated_at,
    }


@router.put("/me")
def update_my_profile(
    data: UserProfileUpdate,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    user_id = UUID(current_user["user_id"])
    tenant_id = UUID(current_user["tenant_id"])

    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == tenant_id,
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    full_name = data.full_name.strip()

    if len(full_name) < 2:
        raise HTTPException(
            status_code=422,
            detail="Full name must contain at least 2 characters",
        )

    user.full_name = full_name
    user.phone = data.phone.strip() if data.phone else None
    user.job_title = (
        data.job_title.strip() if data.job_title else None
    )

    try:
        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        raise

    return {
        "message": "Profile updated successfully",
        "id": str(user.id),
        "full_name": user.full_name,
        "email": user.email,
        "phone": user.phone,
        "job_title": user.job_title,
        "photo_url": user.photo_url,
    }


@router.post("/me/photo")
async def upload_my_profile_photo(
    file: UploadFile = File(...),
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    user_id = UUID(current_user["user_id"])
    tenant_id = UUID(current_user["tenant_id"])

    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == tenant_id,
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    allowed_types = {
        "image/jpeg",
        "image/png",
        "image/webp",
    }

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Only JPEG, PNG, and WebP images are allowed",
        )

    max_size = 5 * 1024 * 1024
    contents = await file.read(max_size + 1)

    if not contents:
        raise HTTPException(
            status_code=400,
            detail="Please select an image",
        )

    if len(contents) > max_size:
        raise HTTPException(
            status_code=413,
            detail="Image must be 5 MB or smaller",
        )

    try:
        image = Image.open(io.BytesIO(contents))
        image.verify()

        image = Image.open(io.BytesIO(contents))

        if image.format not in {"JPEG", "PNG", "WEBP"}:
            raise HTTPException(
                status_code=400,
                detail="Unsupported image format",
            )

    except (UnidentifiedImageError, OSError):
        raise HTTPException(
            status_code=400,
            detail="The uploaded file is not a valid image",
        )

    try:
        import cloudinary.uploader

        result = cloudinary.uploader.upload(
            io.BytesIO(contents),
            resource_type="image",
            folder="scuilone/profile_photos",
            public_id=f"user_{user.id}",
            overwrite=True,
            invalidate=True,
            allowed_formats=["jpg", "jpeg", "png", "webp"],
        )

        photo_url = result.get("secure_url")

        if not photo_url:
            raise RuntimeError("Cloudinary did not return a secure URL")

        user.photo_url = photo_url
        db.commit()
        db.refresh(user)

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=502,
            detail="Photo upload failed. Please try again.",
        )
    finally:
        await file.close()

    return {
        "message": "Profile photo uploaded successfully",
        "photo_url": user.photo_url,
    }


@router.put("/me/change-password")
def change_my_password(
    data: ChangePasswordRequest,
    current_user: dict = Depends(require_active_user),
    db: Session = Depends(get_db),
):
    user_id = UUID(current_user["user_id"])
    tenant_id = UUID(current_user["tenant_id"])

    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == tenant_id,
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    if not verify_password(
        data.current_password,
        user.password,
    ):
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect",
        )

    user.password = hash_password(data.new_password)
    user.must_change_password = False

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "message": "Password changed successfully. Please log in again."
    }


# --------------------------------------------------
# ADMIN USER ROUTES
# --------------------------------------------------

@router.get("/{user_id}")
def get_user(
    user_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("user.view")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(current_user["tenant_id"])

    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == tenant_id,
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
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
        "role": role_name,
        "status": user.status,
        "profile_completed": user.profile_completed,
    }


@router.put("/{user_id}")
def update_user(
    user_id: UUID,
    data: UserUpdate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("user.update")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(current_user["tenant_id"])

    if data.status not in {"Active", "Inactive"}:
        raise HTTPException(
            status_code=400,
            detail="Status must be Active or Inactive",
        )

    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == tenant_id,
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    role = db.query(Role).filter(
        Role.name == data.role
    ).first()

    if not role:
        raise HTTPException(
            status_code=400,
            detail="Role not found",
        )

    user_role = db.query(UserRole).filter(
        UserRole.user_id == user.id
    ).first()

    try:
        if user_role:
            user_role.role_id = role.id
        else:
            db.add(
                UserRole(
                    user_id=user.id,
                    role_id=role.id,
                )
            )

        if data.status == "Active":
            if user.must_change_password or not user.profile_completed:
                raise HTTPException(
                    status_code=400,
                    detail=(
                        "User must finish onboarding "
                        "before activation"
                    ),
                )

        user.status = data.status

        db.commit()
        db.refresh(user)

    except Exception:
        db.rollback()
        raise

    return {
        "id": str(user.id),
        "full_name": user.full_name,
        "email": user.email,
        "tenant_id": str(user.tenant_id),
        "role": role.name,
        "status": user.status,
    }


@router.delete("/{user_id}")
def delete_user(
    user_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("user.delete")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(current_user["tenant_id"])

    user = db.query(User).filter(
        User.id == user_id,
        User.tenant_id == tenant_id,
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    user.status = "Inactive"

    db.query(UserInvitation).filter(
        UserInvitation.user_id == user.id,
        UserInvitation.used.is_(False),
    ).update(
        {"used": True},
        synchronize_session=False,
    )

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise

    return {
        "message": "User deactivated successfully",
        "id": str(user.id),
        "status": user.status,
    }