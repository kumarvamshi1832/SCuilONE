from pydantic import BaseModel, EmailStr


class RegisterRequest(BaseModel):
    company_name: str
    company_email: EmailStr
    phone: str
    industry: str
    full_name: str
    email: EmailStr
    password: str
    confirm_password: str


class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class VerifyResetOTPRequest(BaseModel):
    email: EmailStr
    otp: str


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    reset_token: str
    new_password: str
    confirm_password: str