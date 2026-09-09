"""User model."""
from __future__ import annotations

from datetime import UTC, datetime
from typing import TYPE_CHECKING
from uuid import uuid4

from sqlalchemy import JSON, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base

if TYPE_CHECKING:
    from .bean import Bean
    from .brew import Brew


class User(Base):
    """Registered user of the coffee journal."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4()), unique=True
    )
    email: Mapped[str] = mapped_column(
        String(255), nullable=False, unique=True, index=True
    )
    display_name: Mapped[str | None] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )
    token_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Brewing preferences. These lived only in each browser's localStorage, so
    # they did not follow the account between devices and were lost whenever
    # site data was cleared. NULL means "never set on the server", which is
    # distinct from "set to empty" - the client keeps its own defaults until the
    # user changes something, and only then does a value get stored.
    temperature_unit: Mapped[str | None] = mapped_column(String(16))
    grinders: Mapped[list[str] | None] = mapped_column(JSON)
    preferred_grinder: Mapped[str | None] = mapped_column(String(255))

    beans: Mapped[list[Bean]] = relationship("Bean", back_populates="user")
    brews: Mapped[list[Brew]] = relationship("Brew", back_populates="user")

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<User id={self.id} email={self.email!r}>"
