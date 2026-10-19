"""Small helpers shared across modules."""

from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

# All dates in this app are local dates, never UTC. A habit logged at 00:30 on
# Monday belongs to Monday in the user's own timezone, so every "today" in the
# app resolves through this.
TZ = ZoneInfo(os.environ.get("TZ", "Asia/Kolkata"))


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def today() -> date:
    return datetime.now(TZ).date()


def parse_date(value: str) -> date:
    return date.fromisoformat(value)


def iso(value: date) -> str:
    return value.isoformat()


def date_range(start: date, end: date):
    """Yield every date from start to end inclusive."""
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)
