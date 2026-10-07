"""Pydantic schemas for brew setups."""
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from ..brew_styles import SETUP_BREW_STYLES

# Trimmed *before* the length checks, so "   " is rejected and padding does not
# count against the limit.
SetupName = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=80)
]
SetupBrewStyle = Literal[*SETUP_BREW_STYLES]
# allow_inf_nan=False: pydantic accepts NaN/Infinity on floats by default, and
# Python's json module will happily emit them.
Ratio = Annotated[float, Field(gt=0, le=30, allow_inf_nan=False)]
DoseG = Annotated[float, Field(gt=0, allow_inf_nan=False)]
Text120 = Annotated[str, StringConstraints(max_length=120)]


class SetupCreate(BaseModel):
    name: SetupName
    brew_style: SetupBrewStyle
    ratio: Ratio
    dose_g: DoseG | None = None
    grinder_name: Text120 | None = None
    grind_setting: Text120 | None = None
    target_time_s: int | None = Field(None, ge=0)
    machine_profile: Text120 | None = None


class SetupUpdate(BaseModel):
    """Partial update. Omitted fields are left alone.

    Optional fields sent as explicit null are cleared. ``name``, ``brew_style``
    and ``ratio`` cannot be cleared, so an explicit null on them is a 422.
    """

    name: SetupName | None = None
    brew_style: SetupBrewStyle | None = None
    ratio: Ratio | None = None
    dose_g: DoseG | None = None
    grinder_name: Text120 | None = None
    grind_setting: Text120 | None = None
    target_time_s: int | None = Field(None, ge=0)
    machine_profile: Text120 | None = None

    # Defaults are not validated, so this only fires when the client actually
    # sent the key - with null.
    @field_validator("name", "brew_style", "ratio")
    @classmethod
    def _required_not_null(cls, value):
        if value is None:
            raise ValueError("this field cannot be cleared")
        return value


class SetupRead(BaseModel):
    id: str
    name: str
    brew_style: str
    ratio: float
    dose_g: float | None = None
    grinder_name: str | None = None
    grind_setting: str | None = None
    target_time_s: int | None = None
    machine_profile: str | None = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)
