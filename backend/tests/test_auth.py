"""Tests for authentication endpoints and flows."""
from __future__ import annotations

import hashlib
from datetime import UTC, datetime, timedelta

from coffee_journal.auth import create_magic_link_token, hash_magic_link_token
from coffee_journal.config import settings
from coffee_journal.email import send_magic_link_email
from coffee_journal.models.magic_link_token import MagicLinkToken
from coffee_journal.models.user import User


def issue_token(db_session, email: str) -> str:
    """Mint a sign-in link and return the RAW token.

    Tests cannot recover it from the database any more - only the hash is
    stored - which is the whole point of hashing at rest. This calls the same
    function the router does, so the raw value comes back the way it does when
    it is handed to the email.
    """
    return create_magic_link_token(db_session, email)


def token_row_for(db_session, token: str) -> MagicLinkToken:
    """Look up the stored row for a raw token, by its hash."""
    return (
        db_session.query(MagicLinkToken)
        .filter_by(token_hash=hash_magic_link_token(token))
        .first()
    )


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
    token = issue_token(db_session, "verify@example.com")
    token_row = token_row_for(db_session, token)

    resp = client.post("/api/auth/verify", json={"token": token})
    assert resp.status_code == 200
    assert "session" in resp.cookies

    # Token should now be used
    db_session.refresh(token_row)
    assert token_row.used is True


def test_verify_creates_new_user(client, db_session):
    token = issue_token(db_session, "newuser@example.com")
    client.post("/api/auth/verify", json={"token": token})

    user = db_session.query(User).filter_by(email="newuser@example.com").first()
    assert user is not None


def test_verify_reuses_existing_user(client, db_session):
    # First login creates user
    token1 = issue_token(db_session, "repeat@example.com")
    client.post("/api/auth/verify", json={"token": token1})

    user1 = db_session.query(User).filter_by(email="repeat@example.com").first()

    # Second login reuses same user
    token2 = issue_token(db_session, "repeat@example.com")
    client.post("/api/auth/verify", json={"token": token2})

    user2 = db_session.query(User).filter_by(email="repeat@example.com").first()
    assert user1.id == user2.id


def test_verify_expired_token(client, db_session):
    token = issue_token(db_session, "expired@example.com")
    token_row = token_row_for(db_session, token)

    # Manually expire it
    token_row.expires_at = datetime.now(UTC) - timedelta(minutes=1)
    db_session.commit()

    resp = client.post("/api/auth/verify", json={"token": token})
    assert resp.status_code == 400
    assert "expired" in resp.json()["detail"].lower()


def test_verify_used_token(client, db_session):
    token = issue_token(db_session, "used@example.com")

    # Use it once
    client.post("/api/auth/verify", json={"token": token})

    # Try again
    resp = client.post("/api/auth/verify", json={"token": token})
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
    token = issue_token(db_session, "revoke@example.com")
    verify_resp = client.post("/api/auth/verify", json={"token": token})
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


# --- Hardening from the pre-deployment security audit -----------------------


def test_raw_token_is_never_stored(db_session):
    """The database must hold only a hash.

    The raw token is a bearer credential: a readable copy meant anyone with
    database read access - a leaked URL, a backup, the provider console - could
    sign in as any user with a live row.
    """
    token = issue_token(db_session, "hash@example.com")

    rows = db_session.query(MagicLinkToken).all()
    assert rows, "expected a stored row"
    assert all(row.token_hash != token for row in rows)

    stored = token_row_for(db_session, token)
    assert stored is not None
    assert stored.token_hash == hashlib.sha256(token.encode("utf-8")).hexdigest()


def test_magic_link_puts_the_token_in_the_fragment(db_session, capsys):
    """A query string would be written into the API's own access log.

    The SPA and the API share an origin, so `GET /auth/verify?token=...` used to
    be logged verbatim on every sign-in. Fragments are never sent to the server.
    """
    token = issue_token(db_session, "fragment@example.com")
    send_magic_link_email("fragment@example.com", token)

    printed = capsys.readouterr().out
    assert "/auth/verify#token=" in printed
    assert "?token=" not in printed


def test_allowlist_blocks_an_unlisted_address(client, db_session, monkeypatch):
    monkeypatch.setattr(settings, "allowed_emails", "owner@example.com")

    resp = client.post("/api/auth/magic-link", json={"email": "stranger@example.com"})

    # Same response as the happy path: a different one would reveal who is
    # permitted. No token is minted and no mail is sent.
    assert resp.status_code == 200
    assert "Check your email" in resp.json()["message"]
    assert (
        db_session.query(MagicLinkToken).filter_by(email="stranger@example.com").count()
        == 0
    )


def test_allowlist_permits_a_listed_address_case_insensitively(
    client, db_session, monkeypatch
):
    monkeypatch.setattr(settings, "allowed_emails", " Owner@Example.com , other@example.com ")

    resp = client.post("/api/auth/magic-link", json={"email": "OWNER@example.com"})

    assert resp.status_code == 200
    assert (
        db_session.query(MagicLinkToken).filter_by(email="owner@example.com").count() == 1
    )


def test_allowlist_rejects_a_token_issued_before_it_tightened(
    client, db_session, monkeypatch
):
    """Removing someone from the allowlist must invalidate links already sent."""
    token = issue_token(db_session, "removed@example.com")
    monkeypatch.setattr(settings, "allowed_emails", "owner@example.com")

    resp = client.post("/api/auth/verify", json={"token": token})

    assert resp.status_code == 400
    assert db_session.query(User).filter_by(email="removed@example.com").first() is None


def test_empty_allowlist_leaves_registration_open(client, db_session, monkeypatch):
    """Unset means no restriction, so local dev and existing deploys are unchanged."""
    monkeypatch.setattr(settings, "allowed_emails", "")

    client.post("/api/auth/magic-link", json={"email": "anyone@example.com"})

    assert (
        db_session.query(MagicLinkToken).filter_by(email="anyone@example.com").count() == 1
    )
