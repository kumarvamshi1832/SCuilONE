from app.models.user_mfa import UserMFA
import hashlib
import random
import secrets
import traceback
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Request, Response
from sqlalchemy.orm import Session


from app.core.mfa import (
    consume_recovery_code,
    decrypt_totp_secret,
    encrypt_totp_secret,
    generate_recovery_codes,
    generate_totp_secret,
    generate_totp_uri,
    hash_recovery_code,
    verify_totp_code,
)
from app.core.security import create_mfa_token
from app.models.user_mfa import UserMFA
from app.schemas.auth import (
    MFAEnrollmentStartRequest,
    MFAEnrollmentVerifyRequest,
    MFAVerifyRequest,
)


from app.core.dependencies import get_current_user
from app.core.rate_limiter import limiter
from app.core.security import (
    create_access_token,
    create_password_reset_token,
    decode_access_token,
    hash_password,
    verify_password,
)
from app.database.connection import SessionLocal, settings
from app.models.otp import OTPVerification
from app.models.password_reset import PasswordResetOTP
from app.models.pending_registration import PendingRegistration
from app.models.permission import Permission
from app.models.refresh_session import RefreshSession
from app.models.role import Role
from app.models.role_permission import RolePermission
from app.models.tenant import Tenant
from app.models.user import User
from app.models.user_invitation import UserInvitation
from app.models.user_role import UserRole
from app.schemas.auth import (
    ChangeTemporaryPasswordRequest,
    ForgotPasswordRequest,
    InvitationSetupRequest,
    LoginRequest,
    ProfileCompletionRequest,
    RegisterRequest,
    ResetPasswordRequest,
    VerifyOTPRequest,
    VerifyResetOTPRequest,
)
from app.services.email_service import send_otp_email


router = APIRouter(
    prefix="/api/v1/auth",
    tags=["Authentication"],
)

REFRESH_TOKEN_EXPIRE_DAYS = 7


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def create_refresh_session(
    db: Session,
    user: User,
    family_id: uuid.UUID | None = None,
):
    raw_token = secrets.token_urlsafe(48)
    token_hash = hashlib.sha256(
        raw_token.encode("utf-8")
    ).hexdigest()

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)

    session = RefreshSession(
        family_id=family_id or uuid.uuid4(),
        user_id=user.id,
        tenant_id=user.tenant_id,
        token_hash=token_hash,
        expires_at=expires_at,
        revoked=False,
        created_at=now,
    )

    db.add(session)

    return raw_token, expires_at, token_hash


def revoke_refresh_family(db: Session, family_id: uuid.UUID):
    db.query(RefreshSession).filter(
        RefreshSession.family_id == family_id
    ).update(
        {RefreshSession.revoked: True},
        synchronize_session=False,
    )

def revoke_all_user_refresh_sessions(
    db: Session,
    user_id: uuid.UUID,
):
    db.query(RefreshSession).filter(
        RefreshSession.user_id == user_id,
        RefreshSession.revoked.is_(False),
    ).update(
        {RefreshSession.revoked: True},
        synchronize_session=False,
    )


def get_mfa_token_user(
    db: Session,
    token: str,
    expected_purpose: str,
):
    payload = decode_access_token(token)

    if payload.get("purpose") != expected_purpose:
        raise HTTPException(
            status_code=401,
            detail="Invalid MFA token",
        )

    user_id = payload.get("user_id")
    tenant_id = payload.get("tenant_id")

    try:
        user_uuid = uuid.UUID(str(user_id))
        tenant_uuid = uuid.UUID(str(tenant_id))
    except (ValueError, TypeError):
        raise HTTPException(
            status_code=401,
            detail="Invalid MFA token identifiers",
        )

    user = db.query(User).filter(
        User.id == user_uuid,
        User.tenant_id == tenant_uuid,
    ).first()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="User not found",
        )

    if user.status == "Inactive" and (
        user.must_change_password or user.profile_completed
    ):
        raise HTTPException(
            status_code=403,
            detail="Your account is inactive.",
        )

    return user


