"""Pydantic schemas for Bean resources."""
from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class BeanBase(BaseModel):
    name: str = Field(..., max_length=255)
    roaster: str | None = Field(None, max_length=255)
    origin: str | None = Field(None, max_length=255)
    process: str | None = Field(None, max_length=120)
    roast_level: str | None = Field(None, max_length=120)
    elevation_m: int | None = Field(None)
    notes: str | None = Field(None, max_length=5000)


class BeanCreate(BeanBase):
    pass


class BeanUpdate(BaseModel):
    name: str | None = Field(None, max_length=255)
    roaster: str | None = Field(None, max_length=255)
    origin: str | None = Field(None, max_length=255)
    process: str | None = Field(None, max_length=120)
    roast_level: str | None = Field(None, max_length=120)
    elevation_m: int | None = Field(None)
    notes: str | None = Field(None, max_length=5000)


class BeanRead(BeanBase):
    id: str
    created_at: datetime
    updated_at: datetime
    first_used_at: date | None = None
    last_used_at: date | None = None
    avg_rating: float | None = None
    brew_count: int = 0
    model_config = ConfigDict(from_attributes=True)


class BeanImport(BeanCreate):
    id: str | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None


class BeanListResponse(BaseModel):
    items: list[BeanRead]
    total: int
