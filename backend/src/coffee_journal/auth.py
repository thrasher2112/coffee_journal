"""Core authentication: magic links, JWT sessions, FastAPI dependencies."""
from __future__ import annotations

import secrets
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import jwt
from fastapi import Cookie, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .models.magic_link_token import MagicLinkToken
from .models.user import User


def cleanup_expired_tokens(db: Session) -> int:
    """Delete expired and used magic link tokens. Returns number of rows deleted."""
    now = datetime.now(timezone.utc)
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
    token = secrets.token_hex(32)  # 64-char hex string
    expires_at = datetime.now(timezone.utc) + timedelta(
        minutes=settings.magic_link_expiry_minutes
    )
    record = MagicLinkToken(email=email.lower().strip(), token=token, expires_at=expires_at)
    db.add(record)
    db.commit()
    return token


def verify_magic_link_token(db: Session, token: str) -> User:
    """Verify a magic link token and return the associated user.

    Creates the user if this is their first login.
    Raises HTTPException on invalid/expired/used tokens.
    """
    record = (
        db.query(MagicLinkToken)
        .filter(MagicLinkToken.token == token)
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
    if record.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="This link has expired.",
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
    now = datetime.now(timezone.utc)
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
