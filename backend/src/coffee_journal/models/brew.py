"""Brew model."""
from __future__ import annotations

from datetime import UTC, date, datetime
from typing import TYPE_CHECKING, Any
from uuid import uuid4

from sqlalchemy import JSON, Date, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base

if TYPE_CHECKING:
    from .user import User


class Brew(Base):
    """Represents a single brew logged by the user."""

    __tablename__ = "brews"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4()), unique=True
    )
    user_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False, index=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    bean_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("beans.id", ondelete="CASCADE"), nullable=False
    )
    bean_weight_g: Mapped[float] = mapped_column(Float, nullable=False)
    water_weight_g: Mapped[float] = mapped_column(Float, nullable=False)
    brew_style: Mapped[str | None] = mapped_column(String(50))
    grind_setting: Mapped[str | None] = mapped_column(String(120))
    grind_setting_notes: Mapped[str | None] = mapped_column(Text)
    grinder_name: Mapped[str | None] = mapped_column(String(120))
    water_temp_c: Mapped[int | None] = mapped_column(Integer)
    aroma_rating: Mapped[int | None] = mapped_column(Integer)
    flavor_rating: Mapped[int | None] = mapped_column(Integer)
    bloom_time_s: Mapped[int | None] = mapped_column(Integer)
    total_brew_time_s: Mapped[int | None] = mapped_column(Integer)
    agitation_events: Mapped[Any | None] = mapped_column(JSON)
    tasting_notes: Mapped[str | None] = mapped_column(Text)
    flavor_tags: Mapped[Any | None] = mapped_column(JSON)
    aroma_tags: Mapped[Any | None] = mapped_column(JSON)
    rating: Mapped[int | None] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
        nullable=False,
    )

    user: Mapped[User] = relationship("User", back_populates="brews")
    bean = relationship("Bean", back_populates="brews")

    @property
    def ratio(self) -> float | None:
        if not self.bean_weight_g or not self.water_weight_g:
            return None
        return round(self.water_weight_g / self.bean_weight_g, 2)

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<Brew id={self.id} bean_id={self.bean_id}>"
