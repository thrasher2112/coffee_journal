"""Pydantic schemas for Bean resources."""
from __future__ import annotations

from datetime import datetime, date
from typing import Optional

from pydantic import BaseModel, Field, ConfigDict


class BeanBase(BaseModel):
    name: str = Field(..., max_length=255)
    roaster: Optional[str] = Field(None, max_length=255)
    origin: Optional[str] = Field(None, max_length=255)
    process: Optional[str] = Field(None, max_length=120)
    roast_level: Optional[str] = Field(None, max_length=120)
    notes: Optional[str] = Field(None)


class BeanCreate(BeanBase):
    pass


class BeanUpdate(BaseModel):
    name: Optional[str] = Field(None, max_length=255)
    roaster: Optional[str] = Field(None, max_length=255)
    origin: Optional[str] = Field(None, max_length=255)
    process: Optional[str] = Field(None, max_length=120)
    roast_level: Optional[str] = Field(None, max_length=120)
    notes: Optional[str] = Field(None)


class BeanRead(BeanBase):
    id: str
    created_at: datetime
    updated_at: datetime
    first_used_at: Optional[date] = None
    last_used_at: Optional[date] = None
    avg_rating: Optional[float] = None
    brew_count: int = 0
    model_config = ConfigDict(from_attributes=True)


class BeanImport(BeanCreate):
    id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


class BeanListResponse(BaseModel):
    items: list[BeanRead]
    total: int