def complete_mfa_login(db: Session, user: User):
    is_onboarding = (
        user.status == "Inactive"
        and not user.must_change_password
        and not user.profile_completed
    )

    role = db.query(Role).join(
        UserRole,
        UserRole.role_id == Role.id,
    ).filter(
        UserRole.user_id == user.id
    ).first()

    tenant = db.query(Tenant).filter(
        Tenant.id == user.tenant_id
    ).first()

    permissions = []

    if role and not is_onboarding:
        permissions = [
            permission.name
            for permission in db.query(Permission).join(
                RolePermission,
                RolePermission.permission_id == Permission.id,
            ).filter(
                RolePermission.role_id == role.id
            ).all()
        ]

    access_token = create_access_token({
        "user_id": str(user.id),
        "tenant_id": str(user.tenant_id),
        "role": role.name if role else None,
        "purpose": "onboarding" if is_onboarding else "access",
        "mfa_verified": True,
    })

    can_refresh = (
        not is_onboarding
        and user.status == "Active"
        and not user.must_change_password
        and user.profile_completed
    )

    refresh_token = None
    refresh_expires_at = None

    if can_refresh:
        refresh_token, refresh_expires_at, _ = create_refresh_session(
            db=db,
            user=user,
        )

    return {
        "message": "MFA verification successful",
        "access_token": access_token,
        "refresh_token": refresh_token,
        "refresh_token_expires_at": (
            refresh_expires_at.isoformat()
            if refresh_expires_at else None
        ),
        "token_type": "bearer",
        "onboarding_required": is_onboarding,
        "user": {
            "id": str(user.id),
            "name": user.full_name,
            "email": user.email,
            "photo_url": user.photo_url,
            "status": user.status,
            "must_change_password": user.must_change_password,
            "profile_completed": user.profile_completed,
        },
        "tenant": {
            "id": str(tenant.id) if tenant else None,
            "name": tenant.name if tenant else None,
            "industry": tenant.industry if tenant else None,
        },
        "role": role.name if role else None,
        "permissions": permissions,
    }



@router.post("/mfa/enroll/start")
@limiter.limit("5/minute")
def start_mfa_enrollment(
    request: Request,
    response: Response,
    data: MFAEnrollmentStartRequest,
    db: Session = Depends(get_db),
):
    user = get_mfa_token_user(
        db,
        data.mfa_token,
        "mfa_enrollment",
    )

    mfa = db.query(UserMFA).filter(
        UserMFA.user_id == user.id,
    ).with_for_update().first()

    if mfa and mfa.enabled:
        raise HTTPException(
            status_code=409,
            detail="MFA is already enabled",
        )

    # Reuse existing pending secret if already generated for this user and not explicitly resetting,
    # to prevent page reloads / component remounts from desynchronizing with scanned QR code
    if not data.reset and mfa and not mfa.enabled and mfa.secret_encrypted:
        try:
            secret = decrypt_totp_secret(mfa.secret_encrypted)
        except Exception:
            secret = generate_totp_secret()
            mfa.secret_encrypted = encrypt_totp_secret(secret)
            db.commit()
    else:
        secret = generate_totp_secret()
        encrypted_secret = encrypt_totp_secret(secret)

        if not mfa:
            mfa = UserMFA(
                user_id=user.id,
                secret_encrypted=encrypted_secret,
                enabled=False,
                recovery_code_hashes=[],
            )
            db.add(mfa)
        else:
            mfa.secret_encrypted = encrypted_secret
            mfa.recovery_code_hashes = []

        try:
            db.commit()
        except Exception:
            db.rollback()
            raise HTTPException(
                status_code=500,
                detail="Unable to start MFA enrollment",
            )

    response_payload = {
        "message": "Scan the authenticator setup QR code and verify it",
        "secret": secret,
        "otpauth_url": generate_totp_uri(secret, user.email),
        "issuer": "SCuilONE",
        "account": user.email,
    }

    if settings.ENVIRONMENT.lower() == "development":
        try:
            response_payload["dev_code"] = pyotp.TOTP(secret).now()
        except Exception:
            pass

    return response_payload



