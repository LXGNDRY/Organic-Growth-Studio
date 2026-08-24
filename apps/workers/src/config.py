from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")
    environment: Literal["development", "staging", "production"] = "development"
    log_level: str = "info"
    database_url: str = Field(alias="DATABASE_URL")
    database_url_sync: str = Field(alias="DATABASE_URL_SYNC")
    redis_url: str = "redis://localhost:6379/0"
    kafka_bootstrap_servers: str = "localhost:9092"
    nats_url: str = "nats://localhost:4222"
    max_concurrent_accounts: int = 100
    worker_id: str = "worker-1"
    default_warmup_days: int = 14
    default_initial_actions: int = 50
    default_max_daily_actions: int = 500
    max_consecutive_blocks: int = 3
    block_cooldown_minutes: int = 60
    proxy_provider: str = "brightdata"
    proxy_api_key: str = ""
    proxy_zone: str = ""
    sentry_dsn: str | None = None

    @property
    def is_development(self) -> bool:
        return self.environment == "development"

@lru_cache
def get_settings() -> Settings:
    return Settings()  # type: ignore[call-arg]
