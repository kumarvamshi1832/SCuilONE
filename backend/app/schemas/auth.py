
from pydantic import BaseModel, EmailStr, Field, model_validator

from app.core.password_policy import validate_password


class RegisterRequest(BaseModel):
    company_name: str = Field(min_length=2, max_length=150)
    company_email: EmailStr
    phone: str = Field(min_length=7, max_length=20)
    industry: str = Field(min_length=2, max_length=100)
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    password: str = Field(min_length=15, max_length=128)
    confirm_password: str = Field(min_length=15, max_length=128)

    @model_validator(mode="after")
    def validate_passwords(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")

        validate_password(
            self.password,
            [
                self.email,
                self.company_email,
                self.full_name,
                self.company_name,
            ],
        )
        return self


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class VerifyResetOTPRequest(BaseModel):
    email: EmailStr
    otp: str


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    reset_token: str
    new_password: str = Field(min_length=15, max_length=128)
    confirm_password: str = Field(min_length=15, max_length=128)

    @model_validator(mode="after")
    def validate_passwords(self):
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match")

        validate_password(
            self.new_password,
            [self.email],
        )
        return self


class ChangeTemporaryPasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=15, max_length=128)
    confirm_password: str = Field(min_length=15, max_length=128)

    @model_validator(mode="after")
    def validate_passwords(self):
        if self.new_password != self.confirm_password:
            raise ValueError("Passwords do not match")

        if self.current_password == self.new_password:
            raise ValueError(
                "New password must differ from current password"
            )

        validate_password(self.new_password)
        return self


class ProfileCompletionRequest(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    phone: str = Field(min_length=7, max_length=20)
    job_title: str = Field(min_length=2, max_length=100)


class InvitationSetupRequest(BaseModel):
    invitation_token: str = Field(min_length=20)
    password: str = Field(min_length=15, max_length=128)
    confirm_password: str = Field(min_length=15, max_length=128)

    @model_validator(mode="after")
    def validate_passwords(self):
        if self.password != self.confirm_password:
            raise ValueError("Passwords do not match")

        validate_password(self.password)
        return self




class MFAEnrollmentStartRequest(BaseModel):
    mfa_token: str = Field(min_length=1)


class MFAEnrollmentVerifyRequest(BaseModel):
    mfa_token: str = Field(min_length=1)
    code: str = Field(pattern=r"^\d{6}$")


class MFAVerifyRequest(BaseModel):
    mfa_token: str = Field(min_length=1)
    code: str = Field(min_length=6, max_length=32)
    email: EmailStr | None = None