@router.post("/mfa/enroll/verify")
@limiter.limit("5/minute")
def verify_mfa_enrollment(
    request: Request,
    response: Response,
    data: MFAEnrollmentVerifyRequest,
    db: Session = Depends(get_db),
):
    user = get_mfa_token_user(
        db,
        data.mfa_token,
        "mfa_enrollment",
    )

    mfa = db.query(UserMFA).filter(
        UserMFA.user_id == user.id,
    ).with_for_update().first()

    if not mfa or not mfa.secret_encrypted:
        raise HTTPException(
            status_code=400,
            detail="Start MFA enrollment first",
        )

    if mfa.enabled:
        raise HTTPException(
            status_code=409,
            detail="MFA is already enabled",
        )

    secret = decrypt_totp_secret(mfa.secret_encrypted)

    if not verify_totp_code(secret, data.code):
        raise HTTPException(
            status_code=400,
            detail="Invalid authenticator code",
        )

    recovery_codes = generate_recovery_codes()

    mfa.enabled = True
    mfa.recovery_code_hashes = [
        hash_recovery_code(code)
        for code in recovery_codes
    ]

    try:
        revoke_all_user_refresh_sessions(
            db=db,
            user_id=user.id,
        )

        result = complete_mfa_login(db, user)

        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to complete MFA enrollment",
        )

    result["recovery_codes"] = recovery_codes
    result["recovery_codes_message"] = (
        "Save these codes securely. Each code can be used only once."
    )

    return result


@router.post("/mfa/verify")
@limiter.limit("5/minute")
def verify_mfa_login(
    request: Request,
    response: Response,
    data: MFAVerifyRequest,
    db: Session = Depends(get_db),
):
    user = get_mfa_token_user(
        db,
        data.mfa_token,
        "mfa_challenge",
    )

    if data.email and user.email.lower() != str(data.email).lower():
        raise HTTPException(
            status_code=401,
            detail="MFA token does not match the provided email address",
        )

    mfa = db.query(UserMFA).filter(
        UserMFA.user_id == user.id,
    ).with_for_update().first()

    if not mfa or not mfa.enabled or not mfa.secret_encrypted:
        raise HTTPException(
            status_code=403,
            detail="MFA enrollment is required",
        )

    code = data.code.strip()
    recovery_hashes = list(mfa.recovery_code_hashes or [])

    recovery_valid, remaining_hashes = consume_recovery_code(
        code,
        recovery_hashes,
    )

    if recovery_valid:
        mfa.recovery_code_hashes = remaining_hashes
    else:
        secret = decrypt_totp_secret(mfa.secret_encrypted)

        if not verify_totp_code(secret, code):
            raise HTTPException(
                status_code=401,
                detail="Invalid authenticator or recovery code",
            )

    result = complete_mfa_login(db, user)

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to complete MFA verification",
        )

    return result


@router.get("/me")
def get_me(
    current_user: dict = Depends(get_current_user),
):
    return {
        "message": "Authenticated user",
        "user": current_user,
    }


@router.post("/register")
@limiter.limit("3/hour")
async def register(
    request: Request,
    response: Response,
    data: RegisterRequest,
    db: Session = Depends(get_db),
):
    existing_user = db.query(User).filter(
        User.email == data.email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered",
        )

    existing_company = db.query(Tenant).filter(
        Tenant.name == data.company_name
    ).first()

    if existing_company:
        raise HTTPException(
            status_code=400,
            detail="Company already registered",
        )

    hashed_password = hash_password(data.password)

    existing_pending = db.query(PendingRegistration).filter(
        PendingRegistration.email == data.email
    ).first()

    if existing_pending:
        db.delete(existing_pending)

    existing_otp = db.query(OTPVerification).filter(
        OTPVerification.email == data.email
    ).first()

    if existing_otp:
        db.delete(existing_otp)

    db.flush()

    pending_registration = PendingRegistration(
        company_name=data.company_name,
        company_email=data.company_email,
        phone=data.phone,
        industry=data.industry,
        full_name=data.full_name,
        email=data.email,
        password=hashed_password,
    )

    db.add(pending_registration)

    otp = str(random.randint(100000, 999999))
    otp_hash = hash_password(otp)

    otp_record = OTPVerification(
        email=data.email,
        otp_hash=otp_hash,
        expires_at=datetime.utcnow() + timedelta(minutes=10),
        attempts=0,
    )

    db.add(otp_record)

    try:
        db.commit()
        await send_otp_email(
            recipient_email=data.email,
            otp=otp,
        )
    except Exception:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Unable to start registration. Please try again.",
        )

    return {
        "message": "OTP sent successfully",
        "email": data.email,
    }


