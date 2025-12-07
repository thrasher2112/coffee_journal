"""Pydantic schemas for Brew resources."""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional

from pydantic import BaseModel, Field, ConfigDict, field_validator


class AgitationEvent(BaseModel):
    timestamp_s: int
    action: str
    amount_g: Optional[float] = None


def _dedupe_tags(value: Optional[List[str]]):
    if not value:
        return value
    return sorted({tag.strip() for tag in value if tag})


class BrewBase(BaseModel):
    date: date
    bean_id: str
    bean_weight_g: float = Field(..., gt=0)
    water_weight_g: float = Field(..., gt=0)
    brew_style: Optional[str] = Field(None, max_length=50)
    grind_setting: Optional[str] = Field(None, max_length=120)
    grind_setting_notes: Optional[str] = Field(None)
    grinder_name: Optional[str] = Field(None, max_length=120)
    water_temp_c: Optional[int] = Field(None)
    bloom_time_s: Optional[int] = Field(None)
    total_brew_time_s: Optional[int] = Field(None)
    agitation_events: Optional[List[AgitationEvent]] = Field(None)
    tasting_notes: Optional[str] = Field(None)
    flavor_tags: Optional[List[str]] = Field(None)
    aroma_tags: Optional[List[str]] = Field(None)
    rating: Optional[int] = Field(None, ge=1, le=10)
    aroma_rating: Optional[int] = Field(None, ge=1, le=10)
    flavor_rating: Optional[int] = Field(None, ge=1, le=10)

    @field_validator("flavor_tags", "aroma_tags")
    def dedupe_tags(cls, value: Optional[List[str]]):
        return _dedupe_tags(value)


class BrewCreate(BrewBase):
    pass


class BrewUpdate(BaseModel):
    date: Optional[date]
    bean_id: Optional[str]
    bean_weight_g: Optional[float] = Field(None, gt=0)
    water_weight_g: Optional[float] = Field(None, gt=0)
    brew_style: Optional[str] = Field(None, max_length=50)
    grind_setting: Optional[str] = Field(None, max_length=120)
    grind_setting_notes: Optional[str] = Field(None)
    grinder_name: Optional[str] = Field(None, max_length=120)
    water_temp_c: Optional[int] = Field(None)
    bloom_time_s: Optional[int] = Field(None)
    total_brew_time_s: Optional[int] = Field(None)
    agitation_events: Optional[List[AgitationEvent]] = Field(None)
    tasting_notes: Optional[str] = Field(None)
    flavor_tags: Optional[List[str]] = Field(None)
    aroma_tags: Optional[List[str]] = Field(None)
    rating: Optional[int] = Field(None, ge=1, le=10)
    aroma_rating: Optional[int] = Field(None, ge=1, le=10)
    flavor_rating: Optional[int] = Field(None, ge=1, le=10)

    @field_validator("flavor_tags", "aroma_tags")
    def dedupe_tags(cls, value: Optional[List[str]]):
        return _dedupe_tags(value)


class BrewRead(BrewBase):
    id: str
    created_at: datetime
    updated_at: datetime
    ratio: Optional[float]
    bean_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class BrewListResponse(BaseModel):
    items: List[BrewRead]
    total: int


class MetricsOverview(BaseModel):
    top_beans: List[dict]
    recent_brews: List[dict]
    rating_trends: List[dict]


class ExportPayload(BaseModel):
    beans: List["BeanRead"]
    brews: List[BrewRead]


class ImportPayload(BaseModel):
    beans: List["BeanImport"] = Field(default_factory=list)
    brews: List["BrewImport"] = Field(default_factory=list)


class BrewImport(BrewCreate):
    id: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None


from .bean import BeanRead, BeanImport  # noqa: E402  (circular reference resolution)
