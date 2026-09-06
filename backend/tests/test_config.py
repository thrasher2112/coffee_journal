"""Tests for production configuration guards."""
from __future__ import annotations

import pytest

from coffee_journal.config import Settings, normalize_database_url


def _make_settings(**overrides):
    """Create a Settings instance with explicit kwargs (bypasses env defaults)."""
    defaults = {
        "debug": False,
        "jwt_secret": "a-very-long-production-secret-that-is-at-least-32-chars",
        "cookie_secure": True,
    }
    defaults.update(overrides)
    return Settings(**defaults)


def test_prod_rejects_default_jwt_secret():
    with pytest.raises(RuntimeError, match="JWT_SECRET must be set"):
        _make_settings(jwt_secret="dev-secret-change-me")


def test_prod_rejects_short_jwt_secret():
    with pytest.raises(RuntimeError, match="at least 32 characters"):
        _make_settings(jwt_secret="too-short")


def test_prod_rejects_insecure_cookie():
    with pytest.raises(RuntimeError, match="COOKIE_SECURE"):
        _make_settings(cookie_secure=False)


def test_prod_accepts_valid_config():
    s = _make_settings()
    assert s.cookie_secure is True
    assert len(s.jwt_secret) >= 32


def test_debug_mode_allows_defaults():
    s = _make_settings(
        debug=True,
        jwt_secret="dev-secret-change-me",
        cookie_secure=False,
    )
    assert s.debug is True


# --- DATABASE_URL driver normalisation -------------------------------------
#
# Every managed provider hands out a bare "postgresql://". SQLAlchemy reads that
# as psycopg2, which is not installed, so an unedited paste used to kill the app
# at boot with a ModuleNotFoundError that named nothing relevant.


@pytest.mark.parametrize("scheme", ["postgresql", "postgres"])
def test_bare_postgres_url_is_pinned_to_psycopg(scheme):
    url = f"{scheme}://user:pw@ep-x.eu-central-1.aws.neon.tech/db?sslmode=require"
    assert normalize_database_url(url) == (
        "postgresql+psycopg://user:pw@ep-x.eu-central-1.aws.neon.tech/db?sslmode=require"
    )


def test_explicit_driver_is_left_alone():
    for url in (
        "postgresql+psycopg://user:pw@host/db",
        "postgresql+asyncpg://user:pw@host/db",
        "sqlite:///./local.db",
    ):
        assert normalize_database_url(url) == url


def test_settings_normalises_on_construction():
    s = _make_settings(database_url="postgres://user:pw@host/db?sslmode=require")
    assert s.database_url.startswith("postgresql+psycopg://")