@router.post("/verify-otp")
@limiter.limit("5/minute")
def verify_otp(
    request: Request,
    response: Response,
    data: VerifyOTPRequest,
    db: Session = Depends(get_db),
):
    otp_record = db.query(OTPVerification).filter(
        OTPVerification.email == data.email
    ).first()

    if not otp_record:
        raise HTTPException(
            status_code=400,
            detail="OTP not found. Please request a new OTP.",
        )

    if datetime.utcnow() > otp_record.expires_at:
        db.delete(otp_record)
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="OTP has expired. Please request a new OTP.",
        )

    if otp_record.attempts >= 5:
        db.delete(otp_record)
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Too many attempts. Please request a new OTP.",
        )

    otp_record.attempts += 1

    if not verify_password(data.otp, otp_record.otp_hash):
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Invalid OTP",
        )

    pending_registration = db.query(
        PendingRegistration
    ).filter(
        PendingRegistration.email == data.email
    ).first()

    if not pending_registration:
        db.delete(otp_record)
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Registration data not found. Please register again.",
        )

    new_tenant = Tenant(
        name=pending_registration.company_name,
        industry=pending_registration.industry,
    )

    db.add(new_tenant)

    try:
        db.flush()

        new_user = User(
            tenant_id=new_tenant.id,
            full_name=pending_registration.full_name,
            email=pending_registration.email,
            password=pending_registration.password,
        )

        db.add(new_user)
        db.flush()

        tenant_owner_role = db.query(Role).filter(
            Role.name == "Tenant Owner"
        ).first()

        if not tenant_owner_role:
            raise HTTPException(
                status_code=500,
                detail="Tenant Owner role not found.",
            )

        db.add(
            UserRole(
                user_id=new_user.id,
                role_id=tenant_owner_role.id,
            )
        )

        db.delete(pending_registration)
        db.delete(otp_record)
        db.commit()

        return {
            "message": "Registration completed successfully",
            "company": new_tenant.name,
            "user": new_user.email,
            "role": tenant_owner_role.name,
        }

    except HTTPException:
        db.rollback()
        raise
    except Exception:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Failed to complete registration",
        )


