"""Tests for production configuration guards."""
from __future__ import annotations

import pytest

from coffee_journal.config import Settings


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
