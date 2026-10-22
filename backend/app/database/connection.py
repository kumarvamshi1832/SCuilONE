from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import model_validator

BASE_DIR = Path(__file__).resolve().parent.parent.parent
ENV_FILE = BASE_DIR / ".env"


class Settings(BaseSettings):
    ENVIRONMENT: str = "development"
    DATABASE_URL: str = "postgresql+psycopg2://postgres:postgres@localhost:5432/scuilone_crm"

    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str | None = "noreply@scuilone.com"

    JWT_SECRET_KEY: str = "your-super-secret-key-change-this"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    MFA_ENCRYPTION_KEY: str = "default_mfa_encryption_key_32bytes_change_in_prod="

    FRONTEND_URL: str = "http://localhost:5173"

    CLOUDINARY_CLOUD_NAME: str | None = None
    CLOUDINARY_API_KEY: str | None = None
    CLOUDINARY_API_SECRET: str | None = None

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE) if ENV_FILE.exists() else ".env",
        extra="ignore"
    )

    @model_validator(mode="after")
    def validate_production_secrets(self):
        is_production = self.ENVIRONMENT.lower() == "production"
        if is_production:
            if (
                not self.MFA_ENCRYPTION_KEY
                or "change_in_prod" in self.MFA_ENCRYPTION_KEY
            ):
                raise ValueError(
                    "MFA_ENCRYPTION_KEY must be properly configured in production environment."
                )
            if (
                not self.JWT_SECRET_KEY
                or self.JWT_SECRET_KEY == "your-super-secret-key-change-this"
            ):
                raise ValueError(
                    "JWT_SECRET_KEY must be properly configured in production environment."
                )
        return self


settings = Settings()

engine = create_engine(settings.DATABASE_URL)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

Base = declarative_base()