"""Database queries, and the translation between rows and the shapes stats.py wants."""

from __future__ import annotations

import sqlite3
from datetime import date

from fastapi import HTTPException, status

from . import stats
from .db import get_conn, transaction
from .util import iso, now_iso, parse_date


def to_habit(row: sqlite3.Row) -> stats.Habit:
    return stats.Habit(
        id=row["id"],
        kind=row["kind"],
        start_date=parse_date(row["start_date"]),
        target_per_week=row["target_per_week"],
        allows_planned=bool(row["allows_planned"]),
    )


def to_entry(row: sqlite3.Row) -> stats.Entry:
    return stats.Entry(
        date=parse_date(row["date"]),
        planned=bool(row["planned"]),
        amount=row["amount"],
        reason=row["reason"] if "reason" in row.keys() else None,
        note=row["note"],
    )


def habit_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "name": row["name"],
        "kind": row["kind"],
        "icon": row["icon"],
        "color": row["color"],
        "start_date": row["start_date"],
        "target_per_week": row["target_per_week"],
        "allows_planned": bool(row["allows_planned"]),
        "unit": row["unit"],
        "notes": row["notes"],
        "sort_order": row["sort_order"],
        "archived": row["archived_at"] is not None,
    }


def entry_dict(row: sqlite3.Row) -> dict:
    return {
        "id": row["id"],
        "habit_id": row["habit_id"],
        "date": row["date"],
        "amount": row["amount"],
        "note": row["note"],
        "reason_id": row["reason_id"],
        "reason": row["reason"] if "reason" in row.keys() else None,
        "planned": bool(row["planned"]),
    }


ENTRY_SELECT = """
SELECT e.*, r.label AS reason
FROM entries e
LEFT JOIN reasons r ON r.id = e.reason_id
"""


def list_habits(include_archived: bool = False) -> list[sqlite3.Row]:
    clause = "" if include_archived else "WHERE archived_at IS NULL"
    return get_conn().execute(
        f"SELECT * FROM habits {clause} ORDER BY sort_order, id"
    ).fetchall()


def get_habit(habit_id: int) -> sqlite3.Row:
    row = get_conn().execute("SELECT * FROM habits WHERE id = ?", (habit_id,)).fetchone()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No such habit")
    return row


def list_entries(habit_id: int, since: date | None = None) -> list[sqlite3.Row]:
    if since is None:
        return get_conn().execute(
            f"{ENTRY_SELECT} WHERE e.habit_id = ? ORDER BY e.date", (habit_id,)
        ).fetchall()
    return get_conn().execute(
        f"{ENTRY_SELECT} WHERE e.habit_id = ? AND e.date >= ? ORDER BY e.date",
        (habit_id, iso(since)),
    ).fetchall()


def habit_with_entries(habit_id: int) -> tuple[sqlite3.Row, stats.Habit, list[stats.Entry]]:
    row = get_habit(habit_id)
    entries = [to_entry(e) for e in list_entries(habit_id)]
    return row, to_habit(row), entries


def summaries(today: date, include_archived: bool = False) -> list[dict]:
    """Every habit with its card-level summary, in display order.

    Entries for all habits come back in one query rather than one per habit: the
    data is small, and this keeps the Today screen to a single round trip.
    """
    habit_rows = list_habits(include_archived)
    if not habit_rows:
        return []

    ids = [row["id"] for row in habit_rows]
    placeholders = ",".join("?" * len(ids))
    entry_rows = get_conn().execute(
        f"{ENTRY_SELECT} WHERE e.habit_id IN ({placeholders}) ORDER BY e.date", ids
    ).fetchall()

    grouped: dict[int, list[stats.Entry]] = {habit_id: [] for habit_id in ids}
    raw: dict[int, dict[str, dict]] = {habit_id: {} for habit_id in ids}
    for row in entry_rows:
        grouped[row["habit_id"]].append(to_entry(row))
        raw[row["habit_id"]][row["date"]] = entry_dict(row)

    out = []
    for row in habit_rows:
        habit = to_habit(row)
        entries = grouped[row["id"]]
        by_date = raw[row["id"]]
        # Each week cell carries its own entry, so tapping any day in the strip
        # opens the log sheet already filled in without another request.
        week = [
            {**cell, "entry": by_date.get(cell["date"])}
            for cell in stats.week_cells(habit, entries, today)
        ]
        out.append(
            {
                **habit_dict(row),
                "summary": stats.summary(habit, entries, today),
                "today_entry": by_date.get(iso(today)),
                "week": week,
                # The last few entries, newest first, for the detail link.
                "recent": list(by_date.values())[-5:][::-1],
            }
        )
    return out


