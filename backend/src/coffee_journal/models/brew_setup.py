"""BrewSetup model: a named, reusable starting point for logging a brew."""
from __future__ import annotations

from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import DateTime, Float, ForeignKey, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from ..db import Base

# Referenced by name in the migration and by the IntegrityError mapping in
# crud/setup.py.
UNIQUE_NAME_INDEX = "uq_brew_setups_user_lower_name"


class BrewSetup(Base):
    """A user-defined setup, e.g. "Office - Espresso" (DE1, 18 g, 1:3)."""

    __tablename__ = "brew_setups"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid4()))
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    brew_style: Mapped[str] = mapped_column(String(50), nullable=False)
    ratio: Mapped[float] = mapped_column(Float, nullable=False)
    dose_g: Mapped[float | None] = mapped_column(Float)
    grinder_name: Mapped[str | None] = mapped_column(String(120))
    grind_setting: Mapped[str | None] = mapped_column(String(120))
    target_time_s: Mapped[int | None] = mapped_column(Integer)
    machine_profile: Mapped[str | None] = mapped_column(String(120))
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

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<BrewSetup id={self.id} name={self.name!r}>"


# Names are unique per user, case-insensitively. A functional index works on
# both Postgres and SQLite. Note SQLite's lower() folds ASCII only, so there
# "É" and "é" count as different names; Postgres folds Unicode per its locale. Declared after the class so it can reference the
# mapped columns.
Index(UNIQUE_NAME_INDEX, BrewSetup.user_id, func.lower(BrewSetup.name), unique=True)
