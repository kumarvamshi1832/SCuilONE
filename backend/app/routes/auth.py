import random
import random
from datetime import datetime, timedelta
import traceback

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database.connection import SessionLocal

from app.models.tenant import Tenant
from app.models.user import User
from app.models.role import Role
from app.models.user_role import UserRole
from app.models.otp import OTPVerification
from app.models.pending_registration import PendingRegistration
from app.models.password_reset import PasswordResetOTP

from app.schemas.auth import (
    RegisterRequest,
    VerifyOTPRequest,
    LoginRequest,
    ForgotPasswordRequest,
    VerifyResetOTPRequest,
    ResetPasswordRequest
)

from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    decode_access_token,
    create_password_reset_token,
)

from app.services.email_service import send_otp_email
from app.core.dependencies import get_current_user

router = APIRouter(
    prefix="/api/v1/auth",
    tags=["Authentication"]
)


def get_db():
    db = SessionLocal()

    try:
        yield db
    finally:
        db.close()

@router.get("/me")
def get_me(
    current_user: dict = Depends(get_current_user)
):
    return {
        "message": "Authenticated user",
        "user": current_user
    }

@router.post("/register")
async def register(
    data: RegisterRequest,
    db: Session = Depends(get_db)
):
    if data.password != data.confirm_password:
        raise HTTPException(
            status_code=400,
            detail="Passwords do not match"
        )

    existing_user = db.query(User).filter(
        User.email == data.email
    ).first()

    if existing_user:
        raise HTTPException(
            status_code=400,
            detail="Email already registered"
        )

    existing_company = db.query(Tenant).filter(
        Tenant.name == data.company_name
    ).first()

    if existing_company:
        raise HTTPException(
            status_code=400,
            detail="Company already registered"
        )

    hashed_password = hash_password(data.password)

    existing_pending = db.query(PendingRegistration).filter(
        PendingRegistration.email == data.email
    ).first()

    if existing_pending:
        db.delete(existing_pending)
        db.commit()

    pending_registration = PendingRegistration(
        company_name=data.company_name,
        company_email=data.company_email,
        phone=data.phone,
        industry=data.industry,
        full_name=data.full_name,
        email=data.email,
        password=hashed_password
    )

    db.add(pending_registration)

    otp = str(random.randint(100000, 999999))

    otp_hash = hash_password(otp)

    existing_otp = db.query(OTPVerification).filter(
        OTPVerification.email == data.email
    ).first()

    if existing_otp:
        db.delete(existing_otp)
        db.commit()

    otp_record = OTPVerification(
        email=data.email,
        otp_hash=otp_hash,
        expires_at=datetime.utcnow() + timedelta(minutes=10),
        attempts=0
    )

    db.add(otp_record)
    db.commit()

    await send_otp_email(
        recipient_email=data.email,
        otp=otp
    )

    return {
        "message": "OTP sent successfully",
        "email": data.email
    }

@router.post("/verify-otp")
def verify_otp(
    data: VerifyOTPRequest,
    db: Session = Depends(get_db)
):
    print("VERIFY OTP: Started")

    otp_record = db.query(OTPVerification).filter(
        OTPVerification.email == data.email
    ).first()

    print("VERIFY OTP: OTP record fetched")

    if not otp_record:
        raise HTTPException(
            status_code=400,
            detail="OTP not found. Please request a new OTP."
        )

    if datetime.utcnow() > otp_record.expires_at:
        db.delete(otp_record)
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="OTP has expired. Please request a new OTP."
        )

    if otp_record.attempts >= 5:
        db.delete(otp_record)
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="Too many attempts. Please request a new OTP."
        )

    otp_record.attempts += 1

    print("VERIFY OTP: Checking OTP")

    if not verify_password(
        data.otp,
        otp_record.otp_hash
    ):
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="Invalid OTP"
        )

    print("VERIFY OTP: OTP is valid")

    pending_registration = db.query(
        PendingRegistration
    ).filter(
        PendingRegistration.email == data.email
    ).first()

    print("VERIFY OTP: Pending registration fetched")

    if not pending_registration:
        db.delete(otp_record)
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="Registration data not found. Please register again."
        )

    print("VERIFY OTP: Creating tenant")

    new_tenant = Tenant(
        name=pending_registration.company_name,
        industry=pending_registration.industry
    )

    db.add(new_tenant)

    try:
        db.flush()
        print("VERIFY OTP: Tenant created successfully")
    except Exception:
        db.rollback()
        print("VERIFY OTP TENANT ERROR:")
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Failed to create tenant"
        )

    print("VERIFY OTP: Creating user")

    new_user = User(
        tenant_id=new_tenant.id,
        full_name=pending_registration.full_name,
        email=pending_registration.email,
        password=pending_registration.password
    )

    db.add(new_user)

    try:
        db.flush()
        print("VERIFY OTP: User created successfully")
    except Exception:
        db.rollback()
        print("VERIFY OTP USER ERROR:")
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Failed to create user"
        )

    print("VERIFY OTP: Finding Tenant Owner role")
    
    try:
        tenant_owner_role = db.query(Role).filter(
            Role.name == "Tenant Owner"
            ).first()

        print("VERIFY OTP: Role query completed")
        print("VERIFY OTP: Role found:", tenant_owner_role)
    except Exception:
        db.rollback()
        print("VERIFY OTP ROLE QUERY ERROR:")
        traceback.print_exc()

    raise HTTPException(
        status_code=500,
        detail="Failed to fetch Tenant Owner role"
    )

    if not tenant_owner_role:
        db.rollback()

        raise HTTPException(
            status_code=500,
            detail="Tenant Owner role not found."
        )

    print("VERIFY OTP: Tenant Owner role found")

    user_role = UserRole(
        user_id=new_user.id,
        role_id=tenant_owner_role.id
    )

    db.add(user_role)

    print("VERIFY OTP: Deleting temporary records")

    db.delete(pending_registration)
    db.delete(otp_record)

    print("VERIFY OTP: Committing transaction")

    try:
        db.commit()
        print("VERIFY OTP: Registration completed successfully")
    except Exception:
        db.rollback()
        print("VERIFY OTP COMMIT ERROR:")
        traceback.print_exc()

        raise HTTPException(
            status_code=500,
            detail="Failed to complete registration"
        )

    return {
        "message": "Registration completed successfully",
        "company": new_tenant.name,
        "user": new_user.email,
        "role": tenant_owner_role.name
    }