def create_habit(data: dict) -> sqlite3.Row:
    stamp = now_iso()
    with transaction() as conn:
        next_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM habits"
        ).fetchone()["n"]
        cursor = conn.execute(
            "INSERT INTO habits (name, kind, icon, color, start_date, target_per_week,"
            " allows_planned, unit, notes, sort_order, created_at, updated_at)"
            " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            (
                data["name"].strip(),
                data["kind"],
                data["icon"],
                data["color"],
                iso(data["start_date"]),
                data["target_per_week"] if data["kind"] == "positive" else None,
                1 if (data["allows_planned"] and data["kind"] == "negative") else 0,
                data["unit"],
                data["notes"],
                next_order,
                stamp,
                stamp,
            ),
        )
        habit_id = cursor.lastrowid
    return get_habit(habit_id)


_PATCHABLE = {
    "name": "name",
    "icon": "icon",
    "color": "color",
    "target_per_week": "target_per_week",
    "allows_planned": "allows_planned",
    "unit": "unit",
    "notes": "notes",
}


def update_habit(habit_id: int, patch: dict) -> sqlite3.Row:
    row = get_habit(habit_id)
    assignments: list[str] = []
    values: list[object] = []

    for field, column in _PATCHABLE.items():
        if field not in patch:
            continue
        value = patch[field]
        if field == "allows_planned":
            value = 1 if (value and row["kind"] == "negative") else 0
        if field == "target_per_week" and row["kind"] == "negative":
            continue
        if field == "name" and isinstance(value, str):
            value = value.strip()
        assignments.append(f"{column} = ?")
        values.append(value)

    if "start_date" in patch and patch["start_date"] is not None:
        assignments.append("start_date = ?")
        values.append(iso(patch["start_date"]))

    if "archived" in patch and patch["archived"] is not None:
        assignments.append("archived_at = ?")
        values.append(now_iso() if patch["archived"] else None)

    if not assignments:
        return row

    assignments.append("updated_at = ?")
    values.append(now_iso())
    values.append(habit_id)

    with transaction() as conn:
        conn.execute(f"UPDATE habits SET {', '.join(assignments)} WHERE id = ?", values)
    return get_habit(habit_id)


def delete_habit(habit_id: int) -> None:
    get_habit(habit_id)
    with transaction() as conn:
        conn.execute("DELETE FROM habits WHERE id = ?", (habit_id,))


def reorder_habits(habit_ids: list[int]) -> None:
    with transaction() as conn:
        for order, habit_id in enumerate(habit_ids):
            conn.execute(
                "UPDATE habits SET sort_order = ?, updated_at = ? WHERE id = ?",
                (order, now_iso(), habit_id),
            )


def upsert_entry(habit_id: int, data: dict) -> dict:
    """Create or replace the single entry for a habit on a date.

    One row per habit per day is a hard rule, so this is an upsert rather than an
    insert: logging the same day twice edits that day instead of duplicating it.
    """
    habit = get_habit(habit_id)
    planned = 1 if (data["planned"] and habit["kind"] == "negative" and habit["allows_planned"]) else 0
    stamp = now_iso()
    with transaction() as conn:
        conn.execute(
            "INSERT INTO entries (habit_id, date, amount, note, reason_id, planned,"
            " created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
            " ON CONFLICT (habit_id, date) DO UPDATE SET"
            " amount = excluded.amount, note = excluded.note,"
            " reason_id = excluded.reason_id, planned = excluded.planned,"
            " updated_at = excluded.updated_at",
            (
                habit_id,
                iso(data["date"]),
                data["amount"],
                (data["note"] or "").strip() or None,
                data["reason_id"],
                planned,
                stamp,
                stamp,
            ),
        )
    row = get_conn().execute(
        f"{ENTRY_SELECT} WHERE e.habit_id = ? AND e.date = ?", (habit_id, iso(data["date"]))
    ).fetchone()
    return entry_dict(row)


def delete_entry(habit_id: int, day: date) -> None:
    get_habit(habit_id)
    with transaction() as conn:
        conn.execute(
            "DELETE FROM entries WHERE habit_id = ? AND date = ?", (habit_id, iso(day))
        )


def list_reasons() -> list[dict]:
    rows = get_conn().execute("SELECT * FROM reasons ORDER BY sort_order, label").fetchall()
    return [{"id": r["id"], "label": r["label"]} for r in rows]


def create_reason(label: str) -> dict:
    label = label.strip()
    with transaction() as conn:
        existing = conn.execute(
            "SELECT id, label FROM reasons WHERE label = ? COLLATE NOCASE", (label,)
        ).fetchone()
        if existing:
            return {"id": existing["id"], "label": existing["label"]}
        next_order = conn.execute(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 AS n FROM reasons"
        ).fetchone()["n"]
        cursor = conn.execute(
            "INSERT INTO reasons (label, sort_order, created_at) VALUES (?, ?, ?)",
            (label, next_order, now_iso()),
        )
        return {"id": cursor.lastrowid, "label": label}


def delete_reason(reason_id: int) -> None:
    with transaction() as conn:
        conn.execute("DELETE FROM reasons WHERE id = ?", (reason_id,))
