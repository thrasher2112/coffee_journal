"""Brew model."""
from __future__ import annotations

from datetime import datetime, date, timezone
from typing import Any, Optional
from uuid import uuid4

from sqlalchemy import Date, DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base


class Brew(Base):
    """Represents a single brew logged by the user."""

    __tablename__ = "brews"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4()), unique=True
    )
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    bean_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("beans.id", ondelete="CASCADE"), nullable=False
    )
    bean_weight_g: Mapped[float] = mapped_column(Float, nullable=False)
    water_weight_g: Mapped[float] = mapped_column(Float, nullable=False)
    brew_style: Mapped[Optional[str]] = mapped_column(String(50))
    grind_setting: Mapped[Optional[str]] = mapped_column(String(120))
    grind_setting_notes: Mapped[Optional[str]] = mapped_column(Text)
    water_temp_c: Mapped[Optional[int]] = mapped_column(Integer)
    bloom_time_s: Mapped[Optional[int]] = mapped_column(Integer)
    total_brew_time_s: Mapped[Optional[int]] = mapped_column(Integer)
    agitation_events: Mapped[Optional[Any]] = mapped_column(JSON)
    tasting_notes: Mapped[Optional[str]] = mapped_column(Text)
    flavor_tags: Mapped[Optional[Any]] = mapped_column(JSON)
    rating: Mapped[Optional[int]] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
        index=True,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )

    bean = relationship("Bean", back_populates="brews")

    @property
    def ratio(self) -> Optional[float]:
        if not self.bean_weight_g or not self.water_weight_g:
            return None
        return round(self.water_weight_g / self.bean_weight_g, 2)

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<Brew id={self.id} bean_id={self.bean_id}>"
