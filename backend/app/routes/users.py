import io

from fastapi import UploadFile, File
from PIL import Image, UnidentifiedImageError

from app.core.cloudinary_config import cloudinary

import hashlib
import logging
import secrets
from datetime import datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session
from app.database.connection import SessionLocal
from app.core.dependencies import require_active_user, get_current_user
from app.core.permissions import require_permission
from app.core.rate_limiter import limiter
from app.core.security import hash_password, verify_password

logger = logging.getLogger(__name__)

from app.models.tenant import Tenant
from app.models.user import User
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.user_invitation import UserInvitation

from app.schemas.auth import ProfileCompletionRequest
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


@router.post("", status_code=status.HTTP_201_CREATED)
@router.post("/", status_code=status.HTTP_201_CREATED)
@router.post("/invite", status_code=status.HTTP_201_CREATED)
async def create_user(
    data: UserCreate,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("user.create")),
    db: Session = Depends(get_db),
):
    tenant_id = UUID(current_user["tenant_id"])
    email = str(data.email).lower().strip()

    role = db.query(Role).filter(
        Role.name == data.role
    ).first()

    if not role:
        raise HTTPException(
            status_code=400,
            detail="Role not found",
        )

    existing_user = db.query(User).filter(
        User.email == email
    ).first()

    invitation_token = secrets.token_urlsafe(32)
    token_hash = hashlib.sha256(
        invitation_token.encode("utf-8")
    ).hexdigest()

    if existing_user:
        # If user is in the same tenant and still pending onboarding, allow re-issuing invitation
        if (
            existing_user.tenant_id == tenant_id
            and (existing_user.status == "Inactive" or existing_user.must_change_password)
            and not existing_user.profile_completed
        ):
            target_user = existing_user
            target_user.full_name = data.full_name.strip()
            user_role = db.query(UserRole).filter(UserRole.user_id == target_user.id).first()
            if user_role:
                user_role.role_id = role.id
            else:
                db.add(UserRole(user_id=target_user.id, role_id=role.id))

            # Mark any prior unused invitations as used/expired
            db.query(UserInvitation).filter(
                UserInvitation.user_id == target_user.id,
                UserInvitation.used == False
            ).update({"used": True})
        else:
            raise HTTPException(
                status_code=400,
                detail="Email already registered",
            )
    else:
        target_user = User(
            tenant_id=tenant_id,
            full_name=data.full_name.strip(),
            email=email,
            password=hash_password(secrets.token_urlsafe(32)),
            status="Inactive",
            must_change_password=True,
            profile_completed=False,
        )
        db.add(target_user)
        db.flush()

        db.add(
            UserRole(
                user_id=target_user.id,
                role_id=role.id,
            )
        )

    try:
        invitation = UserInvitation(
            user_id=target_user.id,
            token_hash=token_hash,
            expires_at=datetime.now(timezone.utc)
            + timedelta(hours=24),
            used=False,
        )

        db.add(invitation)
        db.commit()
        db.refresh(target_user)

    except Exception:
        db.rollback()
        raise

    email_sent = True
    try:
        await send_user_invitation_email(
            recipient_email=target_user.email,
            full_name=target_user.full_name,
            invitation_token=invitation_token,
        )
        logger.info("Invitation email successfully delivered to provider for %s", target_user.email)
    except Exception as email_err:
        email_sent = False
        logger.error("Invitation email delivery failed for %s: %s", target_user.email, str(email_err))

    return {
        "message": (
            "Invitation sent successfully"
            if email_sent
            else "User was created, but the invitation email could not be sent. Please check your email configuration or use Resend Invitation."
        ),
        "user": {
            "id": str(target_user.id),
            "full_name": target_user.full_name,
            "email": target_user.email,
            "tenant_id": str(target_user.tenant_id),
            "role": role.name,
            "status": target_user.status,
        },
        "invitation_sent": email_sent,
    }


@router.post("/{user_id}/resend-invitation")
@router.post("/resend-invitation/{user_id}")
@limiter.limit("5/minute")
async def resend_user_invitation(
    request: Request,
    response: Response,
    user_id: UUID,
    current_user: dict = Depends(require_active_user),
    _=Depends(require_permission("user.create")),
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
            detail="User not found in your organization",
        )

    if user.status == "Active" and user.profile_completed:
        raise HTTPException(
            status_code=400,
            detail="This user has already completed setup and activated their account.",
        )

    # Invalidate previous unused invitations
    db.query(UserInvitation).filter(
        UserInvitation.user_id == user.id,
        UserInvitation.used == False,
    ).update({"used": True})

    # Generate new secure token with fresh expiration
    new_invitation_token = secrets.token_urlsafe(32)
    new_token_hash = hashlib.sha256(
        new_invitation_token.encode("utf-8")
    ).hexdigest()

    new_invitation = UserInvitation(
        user_id=user.id,
        token_hash=new_token_hash,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=24),
        used=False,
    )
    db.add(new_invitation)
    db.commit()

    # Send invitation email
    try:
        await send_user_invitation_email(
            recipient_email=user.email,
            full_name=user.full_name,
            invitation_token=new_invitation_token,
        )
        logger.info("Resend invitation email successfully delivered to provider for %s", user.email)
    except Exception as exc:
        logger.error("Failed to resend invitation email to %s: %s", user.email, str(exc))
        raise HTTPException(
            status_code=502,
            detail="The invitation email could not be sent. Please verify SMTP settings.",
        )

    return {
        "message": f"Invitation email resent successfully to {user.email}",
        "email": user.email,
        "invitation_sent": True,
    }


@router.post("/complete-profile")
def complete_user_profile(
    data: ProfileCompletionRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    from app.routes.auth import complete_profile
    return complete_profile(data=data, current_user=current_user, db=db)


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

        now = datetime.now(timezone.utc)
        invitation = db.query(UserInvitation).filter(
            UserInvitation.user_id == user.id,
            UserInvitation.used == False,
        ).order_by(UserInvitation.created_at.desc()).first()

        inv_status = "Active" if user.status == "Active" else "Pending"
        if user.status != "Active" and invitation:
            exp = invitation.expires_at
            if exp.tzinfo is None:
                exp = exp.replace(tzinfo=timezone.utc)
            if now >= exp:
                inv_status = "Expired"

        result.append({
            "id": str(user.id),
            "full_name": user.full_name,
            "email": user.email,
            "tenant_id": str(user.tenant_id),
            "role": role_name,
            "status": user.status,
            "invitation_status": inv_status,
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
    except Exception as upload_err:
        try:
            import base64
            mime_map = {"JPEG": "image/jpeg", "PNG": "image/png", "WEBP": "image/webp"}
            mime_type = mime_map.get(image.format, "image/jpeg")
            encoded = base64.b64encode(contents).decode("utf-8")
            data_url = f"data:{mime_type};base64,{encoded}"
            user.photo_url = data_url
            db.commit()
            db.refresh(user)
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=400,
                detail=f"Photo upload failed: {str(upload_err)}",
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