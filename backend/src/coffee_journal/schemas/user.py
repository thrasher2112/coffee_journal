"""Pydantic schemas for authentication and user endpoints."""
from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr


class MagicLinkRequest(BaseModel):
    """Request body for requesting a magic link."""

    email: EmailStr


class UserRead(BaseModel):
    """Public user representation."""

    id: str
    email: str
    display_name: str | None = None
    created_at: datetime
