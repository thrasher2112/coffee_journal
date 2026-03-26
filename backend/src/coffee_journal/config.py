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

    # Auth
    jwt_secret: str = os.getenv("JWT_SECRET", "dev-secret-change-me")
    jwt_expiry_hours: int = int(os.getenv("JWT_EXPIRY_HOURS", "24"))
    resend_api_key: str = os.getenv("RESEND_API_KEY", "")
    magic_link_expiry_minutes: int = int(
        os.getenv("MAGIC_LINK_EXPIRY_MINUTES", "15")
    )
    cookie_secure: bool = os.getenv("COOKIE_SECURE", "false").lower() in {
        "1",
        "true",
        "yes",
    }
    cookie_domain: str = os.getenv("COOKIE_DOMAIN", "")

    def __post_init__(self):
        if not self.debug:
            if self.jwt_secret == "dev-secret-change-me":
                raise RuntimeError(
                    "JWT_SECRET must be set to a strong, unique value in production. "
                    "Set the JWT_SECRET environment variable."
                )
            if len(self.jwt_secret) < 32:
                raise RuntimeError(
                    "JWT_SECRET must be at least 32 characters in production."
                )
            if not self.cookie_secure:
                raise RuntimeError(
                    "COOKIE_SECURE must be set to 'true' in production. "
                    "Set the COOKIE_SECURE environment variable."
                )


settings = Settings()