@router.post("/login")
@limiter.limit("5/minute")
def login(
    request: Request,
    response: Response,
    data: LoginRequest,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(
        User.email == data.email
    ).first()

    if not user or not verify_password(
        data.password,
        user.password,
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    if user.status == "Inactive" and (
        user.must_change_password or user.profile_completed
    ):
        raise HTTPException(
            status_code=403,
            detail="Your account is inactive. Contact your administrator.",
        )

    is_onboarding = (
        user.status == "Inactive"
        and not user.must_change_password
        and not user.profile_completed
    )

    role = db.query(Role).join(
        UserRole,
        UserRole.role_id == Role.id,
    ).filter(
        UserRole.user_id == user.id
    ).first()

    tenant = db.query(Tenant).filter(
        Tenant.id == user.tenant_id
    ).first()

    if not tenant:
        raise HTTPException(
            status_code=403,
            detail="User tenant was not found.",
        )

    mfa = db.query(UserMFA).filter(
        UserMFA.user_id == user.id
    ).first()

    mfa_token_purpose = (
        "mfa_challenge"
        if mfa and mfa.enabled
        else "mfa_enrollment"
    )

    mfa_token = create_mfa_token(
        {
            "user_id": str(user.id),
            "tenant_id": str(user.tenant_id),
            "role": role.name if role else None,
        },
        purpose=mfa_token_purpose,
    )

    return {
        "message": (
            "MFA verification required"
            if mfa_token_purpose == "mfa_challenge"
            else "MFA enrollment required"
        ),
        "mfa_required": True,
        "requires_mfa": True,
        "mfa_setup_required": (
            mfa_token_purpose == "mfa_enrollment"
        ),
        "mfa_token": mfa_token,
        "temp_token": mfa_token,
        "email": user.email,
        "next_step": (
            "mfa_enrollment"
            if mfa_token_purpose == "mfa_enrollment"
            else "mfa_verification"
        ),
        "user": {
            "id": str(user.id),
            "name": user.full_name,
            "email": user.email,
            "status": user.status,
            "must_change_password": user.must_change_password,
            "profile_completed": user.profile_completed,
        },
        "tenant": {
            "id": str(tenant.id),
            "name": tenant.name,
            "industry": tenant.industry,
        },
        "role": role.name if role else None,
    }


@router.post("/refresh")
@limiter.limit("10/minute")
def refresh_access_token(
    request: Request,
    response: Response,
    refresh_token: str = Body(..., embed=True),
    db: Session = Depends(get_db),
):
    token_hash = hashlib.sha256(
        refresh_token.encode("utf-8")
    ).hexdigest()

    session = db.query(RefreshSession).filter(
        RefreshSession.token_hash == token_hash
    ).with_for_update().first()

    if not session:
        raise HTTPException(
            status_code=401,
            detail="Invalid refresh token. Please log in again.",
        )

    if session.revoked:
        revoke_refresh_family(db, session.family_id)
        db.commit()
        raise HTTPException(
            status_code=401,
            detail="Refresh token reuse detected. Please log in again.",
        )

    now = datetime.now(timezone.utc)
    expires_at = session.expires_at

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if now >= expires_at:
        revoke_refresh_family(db, session.family_id)
        db.commit()
        raise HTTPException(
            status_code=401,
            detail="Refresh token expired. Please log in again.",
        )

    user = db.query(User).filter(
        User.id == session.user_id,
        User.tenant_id == session.tenant_id,
    ).with_for_update().first()

    if (
        not user
        or user.status != "Active"
        or user.must_change_password
        or not user.profile_completed
    ):
        revoke_refresh_family(db, session.family_id)
        db.commit()
        raise HTTPException(
            status_code=401,
            detail="Account is not eligible for token refresh. Please log in again.",
        )

    mfa = db.query(UserMFA).filter(
        UserMFA.user_id == user.id
    ).first()

    if not mfa or not mfa.enabled:
        revoke_refresh_family(db, session.family_id)
        db.commit()
        raise HTTPException(
            status_code=401,
            detail="MFA enrollment required. Please log in again.",
        )

    role = db.query(Role).join(
        UserRole,
        UserRole.role_id == Role.id,
    ).filter(
        UserRole.user_id == user.id
    ).first()

    new_refresh_token, new_expires_at, new_token_hash = (
        create_refresh_session(
            db=db,
            user=user,
            family_id=session.family_id,
        )
    )

    session.revoked = True
    session.replaced_by_token_hash = new_token_hash

    access_token = create_access_token({
        "user_id": str(user.id),
        "tenant_id": str(user.tenant_id),
        "role": role.name if role else None,
        "purpose": "access",
        "mfa_verified": True,
    })

    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to refresh session. Please try again.",
        )

    return {
        "access_token": access_token,
        "refresh_token": new_refresh_token,
        "token_type": "bearer",
        "refresh_token_expires_at": new_expires_at.isoformat(),
    }



@router.post("/logout")
@limiter.limit("10/minute")
def logout(
    request: Request,
    response: Response,
    refresh_token: str = Body(..., embed=True),
    db: Session = Depends(get_db),
):
    token_hash = hashlib.sha256(
        refresh_token.encode("utf-8")
    ).hexdigest()

    session = db.query(RefreshSession).filter(
        RefreshSession.token_hash == token_hash
    ).with_for_update().first()

    if session:
        revoke_refresh_family(db, session.family_id)
        db.commit()

    return {
        "message": "Logged out successfully.",
    }


@router.post("/forgot-password")
@limiter.limit("3/hour")
async def forgot_password(
    request: Request,
    response: Response,
    data: ForgotPasswordRequest,
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(
        User.email == data.email
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    old_otps = db.query(PasswordResetOTP).filter(
        PasswordResetOTP.email == data.email
    ).all()

    for old_otp in old_otps:
        db.delete(old_otp)

    db.flush()

    otp = str(random.randint(100000, 999999))
    otp_hash = hash_password(otp)

    reset_otp = PasswordResetOTP(
        email=data.email,
        otp_hash=otp_hash,
        expires_at=datetime.utcnow() + timedelta(minutes=10),
        attempts=0,
    )

    db.add(reset_otp)

    try:
        db.commit()
        await send_otp_email(data.email, otp)
    except Exception:
        db.rollback()
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail="Unable to send password-reset OTP.",
        )

    return {
        "message": "Password reset OTP sent successfully",
        "email": data.email,
    }


@router.post("/verify-reset-otp")
@limiter.limit("5/minute")
def verify_reset_otp(
    request: Request,
    response: Response,
    data: VerifyResetOTPRequest,
    db: Session = Depends(get_db),
):
    otp_record = db.query(PasswordResetOTP).filter(
        PasswordResetOTP.email == data.email
    ).first()

    if not otp_record:
        raise HTTPException(
            status_code=400,
            detail="OTP not found. Please request a new OTP.",
        )

    if datetime.utcnow() > otp_record.expires_at:
        db.delete(otp_record)
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="OTP has expired. Please request a new OTP.",
        )

    if otp_record.attempts >= 5:
        db.delete(otp_record)
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Too many attempts. Please request a new OTP.",
        )

    otp_record.attempts += 1

    if not verify_password(data.otp, otp_record.otp_hash):
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Invalid OTP",
        )

    reset_token = create_password_reset_token(data.email)

    db.delete(otp_record)
    db.commit()

    return {
        "message": "OTP verified successfully",
        "reset_token": reset_token,
    }


