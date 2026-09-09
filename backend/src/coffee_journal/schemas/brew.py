"""Pydantic schemas for Brew resources."""
from __future__ import annotations

import datetime as dt

from pydantic import BaseModel, ConfigDict, Field, field_validator


class AgitationEvent(BaseModel):
    timestamp_s: int
    action: str = Field(..., max_length=100)
    amount_g: float | None = None


def _dedupe_tags(value: list[str] | None):
    if not value:
        return value
    return sorted({tag.strip() for tag in value if tag})


class BrewBase(BaseModel):
    date: dt.date
    bean_id: str
    bean_weight_g: float = Field(..., gt=0)
    water_weight_g: float = Field(..., gt=0)
    brew_style: str | None = Field(None, max_length=50)
    grind_setting: str | None = Field(None, max_length=120)
    grind_setting_notes: str | None = Field(None, max_length=2000)
    grinder_name: str | None = Field(None, max_length=120)
    water_temp_c: int | None = Field(None)
    bloom_time_s: int | None = Field(None)
    total_brew_time_s: int | None = Field(None)
    agitation_events: list[AgitationEvent] | None = Field(None, max_length=100)
    tasting_notes: str | None = Field(None, max_length=5000)
    flavor_tags: list[str] | None = Field(None, max_length=50)
    aroma_tags: list[str] | None = Field(None, max_length=50)
    rating: int | None = Field(None, ge=1, le=10)
    aroma_rating: int | None = Field(None, ge=1, le=10)
    flavor_rating: int | None = Field(None, ge=1, le=10)

    @field_validator("flavor_tags", "aroma_tags")
    def dedupe_tags(cls, value: list[str] | None):
        return _dedupe_tags(value)


class BrewCreate(BrewBase):
    pass


class BrewUpdate(BaseModel):
    date: dt.date | None = None
    bean_id: str | None = None
    bean_weight_g: float | None = Field(None, gt=0)
    water_weight_g: float | None = Field(None, gt=0)
    brew_style: str | None = Field(None, max_length=50)
    grind_setting: str | None = Field(None, max_length=120)
    grind_setting_notes: str | None = Field(None, max_length=2000)
    grinder_name: str | None = Field(None, max_length=120)
    water_temp_c: int | None = Field(None)
    bloom_time_s: int | None = Field(None)
    total_brew_time_s: int | None = Field(None)
    agitation_events: list[AgitationEvent] | None = Field(None, max_length=100)
    tasting_notes: str | None = Field(None, max_length=5000)
    flavor_tags: list[str] | None = Field(None, max_length=50)
    aroma_tags: list[str] | None = Field(None, max_length=50)
    rating: int | None = Field(None, ge=1, le=10)
    aroma_rating: int | None = Field(None, ge=1, le=10)
    flavor_rating: int | None = Field(None, ge=1, le=10)

    @field_validator("flavor_tags", "aroma_tags")
    def dedupe_tags(cls, value: list[str] | None):
        return _dedupe_tags(value)


class BrewRead(BrewBase):
    id: str
    created_at: dt.datetime
    updated_at: dt.datetime
    ratio: float | None
    bean_name: str | None = None
    model_config = ConfigDict(from_attributes=True)


class BrewListResponse(BaseModel):
    items: list[BrewRead]
    total: int


class MetricsOverview(BaseModel):
    top_beans: list[dict]
    recent_brews: list[dict]
    rating_trends: list[dict]


class ExportPayload(BaseModel):
    beans: list[BeanRead]
    brews: list[BrewRead]
    # Preferences live on the account now, so a backup that omitted them would
    # not actually restore everything.
    preferences: PreferencesRead | None = None


class ImportPayload(BaseModel):
    beans: list[BeanImport] = Field(default_factory=list, max_length=500)
    brews: list[BrewImport] = Field(default_factory=list, max_length=2000)
    # Optional so older backup files, written before preferences were stored
    # server-side, still import cleanly.
    preferences: PreferencesUpdate | None = None


class BrewImport(BrewCreate):
    id: str | None = None
    created_at: dt.datetime | None = None
    updated_at: dt.datetime | None = None


from .bean import BeanImport, BeanRead
from .user import PreferencesRead, PreferencesUpdate
