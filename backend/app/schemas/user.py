
from pydantic import BaseModel, EmailStr, Field, model_validator

from app.core.password_policy import validate_password


class UserCreate(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    email: EmailStr
    role: str = Field(min_length=2, max_length=100)


class UserUpdate(BaseModel):
    role: str
    status: str


class UserProfileUpdate(BaseModel):
    full_name: str = Field(min_length=2, max_length=150)
    phone: str | None = Field(default=None, max_length=20, pattern=r"^\+?[0-9][0-9\s().-]{5,18}[0-9]$")
    job_title: str | None = Field(default=None, max_length=100)

    @model_validator(mode="after")
    def validate_profile_values(self):
        self.full_name = self.full_name.strip()
        if len(self.full_name) < 2:
            raise ValueError("full_name must contain at least two non-whitespace characters.")
        if self.phone is not None:
            self.phone = self.phone.strip()
            if not self.phone:
                raise ValueError("phone cannot be blank when supplied.")
        if self.job_title is not None:
            self.job_title = self.job_title.strip()
        return self


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=15, max_length=128)
    confirm_password: str = Field(min_length=15, max_length=128)

    @model_validator(mode="after")
    def validate_passwords(self):
        if self.new_password != self.confirm_password:
            raise ValueError(
                "New password and confirmation do not match"
            )

        if self.current_password == self.new_password:
            raise ValueError(
                "New password must be different from the current password"
            )

        validate_password(self.new_password)
        return self
