"""Configuration management using Pydantic Settings."""

from __future__ import annotations

from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Application settings loaded from environment variables."""

    database_url: str
    openai_api_key: str
    anthropic_api_key: str
    scrape_rate_limit: float = 1.0
    scrape_timeout: int = 30
    api_key: str
    frontend_url: str
    environment: Literal["development", "test", "production"] = "development"
    log_level: str = "INFO"

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )


settings = Settings()
