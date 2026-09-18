"""Configuration helpers for Coffee Journal."""
from __future__ import annotations

import os
from dataclasses import dataclass

# Managed Postgres providers (Neon, Render, Railway, Supabase) all hand out
# connection strings beginning "postgresql://" or "postgres://".
_BARE_POSTGRES_SCHEMES = ("postgresql://", "postgres://")


def normalize_database_url(url: str) -> str:
    """Pin a bare Postgres URL to the psycopg3 driver.

    SQLAlchemy reads a bare "postgresql://" as "use psycopg2", which this
    project does not install - so pasting a provider's connection string in
    verbatim would kill the app at boot with a ModuleNotFoundError that says
    nothing about the real problem. Rewriting here means the string can be
    copied across unedited. An explicit driver ("postgresql+asyncpg://", or
    "+psycopg" itself) is left exactly as given.
    """
    for scheme in _BARE_POSTGRES_SCHEMES:
        if url.startswith(scheme):
            return f"postgresql+psycopg://{url[len(scheme):]}"
    return url


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
    # Resend refuses any sender on a domain the account has not verified.
    # "onboarding@resend.dev" is their shared test sender and is allowed
    # without verification, but can only deliver to the Resend account's
    # own address - which is exactly the single-user case here.
    resend_from: str = os.getenv(
        "RESEND_FROM", "Coffee Journal <onboarding@resend.dev>"
    )
    magic_link_expiry_minutes: int = int(
        os.getenv("MAGIC_LINK_EXPIRY_MINUTES", "15")
    )
    cookie_secure: bool = os.getenv("COOKIE_SECURE", "false").lower() in {
        "1",
        "true",
        "yes",
    }
    cookie_domain: str = os.getenv("COOKIE_DOMAIN", "")

    # How many proxies sit in front of the app and append to X-Forwarded-For.
    # 0 (the default) means the app is reached directly, so that header is
    # attacker-controlled input and is ignored for rate limiting. Render needs
    # 3 (Cloudflare, which fronts every public service by default, then
    # Render's own internal load balancer, then one more - confirmed against
    # the live X-Forwarded-For chain). Setting this higher than the real hop
    # count lets callers forge their rate-limit identity, so it must match
    # the deployment.
    trusted_proxy_hops: int = int(os.getenv("TRUSTED_PROXY_HOPS", "0"))

    # Comma-separated addresses permitted to sign in. Empty means anyone who
    # can reach the app may create an account - sign-in is passwordless, so
    # requesting a link for an address you control is registration. Set this on
    # any deployment that is not meant to accept strangers.
    allowed_emails: str = os.getenv("ALLOWED_EMAILS", "")

    @property
    def allowed_email_set(self) -> frozenset[str]:
        """Parsed, normalised allowlist. Empty frozenset means "no restriction"."""
        return frozenset(
            entry.strip().lower()
            for entry in self.allowed_emails.split(",")
            if entry.strip()
        )

    def __post_init__(self):
        self.database_url = normalize_database_url(self.database_url)
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
