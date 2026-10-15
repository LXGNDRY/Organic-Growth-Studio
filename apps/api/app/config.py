from functools import lru_cache
from typing import Literal
from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

MIN_JWT_SECRET_LENGTH = 32
INSECURE_JWT_SECRETS = {"change-me", "change-me-in-production"}

class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    environment: Literal["development", "staging", "production"] = "development"
    port: int = 8000
    log_level: str = "info"
    database_url: str = Field(alias="DATABASE_URL")
    database_url_sync: str = Field(alias="DATABASE_URL_SYNC")
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret_key: str = "change-me"
    jwt_algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    instagram_app_id: str = ""
    instagram_app_secret: str = ""
    instagram_redirect_uri: str = ""
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_webhook_secret: str = ""
    stripe_price_starter: str = ""
    stripe_price_growth: str = ""
    stripe_price_scale: str = ""
    stripe_price_agency: str = ""
    sentry_dsn: str | None = None

    @model_validator(mode="after")
    def reject_insecure_jwt_secret(self) -> "Settings":
        # Fail fast: staging/production must never boot with a forgeable signing key.
        key = self.jwt_secret_key
        weak = key in INSECURE_JWT_SECRETS or len(key) < MIN_JWT_SECRET_LENGTH
        if self.environment != "development" and weak:
            raise ValueError(
                f"JWT_SECRET_KEY must be unique and at least {MIN_JWT_SECRET_LENGTH} "
                f"characters when ENVIRONMENT={self.environment}"
            )
        return self

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

    @property
    def is_production(self) -> bool:
        return self.environment == "production"

@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
