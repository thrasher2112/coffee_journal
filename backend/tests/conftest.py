"""Pytest fixtures for API tests."""
from __future__ import annotations

import os

# Set DEBUG before any app imports so Settings.__post_init__ won't raise
os.environ.setdefault("DEBUG", "true")

from typing import Generator
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
if str(SRC) not in sys.path:
    sys.path.append(str(SRC))

from coffee_journal.auth import get_current_user  # noqa: E402
from coffee_journal.db import Base, get_db  # noqa: E402
from coffee_journal.main import app  # noqa: E402
from coffee_journal.models.user import User  # noqa: E402
from coffee_journal.rate_limit import limiter  # noqa: E402

engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
    future=True,
)
TestingSessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)

Base.metadata.create_all(bind=engine)

# Disable rate limiting during tests
limiter.enabled = False


@pytest.fixture()
def db_session() -> Generator:
    connection = engine.connect()
    transaction = connection.begin()
    session = TestingSessionLocal(bind=connection)
    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


@pytest.fixture()
def test_user(db_session) -> User:
    """Create a primary test user."""
    user = User(email="test@example.com", display_name="Test User")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def second_user(db_session) -> User:
    """Create a second user for tenant isolation tests."""
    user = User(email="other@example.com", display_name="Other User")
    db_session.add(user)
    db_session.commit()
    db_session.refresh(user)
    return user


@pytest.fixture()
def client(db_session):
    """Unauthenticated test client (for health checks etc.)."""

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    yield TestClient(app)
    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture()
def auth_client(db_session, test_user):
    """Authenticated test client for the primary test user."""

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_current_user] = lambda: test_user

    yield TestClient(app)

    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)


@pytest.fixture()
def make_client(db_session):
    """Factory fixture: returns a function that creates an authenticated TestClient for a given user.

    Usage in tests:
        client_a = make_client(user_a)
        client_b = make_client(user_b)
        # Switch between users by calling make_client again — it swaps the global override.
    """

    def override_get_db():
        try:
            yield db_session
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db

    def _make(user: User) -> TestClient:
        app.dependency_overrides[get_current_user] = lambda: user
        return TestClient(app)

    yield _make

    app.dependency_overrides.pop(get_db, None)
    app.dependency_overrides.pop(get_current_user, None)
