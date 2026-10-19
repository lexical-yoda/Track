#!/usr/bin/env python3
"""Fill a database with plausible data, for looking at the app during development.

    DATA_DIR=/tmp/track-dev python3 scripts/seed_demo.py

Creates the account `demo` with the password `demo-password-1`, two negative
habits and two positive ones, and about a year of entries. Never point this at
the real data directory: it refuses to run against a database that already has
habits in it.
"""

from __future__ import annotations

import os
import random
import sys
from datetime import date, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app import auth, repo  # noqa: E402
from app.db import get_conn, init_db  # noqa: E402

TODAY = date.today()
random.seed(7)


def main() -> int:
    if "DATA_DIR" not in os.environ:
        print("Set DATA_DIR first, so this cannot touch real data.", file=sys.stderr)
        return 1

    init_db()
    if get_conn().execute("SELECT COUNT(*) AS n FROM habits").fetchone()["n"] > 0:
        print("That database already has habits in it. Refusing to seed.", file=sys.stderr)
        return 1

    if not auth.is_initialised():
        auth.create_user("demo", "demo-password-1")

    reasons = {r["label"]: r["id"] for r in repo.list_reasons()}

    smoking = repo.create_habit(
        {
            "name": "Smoking",
            "kind": "negative",
            "icon": "circle",
            "accent": "madder",
            "start_date": TODAY - timedelta(days=300),
            "target_per_week": None,
            "allows_planned": True,
            "unit": "cigarettes",
            "notes": "Quit for the third time. The first two lasted 4 and 11 months.",
        }
    )
    sugar = repo.create_habit(
        {
            "name": "Late-night snacking",
            "kind": "negative",
            "icon": "circle",
            "accent": "brass",
            "start_date": TODAY - timedelta(days=70),
            "target_per_week": None,
            "allows_planned": False,
            "unit": None,
            "notes": None,
        }
    )
    gym = repo.create_habit(
        {
            "name": "Gym",
            "kind": "positive",
            "icon": "circle",
            "accent": "verdigris",
            "start_date": TODAY - timedelta(days=200),
            "target_per_week": 4,
            "allows_planned": False,
            "unit": "minutes",
            "notes": None,
        }
    )
    reading = repo.create_habit(
        {
            "name": "Reading",
            "kind": "positive",
            "icon": "circle",
            "accent": "cobalt",
            "start_date": TODAY - timedelta(days=120),
            "target_per_week": 7,
            "allows_planned": False,
            "unit": "pages",
            "notes": None,
        }
    )

    # Smoking: a handful of unplanned slips early on, then planned party-only
    # exceptions, so the streak maths has something interesting to chew on.
    for offset in (295, 288, 254, 203, 142, 96):
        repo.upsert_entry(
            smoking["id"],
            {
                "date": TODAY - timedelta(days=offset),
                "amount": random.choice([1, 2, 3, 5]),
                "note": None,
                "reason_id": reasons.get(random.choice(["Stress", "Party", "Travel"])),
                "planned": False,
            },
        )
    for offset in (62, 41, 18):
        repo.upsert_entry(
            smoking["id"],
            {
                "date": TODAY - timedelta(days=offset),
                "amount": random.choice([1, 2]),
                "note": "Wedding, two over the night." if offset == 41 else None,
                "reason_id": reasons.get("Party"),
                "planned": True,
            },
        )

    for offset in (58, 51, 44, 30, 22, 9, 3):
        repo.upsert_entry(
            sugar["id"],
            {
                "date": TODAY - timedelta(days=offset),
                "amount": None,
                "note": None,
                "reason_id": reasons.get(random.choice(["Stress", "Boredom"])),
                "planned": False,
            },
        )

    # Gym: roughly four days a week, more reliable lately.
    for offset in range(200):
        day = TODAY - timedelta(days=offset)
        chance = 0.72 if offset < 60 else 0.5
        if day.weekday() in (0, 2, 4, 5) and random.random() < chance:
            repo.upsert_entry(
                gym["id"],
                {
                    "date": day,
                    "amount": random.choice([40, 45, 50, 60, 75]),
                    "note": None,
                    "reason_id": None,
                    "planned": False,
                },
            )

    for offset in range(120):
        day = TODAY - timedelta(days=offset)
        if random.random() < 0.6:
            repo.upsert_entry(
                reading["id"],
                {
                    "date": day,
                    "amount": random.choice([10, 15, 20, 30, 40]),
                    "note": None,
                    "reason_id": None,
                    "planned": False,
                },
            )

    print("Seeded. Sign in as demo / demo-password-1")
    return 0


if __name__ == "__main__":
    sys.exit(main())