@router.post("/reset-password")
@limiter.limit("5/hour")
def reset_password(
    request: Request,
    response: Response,
    data: ResetPasswordRequest,
    db: Session = Depends(get_db),
):
    payload = decode_access_token(data.reset_token)

    if not payload or payload.get("purpose") != "password_reset":
        raise HTTPException(
            status_code=401,
            detail="Invalid password reset token",
        )

    if payload.get("email") != data.email:
        raise HTTPException(
            status_code=401,
            detail="Invalid password reset token",
        )

    user = db.query(User).filter(
        User.email == data.email
    ).first()

    if not user:
        raise HTTPException(
            status_code=400,
            detail="Unable to reset password with these details.",
        )

    user.password = hash_password(data.new_password)
    
    revoke_all_user_refresh_sessions(
        db=db,
        user_id=user.id,
        )
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to reset password.",
        )

    return {
        "message": "Password reset successfully",
    }


@router.post("/change-temporary-password")
@limiter.limit("5/minute")
def change_temporary_password(
    request: Request,
    response: Response,
    data: ChangeTemporaryPasswordRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(
        User.id == current_user["user_id"],
        User.tenant_id == current_user["tenant_id"],
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    if not user.must_change_password:
        raise HTTPException(
            status_code=400,
            detail="Password change is not required",
        )

    if not verify_password(data.current_password, user.password):
        raise HTTPException(
            status_code=400,
            detail="Current password is incorrect",
        )

    user.password = hash_password(data.new_password)
    user.must_change_password = False
    
    revoke_all_user_refresh_sessions(
        db=db,
        user_id=user.id,
        )
    
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to change password.",
        )

    return {
        "message": "Password changed successfully",
        "profile_completed": user.profile_completed,
        "status": user.status,
    }


@router.post("/complete-profile")
def complete_profile(
    data: ProfileCompletionRequest,
    current_user: dict = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(
        User.id == current_user["user_id"],
        User.tenant_id == current_user["tenant_id"],
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found",
        )

    token_purpose = current_user.get("token_purpose", "access")

    if token_purpose == "onboarding":
        if (
            user.status != "Inactive"
            or user.must_change_password
            or user.profile_completed
        ):
            raise HTTPException(
                status_code=403,
                detail="This account is not awaiting onboarding",
            )
    else:
        if user.status != "Active":
            raise HTTPException(
                status_code=403,
                detail="Your account is inactive",
            )

        if user.must_change_password:
            raise HTTPException(
                status_code=403,
                detail="Change your temporary password first",
            )

    user.full_name = data.full_name.strip()
    user.phone = data.phone.strip()
    user.job_title = data.job_title.strip()
    user.profile_completed = True
    user.status = "Active"

    try:
        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to complete profile",
        )

    return {
        "message": "Profile completed successfully. Please log in again.",
        "profile_completed": user.profile_completed,
        "status": user.status,
        "login_required": True,
    }


@router.post("/accept-invitation")
@limiter.limit("5/minute")
def accept_invitation(
    request: Request,
    response: Response,
    data: InvitationSetupRequest,
    db: Session = Depends(get_db),
):
    token_hash = hashlib.sha256(
        data.invitation_token.encode("utf-8")
    ).hexdigest()

    invitation = db.query(UserInvitation).filter(
        UserInvitation.token_hash == token_hash
    ).with_for_update().first()

    if not invitation or invitation.used:
        raise HTTPException(
            status_code=400,
            detail="Invalid or already used invitation",
        )

    now = datetime.now(timezone.utc)
    expires_at = invitation.expires_at

    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)

    if now >= expires_at:
        invitation.used = True
        db.commit()
        raise HTTPException(
            status_code=400,
            detail="Invitation has expired. Ask your administrator for a new invitation.",
        )

    user = db.query(User).filter(
        User.id == invitation.user_id
    ).with_for_update().first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="Invited user not found",
        )

    if (
        user.status != "Inactive"
        or not user.must_change_password
        or user.profile_completed
    ):
        raise HTTPException(
            status_code=400,
            detail="This account is not awaiting invitation setup",
        )

    user.password = hash_password(data.password)
    user.must_change_password = False
    invitation.used = True
    
    revoke_all_user_refresh_sessions(
        db=db,
        user_id=user.id,
    )
        
    try:
        db.commit()
        db.refresh(user)
    except Exception:
        db.rollback()
        raise HTTPException(
            status_code=500,
            detail="Unable to complete invitation setup",
        )

    role = db.query(Role).join(
        UserRole,
        UserRole.role_id == Role.id,
    ).filter(
        UserRole.user_id == user.id
    ).first()

   
    mfa = db.query(UserMFA).filter(
        UserMFA.user_id == user.id
    ).first()

    if mfa and mfa.enabled:
        onboarding_token = create_mfa_token(
            {
                "user_id": str(user.id),
                "tenant_id": str(user.tenant_id),
                "role": role.name if role else None,
            },
            purpose="mfa_challenge",
        )

        return {
            "message": "Invitation accepted. Verify MFA to continue.",
            "mfa_required": True,
            "mfa_setup_required": False,
            "mfa_token": onboarding_token,
            "next_step": "mfa_verification",
            "email": user.email,
        }

    onboarding_token = create_mfa_token(
        {
            "user_id": str(user.id),
            "tenant_id": str(user.tenant_id),
            "role": role.name if role else None,
        },
        purpose="mfa_enrollment",
    )

    return {
        "message": "Invitation accepted. Set up MFA to continue.",
        "mfa_required": True,
        "mfa_setup_required": True,
        "mfa_token": onboarding_token,
        "next_step": "mfa_enrollment",
        "email": user.email,
    }

    return {
        "message": "Password created successfully. Complete your profile.",
        "access_token": onboarding_token,
        "token_type": "bearer",
        "email": user.email,
        "next_step": "complete_profile",
    }
