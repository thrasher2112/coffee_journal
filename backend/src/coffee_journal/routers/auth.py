"""Authentication endpoints: magic link login, verify, me, logout."""

from fastapi import APIRouter, Body, Depends, Request, Response
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from ..auth import (
    cleanup_expired_tokens,
    create_magic_link_token,
    create_session_jwt,
    get_current_user,
    verify_magic_link_token,
)
from ..config import settings
from ..db import get_db
from ..email import send_magic_link_email
from ..models.user import User
from ..rate_limit import limiter
from ..schemas.user import MagicLinkRequest, UserRead

router = APIRouter()


@router.post("/magic-link")
@limiter.limit("5/minute")
def request_magic_link(request: Request, body: MagicLinkRequest, db: Session = Depends(get_db)):
    """Send a magic link to the user's email."""
    cleanup_expired_tokens(db)
    email = body.email.lower().strip()
    token = create_magic_link_token(db, email)
    send_magic_link_email(email, token)
    return {"message": "Check your email for a sign-in link."}


@router.post("/verify")
def verify_token(token: str = Body(..., embed=True), db: Session = Depends(get_db)):
    """Verify a magic link token and set session cookie."""
    user = verify_magic_link_token(db, token)
    jwt_token = create_session_jwt(user)

    response = JSONResponse(content={"message": "Verified"})
    response.set_cookie(
        key="session",
        value=jwt_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        max_age=settings.jwt_expiry_hours * 3600,
        domain=settings.cookie_domain or None,
        path="/",
    )
    return response


@router.get("/me", response_model=UserRead)
def get_me(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user."""
    return current_user


@router.post("/logout")
def logout(
    response: Response,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Revoke all sessions and clear the session cookie."""
    current_user.token_version += 1
    db.add(current_user)
    db.commit()
    response.delete_cookie(
        key="session",
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        domain=settings.cookie_domain or None,
        path="/",
    )
    return {"message": "Logged out."}
