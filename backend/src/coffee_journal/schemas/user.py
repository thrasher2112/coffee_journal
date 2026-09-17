"""Pydantic schemas for authentication and user endpoints."""
from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, EmailStr, Field, StringConstraints

GrinderName = Annotated[str, StringConstraints(min_length=1, max_length=120)]


class MagicLinkRequest(BaseModel):
    """Request body for requesting a magic link."""

    email: EmailStr


class UserRead(BaseModel):
    """Public user representation."""

    id: str
    email: str
    display_name: str | None = None
    created_at: datetime


class PreferencesRead(BaseModel):
    """Stored preferences. Null means the user has never set that value."""

    temperature_unit: Literal["celsius", "fahrenheit"] | None = None
    grinders: list[GrinderName] | None = None
    preferred_grinder: str | None = None

    model_config = {"from_attributes": True}


class PreferencesUpdate(BaseModel):
    """Partial update - omitted fields are left alone."""

    temperature_unit: Literal["celsius", "fahrenheit"] | None = None
    # Bounded so a client cannot use preferences as unmetered storage.
    grinders: list[GrinderName] | None = Field(default=None, max_length=50)
    preferred_grinder: GrinderName | None = None
