"""Per-user brewing preferences."""

from fastapi import APIRouter, Depends, Request
from sqlalchemy.orm import Session

from ..auth import get_current_user
from ..db import get_db
from ..models.user import User
from ..rate_limit import limiter
from ..schemas.user import PreferencesRead, PreferencesUpdate

router = APIRouter()


@router.get("", response_model=PreferencesRead)
def get_preferences(current_user: User = Depends(get_current_user)) -> User:
    """Return this user's stored preferences."""
    return current_user


@router.put("", response_model=PreferencesRead)
@limiter.limit("30/minute")
def update_preferences(
    request: Request,
    body: PreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> User:
    """Update the fields the client sent, leaving the rest untouched."""
    # Explicit assignment rather than setattr over the payload: only these three
    # fields are writable here, and nothing on the request can reach anything
    # else on the user row.
    data = body.model_dump(exclude_unset=True)
    if "temperature_unit" in data:
        current_user.temperature_unit = data["temperature_unit"]
    if "grinders" in data:
        current_user.grinders = data["grinders"]
    if "preferred_grinder" in data:
        current_user.preferred_grinder = data["preferred_grinder"]

    db.add(current_user)
    db.commit()
    db.refresh(current_user)
    return current_user
