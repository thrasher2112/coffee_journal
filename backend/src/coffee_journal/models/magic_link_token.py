"""Magic link token model for passwordless authentication."""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base


class MagicLinkToken(Base):
    """Single-use token sent via email for passwordless login."""

    __tablename__ = "magic_link_tokens"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4()), unique=True
    )
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    # SHA-256 hex of the token that was emailed. The raw token is never stored:
    # it is a bearer credential, so a readable copy in the database would let
    # anyone with read access sign in as any user with a live row.
    # sha256 hex is 64 chars, same width the raw hex token used, so the column
    # is unchanged apart from its name.
    token_hash: Mapped[str] = mapped_column(
        String(64), nullable=False, unique=True, index=True
    )
    expires_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False
    )
    used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<MagicLinkToken id={self.id} email={self.email!r} used={self.used}>"
