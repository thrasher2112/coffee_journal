"""Bean model."""
from __future__ import annotations

from datetime import datetime, timezone
from typing import List, Optional
from uuid import uuid4

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from ..db import Base


class Bean(Base):
    """Represents a coffee bean entry for reuse in brews."""

    __tablename__ = "beans"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid4()), unique=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    roaster: Mapped[Optional[str]] = mapped_column(String(255))
    origin: Mapped[Optional[str]] = mapped_column(String(255))
    process: Mapped[Optional[str]] = mapped_column(String(120))
    roast_level: Mapped[Optional[str]] = mapped_column(String(120))
    notes: Mapped[Optional[str]] = mapped_column(Text)
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

    brews: Mapped[List["Brew"]] = relationship(
        "Brew", back_populates="bean", cascade="all, delete", passive_deletes=True
    )

    def __repr__(self) -> str:  # pragma: no cover - debugging helper
        return f"<Bean id={self.id} name={self.name!r}>"
