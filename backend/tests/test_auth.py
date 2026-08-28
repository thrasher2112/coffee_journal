"""Tests for authentication endpoints and flows."""
from __future__ import annotations

from datetime import UTC, datetime, timedelta

from coffee_journal.models.magic_link_token import MagicLinkToken
from coffee_journal.models.user import User


def test_request_magic_link(client, db_session):
    resp = client.post("/api/auth/magic-link", json={"email": "hello@example.com"})
    assert resp.status_code == 200
    assert "Check your email" in resp.json()["message"]

    token_row = db_session.query(MagicLinkToken).filter_by(email="hello@example.com").first()
    assert token_row is not None
    assert token_row.used is False


def test_request_magic_link_invalid_email(client):
    resp = client.post("/api/auth/magic-link", json={"email": "not-an-email"})
    assert resp.status_code == 422


def test_verify_valid_token(client, db_session):
    # Request a magic link
    client.post("/api/auth/magic-link", json={"email": "verify@example.com"})
    token_row = db_session.query(MagicLinkToken).filter_by(email="verify@example.com").first()

    resp = client.post("/api/auth/verify", json={"token": token_row.token})
    assert resp.status_code == 200
    assert "session" in resp.cookies

    # Token should now be used
    db_session.refresh(token_row)
    assert token_row.used is True


def test_verify_creates_new_user(client, db_session):
    client.post("/api/auth/magic-link", json={"email": "newuser@example.com"})
    token_row = db_session.query(MagicLinkToken).filter_by(email="newuser@example.com").first()

    client.post("/api/auth/verify", json={"token": token_row.token})

    user = db_session.query(User).filter_by(email="newuser@example.com").first()
    assert user is not None


def test_verify_reuses_existing_user(client, db_session):
    # First login creates user
    client.post("/api/auth/magic-link", json={"email": "repeat@example.com"})
    token1 = db_session.query(MagicLinkToken).filter_by(email="repeat@example.com").first()
    client.post("/api/auth/verify", json={"token": token1.token})

    user1 = db_session.query(User).filter_by(email="repeat@example.com").first()

    # Second login reuses same user
    client.post("/api/auth/magic-link", json={"email": "repeat@example.com"})
    tokens = db_session.query(MagicLinkToken).filter_by(email="repeat@example.com", used=False).all()
    token2 = tokens[0]
    client.post("/api/auth/verify", json={"token": token2.token})

    user2 = db_session.query(User).filter_by(email="repeat@example.com").first()
    assert user1.id == user2.id


def test_verify_expired_token(client, db_session):
    client.post("/api/auth/magic-link", json={"email": "expired@example.com"})
    token_row = db_session.query(MagicLinkToken).filter_by(email="expired@example.com").first()

    # Manually expire it
    token_row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db_session.commit()

    resp = client.post("/api/auth/verify", json={"token": token_row.token})
    assert resp.status_code == 400
    assert "expired" in resp.json()["detail"].lower()


def test_verify_used_token(client, db_session):
    client.post("/api/auth/magic-link", json={"email": "used@example.com"})
    token_row = db_session.query(MagicLinkToken).filter_by(email="used@example.com").first()

    # Use it once
    client.post("/api/auth/verify", json={"token": token_row.token})

    # Try again
    resp = client.post("/api/auth/verify", json={"token": token_row.token})
    assert resp.status_code == 400
    assert "already been used" in resp.json()["detail"].lower()


def test_verify_nonexistent_token(client):
    resp = client.post("/api/auth/verify", json={"token": "doesnotexist"})
    assert resp.status_code == 400


def test_verify_get_returns_405(client):
    """GET /verify should no longer work — token must be POSTed."""
    resp = client.get("/api/auth/verify?token=anything")
    assert resp.status_code == 405


def test_me_authenticated(auth_client):
    resp = auth_client.get("/api/auth/me")
    assert resp.status_code == 200
    data = resp.json()
    assert data["email"] == "test@example.com"
    assert "id" in data


def test_me_unauthenticated(client):
    resp = client.get("/api/auth/me")
    assert resp.status_code == 401


def test_logout(auth_client):
    resp = auth_client.post("/api/auth/logout")
    assert resp.status_code == 200
    assert "Logged out" in resp.json()["message"]


def test_logout_revokes_old_session(client, db_session):
    """After logout, re-using the old JWT should return 401."""
    # Create user and log in via magic link
    client.post("/api/auth/magic-link", json={"email": "revoke@example.com"})
    token_row = db_session.query(MagicLinkToken).filter_by(email="revoke@example.com").first()
    verify_resp = client.post("/api/auth/verify", json={"token": token_row.token})
    assert verify_resp.status_code == 200

    session_cookie = verify_resp.cookies.get("session")
    assert session_cookie

    # Set the session cookie on the client instance (httpx 0.28 deprecated
    # per-request `cookies=`); it is sent on all subsequent requests.
    client.cookies.set("session", session_cookie)

    # Authenticated request works
    me_resp = client.get("/api/auth/me")
    assert me_resp.status_code == 200

    # Logout (bumps token_version)
    logout_resp = client.post("/api/auth/logout")
    assert logout_resp.status_code == 200

    # Re-use old session cookie — should be rejected
    me_resp2 = client.get("/api/auth/me")
    assert me_resp2.status_code == 401
    assert "revoked" in me_resp2.json()["detail"].lower()


def test_logout_unauthenticated_returns_401(client):
    resp = client.post("/api/auth/logout")
    assert resp.status_code == 401
