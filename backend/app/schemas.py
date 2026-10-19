"""Request and response models."""

from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator

Kind = Literal["positive", "negative"]

ACCENTS = ["verdigris", "brass", "madder", "indigo", "moss", "iron", "plum", "cobalt"]


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
    icon: str = Field(default="circle", max_length=40)
    accent: str = Field(default="verdigris")
    start_date: date
    target_per_week: int | None = Field(default=None, ge=1, le=7)
    allows_planned: bool = False
    unit: str | None = Field(default=None, max_length=24)
    notes: str | None = Field(default=None, max_length=2000)

    @field_validator("accent")
    @classmethod
    def known_accent(cls, value: str) -> str:
        if value not in ACCENTS:
            raise ValueError(f"accent must be one of {', '.join(ACCENTS)}")
        return value


class HabitPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    icon: str | None = Field(default=None, max_length=40)
    accent: str | None = None
    start_date: date | None = None
    target_per_week: int | None = Field(default=None, ge=1, le=7)
    allows_planned: bool | None = None
    unit: str | None = Field(default=None, max_length=24)
    notes: str | None = Field(default=None, max_length=2000)
    archived: bool | None = None

    @field_validator("accent")
    @classmethod
    def known_accent(cls, value: str | None) -> str | None:
        if value is not None and value not in ACCENTS:
            raise ValueError(f"accent must be one of {', '.join(ACCENTS)}")
        return value


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
