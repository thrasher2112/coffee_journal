"""Configuration helpers for Coffee Journal."""
from __future__ import annotations

from dataclasses import dataclass
import os


@dataclass
class Settings:
    """Runtime configuration derived from environment variables."""

    app_name: str = "Coffee Journal"
    database_url: str = os.getenv(
        "DATABASE_URL",
        "postgresql+psycopg://postgres:postgres@localhost:5432/coffee_journal",
    )
    debug: bool = os.getenv("DEBUG", "false").lower() in {"1", "true", "yes"}
    api_url: str = os.getenv("API_URL", "http://localhost:8000")
    frontend_url: str = os.getenv("FRONTEND_URL", "http://localhost:3000")


settings = Settings()
