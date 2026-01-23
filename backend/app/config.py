"""
Application Configuration
Uses pydantic-settings for environment variable management
"""

from functools import lru_cache
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore"
    )

    # Application
    APP_NAME: str = "ServicePro"
    APP_VERSION: str = "0.1.0"
    DEBUG: bool = False
    API_V1_PREFIX: str = "/api/v1"

    # MongoDB
    MONGO_URL: str = "mongodb://localhost:27017"
    DB_NAME: str = "servicepro"

    # JWT Authentication
    JWT_SECRET_KEY: str = "CHANGE_ME_IN_PRODUCTION_USE_SECURE_KEY"
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30

    # CORS
    CORS_ORIGINS: list[str] = ["*"]

    # Weather API (Phase 1D)
    OPENWEATHER_API_KEY: Optional[str] = None
    WEATHER_CACHE_TTL_MINUTES: int = 30

    # Twilio (Phase 1E)
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_PHONE_NUMBER: Optional[str] = None

    # Firebase (Phase 1E)
    FIREBASE_PROJECT_ID: Optional[str] = None
    FIREBASE_CREDENTIALS_PATH: Optional[str] = None

    # SendGrid (Phase 1E)
    SENDGRID_API_KEY: Optional[str] = None
    SENDGRID_FROM_EMAIL: str = "noreply@servicepro.app"
    SENDGRID_FROM_NAME: str = "ServicePro"

    # ElevenLabs (Phase 2)
    ELEVENLABS_API_KEY: Optional[str] = None

    # OpenAI (Phase 5 - Whisper transcription)
    OPENAI_API_KEY: Optional[str] = None

    # Anthropic (Phase 5 - Claude AI)
    ANTHROPIC_API_KEY: Optional[str] = None

    # Stripe (Phase 3)
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None

    # AWS S3 (Phase 3)
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_S3_BUCKET: Optional[str] = None
    AWS_REGION: str = "us-east-1"

    def is_production(self) -> bool:
        """Check if running in production mode"""
        return not self.DEBUG

    def validate_production_settings(self) -> list[str]:
        """Validate that production-critical settings are configured"""
        errors = []
        if self.is_production():
            if self.JWT_SECRET_KEY == "CHANGE_ME_IN_PRODUCTION_USE_SECURE_KEY":
                errors.append("JWT_SECRET_KEY must be changed in production")
            if "*" in self.CORS_ORIGINS:
                errors.append("CORS_ORIGINS should not be '*' in production")
        return errors


@lru_cache()
def get_settings() -> Settings:
    """Get cached settings instance"""
    return Settings()
