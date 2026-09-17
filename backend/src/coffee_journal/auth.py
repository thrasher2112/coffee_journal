"""Core authentication: magic links, JWT sessions, FastAPI dependencies."""
from __future__ import annotations

import hashlib
import secrets
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import jwt
from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models.magic_link_token import MagicLinkToken
from .models.user import User


def hash_magic_link_token(token: str) -> str:
    """SHA-256 hex of a raw magic link token.

    Only this is stored. No salt or slow KDF: the input is 256 bits of
    `secrets` output, so there is no dictionary to attack and nothing a work
    factor would buy. Lookup is by hash equality, which is also why no
    constant-time compare is needed - forging a matching hash would require the
    preimage, i.e. the token itself.
    """
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def is_email_allowed(email: str) -> bool:
    """Whether this address may sign in at all.

    Sign-in is passwordless, so requesting a link for an address you control IS
    registration - without this gate any stranger who reaches the app gets an
    account. An empty ALLOWED_EMAILS keeps the historical open behaviour.
    """
    allowed = settings.allowed_email_set
    return not allowed or email.strip().lower() in allowed


def cleanup_expired_tokens(db: Session) -> int:
    """Delete expired and used magic link tokens. Returns number of rows deleted."""
    now = datetime.now(UTC)
    deleted = (
        db.query(MagicLinkToken)
        .filter(
            (MagicLinkToken.used.is_(True)) | (MagicLinkToken.expires_at < now)
        )
        .delete(synchronize_session="fetch")
    )
    db.commit()
    return deleted


def create_magic_link_token(db: Session, email: str) -> str:
    """Create a single-use magic link token for the given email."""
    token = secrets.token_hex(32)  # 64-char hex string, 256 bits
    expires_at = datetime.now(UTC) + timedelta(
        minutes=settings.magic_link_expiry_minutes
    )
    record = MagicLinkToken(
        email=email.lower().strip(),
        token_hash=hash_magic_link_token(token),
        expires_at=expires_at,
    )
    db.add(record)
    db.commit()
    # The raw token is returned for the email and never persisted.
    return token


def verify_magic_link_token(db: Session, token: str) -> User:
    """Verify a magic link token and return the associated user.

    Creates the user if this is their first login.
    Raises HTTPException on invalid/expired/used tokens.
    """
    record = (
        db.query(MagicLinkToken)
        .filter(MagicLinkToken.token_hash == hash_magic_link_token(token))
        .first()
    )
    if not record:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired link.",
        )
    if record.used:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This link has already been used.",
        )
    # expires_at is DateTime(timezone=True): Postgres returns an aware value in
    # the session timezone, while SQLite (tests) returns a naive one. `.replace`
    # on an aware value overwrites the offset instead of converting it, which
    # pushed expiry LATER by the offset east of UTC - a 15-minute link stayed
    # valid for hours. Convert when aware, attach UTC only when naive.
    expires_at = record.expires_at
    expires_at = (
        expires_at.replace(tzinfo=UTC)
        if expires_at.tzinfo is None
        else expires_at.astimezone(UTC)
    )
    if expires_at < datetime.now(UTC):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This link has expired.",
        )

    # A token issued before the allowlist tightened must not still work.
    if not is_email_allowed(record.email):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid or expired link.",
        )

    # Mark token as used
    record.used = True
    db.add(record)

    # Find or create user
    email = record.email.lower().strip()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        user = User(email=email)
        db.add(user)

    db.commit()
    db.refresh(user)
    return user


def create_session_jwt(user: User) -> str:
    """Create a signed JWT for the given user."""
    now = datetime.now(UTC)
    payload = {
        "sub": user.id,
        "email": user.email,
        "jti": str(uuid4()),
        "token_version": user.token_version,
        "iss": "coffee-journal",
        "aud": "coffee-journal",
        "iat": now,
        "exp": now + timedelta(hours=settings.jwt_expiry_hours),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_session_jwt(token: str) -> dict:
    """Decode and verify a session JWT. Raises HTTPException on failure."""
    try:
        return jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=["HS256"],
            issuer="coffee-journal",
            audience="coffee-journal",
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired.",
        )
    except jwt.InvalidTokenError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid session.",
        )


def get_current_user(
    session: str | None = Cookie(None),
    db: Session = Depends(get_db),
) -> User:
    """FastAPI dependency that extracts the authenticated user from the session cookie."""
    if not session:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not authenticated.",
        )
    payload = decode_session_jwt(session)
    user = db.get(User, payload["sub"])
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found.",
        )
    # Reject tokens issued before the latest logout
    jwt_version = payload.get("token_version", 0)
    if jwt_version != user.token_version:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session revoked.",
        )
    return user
