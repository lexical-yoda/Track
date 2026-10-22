"""Request and response models."""

from __future__ import annotations

import re
from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Kind = Literal["positive", "negative"]

DEFAULT_COLOR = "#3FA87B"
HEX_COLOR = re.compile(r"^#[0-9A-Fa-f]{6}$")

# An emoji can be several code points — a skin tone, a variation selector, a
# zero-width joiner sequence — so the limit is generous for one symbol and still
# far too small to hide anything in.
MAX_ICON = 16


def _check_color(value: str) -> str:
    if not HEX_COLOR.match(value):
        raise ValueError("colour must be a hex value like #3FA87B")
    return value.upper()


def _check_icon(value: str) -> str:
    cleaned = value.strip()
    if len(cleaned) > MAX_ICON:
        raise ValueError("symbol must be a single character or emoji")
    return cleaned


class SetupIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=8, max_length=200)


class LoginIn(BaseModel):
    username: str = Field(max_length=64)
    password: str = Field(max_length=200)


class PasswordChangeIn(BaseModel):
    current_password: str = Field(max_length=200)
    new_password: str = Field(min_length=8, max_length=200)


class HabitIn(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    kind: Kind
    icon: str = Field(default="", max_length=MAX_ICON)
    color: str = Field(default=DEFAULT_COLOR)
    start_date: date
    target_per_week: int | None = Field(default=None, ge=1, le=7)
    allows_planned: bool = False
    unit: str | None = Field(default=None, max_length=24)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("color")
    @classmethod
    def valid_color(cls, value: str) -> str:
        return _check_color(value)

    @field_validator("icon")
    @classmethod
    def valid_icon(cls, value: str) -> str:
        return _check_icon(value)


class HabitPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    icon: str | None = Field(default=None, max_length=MAX_ICON)
    color: str | None = None
    start_date: date | None = None
    target_per_week: int | None = Field(default=None, ge=1, le=7)
    allows_planned: bool | None = None
    unit: str | None = Field(default=None, max_length=24)
    notes: str | None = Field(default=None, max_length=2000)
    archived: bool | None = None

    @field_validator("color")
    @classmethod
    def valid_color(cls, value: str | None) -> str | None:
        return None if value is None else _check_color(value)

    @field_validator("icon")
    @classmethod
    def valid_icon(cls, value: str | None) -> str | None:
        return None if value is None else _check_icon(value)


class EntryIn(BaseModel):
    date: date
    amount: float | None = Field(default=None, ge=0, le=100_000)
    note: str | None = Field(default=None, max_length=2000)
    reason_id: int | None = None
    planned: bool = False


class ReorderIn(BaseModel):
    habit_ids: list[int]


class ReasonIn(BaseModel):
    label: str = Field(min_length=1, max_length=40)