@router.post("/login")
def login(
    data: LoginRequest,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.email == data.email
    ).first()

    if not user:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    if not verify_password(
        data.password,
        user.password
    ):
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password"
        )

    role = db.query(Role).join(
        UserRole,
        UserRole.role_id == Role.id
    ).filter(
        UserRole.user_id == user.id
    ).first()

    tenant = db.query(Tenant).filter(
        Tenant.id == user.tenant_id
    ).first()

    access_token = create_access_token({
        "user_id": str(user.id),
        "tenant_id": str(user.tenant_id),
        "role": role.name if role else None
    })

    return {
        "message": "Login successful",
        "access_token": access_token,
        "token_type": "bearer",
        "user": {
            "id": str(user.id),
            "name": user.full_name,
            "email": user.email
        },
        "tenant": {
            "id": str(tenant.id),
            "name": tenant.name,
            "industry": tenant.industry
        },
        "role": role.name if role else None
    }

@router.post("/forgot-password")
async def forgot_password(
    data: ForgotPasswordRequest,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(
        User.email == data.email
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    old_otps = db.query(PasswordResetOTP).filter(
        PasswordResetOTP.email == data.email
    ).all()

    for old_otp in old_otps:
        db.delete(old_otp)

    db.commit()

    otp = str(random.randint(100000, 999999))

    otp_hash = hash_password(otp)

    reset_otp = PasswordResetOTP(
        email=data.email,
        otp_hash=otp_hash,
        expires_at=datetime.utcnow() + timedelta(minutes=10),
        attempts=0
    )

    db.add(reset_otp)
    db.commit()

    await send_otp_email(
        data.email,
        otp
    )

    return {
        "message": "Password reset OTP sent successfully",
        "email": data.email
    }

@router.post("/verify-reset-otp")
def verify_reset_otp(
    data: VerifyResetOTPRequest,
    db: Session = Depends(get_db)
):
    otp_record = db.query(PasswordResetOTP).filter(
        PasswordResetOTP.email == data.email
    ).first()

    if not otp_record:
        raise HTTPException(
            status_code=400,
            detail="OTP not found. Please request a new OTP."
        )

    if datetime.utcnow() > otp_record.expires_at:
        db.delete(otp_record)
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="OTP has expired. Please request a new OTP."
        )

    if otp_record.attempts >= 5:
        db.delete(otp_record)
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="Too many attempts. Please request a new OTP."
        )

    otp_record.attempts += 1

    if not verify_password(
        data.otp,
        otp_record.otp_hash
    ):
        db.commit()

        raise HTTPException(
            status_code=400,
            detail="Invalid OTP"
        )

    reset_token = create_password_reset_token(
        data.email
    )

    db.delete(otp_record)
    db.commit()

    return {
        "message": "OTP verified successfully",
        "reset_token": reset_token
    }

@router.post("/reset-password")
def reset_password(
    data: ResetPasswordRequest,
    db: Session = Depends(get_db)
):
    if data.new_password != data.confirm_password:
        raise HTTPException(
            status_code=400,
            detail="Passwords do not match"
        )

    payload = decode_access_token(data.reset_token)

    if payload.get("purpose") != "password_reset":
        raise HTTPException(
            status_code=401,
            detail="Invalid password reset token"
        )

    token_email = payload.get("email")

    if token_email != data.email:
        raise HTTPException(
            status_code=401,
            detail="Invalid password reset token"
        )

    user = db.query(User).filter(
        User.email == data.email
    ).first()

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found"
        )

    user.password = hash_password(data.new_password)

    db.commit()

    return {
        "message": "Password reset successfully"
    }