from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    DATABASE_URL: str

    SMTP_HOST: str
    SMTP_PORT: int
    SMTP_USERNAME: str
    SMTP_PASSWORD: str
    SMTP_FROM_EMAIL: str

    JWT_SECRET_KEY: str
    JWT_ALGORITHM: str
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int

    MFA_ENCRYPTION_KEY: str
    PLATFORM_BOOTSTRAP_TOKEN: str | None = None
    # Secret used to derive each tenant's inbound-email webhook token. Webhook is disabled when unset.
    EMAIL_WEBHOOK_SECRET: str | None = None

    FRONTEND_URL: str
    # Frontend route of the platform-employee login page; used in the appointment email link.
    PLATFORM_LOGIN_PATH: str = "/platform/login"

    CLOUDINARY_CLOUD_NAME: str
    CLOUDINARY_API_KEY: str
    CLOUDINARY_API_SECRET: str

    OLLAMA_BASE_URL: str = "http://localhost:11434"
    OLLAMA_MODEL: str = "llama3.2:1b"
    OLLAMA_TIMEOUT_SECONDS: int = 45
    OLLAMA_MAX_RETRIES: int = 2
    OLLAMA_TEMPERATURE: float = 0.1

    # Configurable real estate booking hold and rolling schedule settings
    WALKIN_SALE_BOOKING_HOLD_HOURS: int = 48
    PORTAL_BOOKING_INITIAL_HOLD_HOURS: int = 24
    PORTAL_BOOKING_APPROVED_HOLD_HOURS: int = 48
    RENTAL_BOOKING_HOLD_HOURS: int = 48
    OPEN_ENDED_RENTAL_INITIAL_MONTHS: int = 12
    OPEN_ENDED_RENTAL_EXTENSION_THRESHOLD_MONTHS: int = 3
    OPEN_ENDED_RENTAL_EXTENSION_HORIZON_MONTHS: int = 12

    model_config = SettingsConfigDict(
        env_file=".env",
        extra="ignore"
    )


settings = Settings()

_engine_kwargs = (
    {"connect_args": {"check_same_thread": False}}
    if settings.DATABASE_URL.startswith("sqlite")
    else {
        "pool_size": 10,
        "max_overflow": 10,
        "pool_timeout": 30,
        "pool_recycle": 1800,
        "pool_pre_ping": True,
    }
)

engine = create_engine(settings.DATABASE_URL, **_engine_kwargs)

SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine,
)

Base = declarative_base()