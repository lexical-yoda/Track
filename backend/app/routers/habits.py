"""Habits, entries, reasons and the insight aggregates."""

from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status

from .. import repo, stats
from ..auth import require_session
from ..schemas import EntryIn, HabitIn, HabitPatch, ReasonIn, ReorderIn
from ..util import iso, today

router = APIRouter(prefix="/api", tags=["habits"], dependencies=[Depends(require_session)])


@router.get("/today")
def today_view(include_archived: bool = False) -> dict:
    now = today()
    return {
        "date": iso(now),
        "habits": repo.summaries(now, include_archived=include_archived),
        "reasons": repo.list_reasons(),
    }


@router.get("/habits")
def all_habits(include_archived: bool = True) -> list[dict]:
    return [repo.habit_dict(row) for row in repo.list_habits(include_archived)]


@router.post("/habits", status_code=status.HTTP_201_CREATED)
def add_habit(payload: HabitIn) -> dict:
    if payload.start_date > today():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Start date cannot be in the future")
    return repo.habit_dict(repo.create_habit(payload.model_dump()))


@router.patch("/habits/{habit_id}")
def edit_habit(habit_id: int, payload: HabitPatch) -> dict:
    patch = payload.model_dump(exclude_unset=True)
    if patch.get("start_date") and patch["start_date"] > today():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Start date cannot be in the future")
    return repo.habit_dict(repo.update_habit(habit_id, patch))


@router.delete("/habits/{habit_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_habit(habit_id: int) -> None:
    repo.delete_habit(habit_id)


@router.post("/habits/reorder")
def reorder(payload: ReorderIn) -> dict:
    repo.reorder_habits(payload.habit_ids)
    return {"ok": True}


@router.get("/habits/{habit_id}")
def habit_detail(habit_id: int, window: int = Query(default=371, ge=28, le=1100)) -> dict:
    now = today()
    row, habit, entries = repo.habit_with_entries(habit_id)
    summary = stats.summary(habit, entries, now)
    streak = summary["current_streak"]
    entry_rows = repo.list_entries(habit_id)
    return {
        **repo.habit_dict(row),
        "summary": summary,
        "heatmap": stats.heatmap(habit, entries, now, days=window),
        "milestones": {
            "passed": stats.milestones_passed(streak),
            "next": stats.next_milestone(streak),
        },
        "entries": [repo.entry_dict(e) for e in reversed(entry_rows)],
        "reasons": repo.list_reasons(),
    }


@router.put("/habits/{habit_id}/entries")
def log_entry(habit_id: int, payload: EntryIn) -> dict:
    if payload.date > today():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Cannot log a future day")
    row = repo.get_habit(habit_id)
    if payload.date < repo.parse_date(row["start_date"]):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "That day is before this habit started. Move the start date first.",
        )
    return repo.upsert_entry(habit_id, payload.model_dump())


@router.delete("/habits/{habit_id}/entries/{day}", status_code=status.HTTP_204_NO_CONTENT)
def unlog_entry(habit_id: int, day: date) -> None:
    repo.delete_entry(habit_id, day)


@router.get("/insights")
def insights(months: int = Query(default=12, ge=1, le=36)) -> dict:
    now = today()
    out = []
    for row in repo.list_habits():
        habit = repo.to_habit(row)
        entry_rows = repo.list_entries(row["id"])
        entries = [repo.to_entry(e) for e in entry_rows]
        in_window = [e for e in entries if e.date >= now - timedelta(days=months * 31)]
        payload = {
            **repo.habit_dict(row),
            "summary": stats.summary(habit, entries, now),
            "weekday": stats.weekday_pattern(in_window),
            "monthly": stats.monthly_counts(in_window, months, now),
        }
        if row["kind"] == "negative":
            payload["reasons"] = stats.reason_breakdown(in_window)
            payload["planned_split"] = {
                "planned": sum(1 for e in in_window if e.planned),
                "unplanned": sum(1 for e in in_window if not e.planned),
            }
        out.append(payload)
    return {"date": iso(now), "months": months, "habits": out}


@router.get("/reasons")
def reasons() -> list[dict]:
    return repo.list_reasons()


@router.post("/reasons", status_code=status.HTTP_201_CREATED)
def add_reason(payload: ReasonIn) -> dict:
    return repo.create_reason(payload.label)


@router.delete("/reasons/{reason_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_reason(reason_id: int) -> None:
    repo.delete_reason(reason_id)


@router.get("/export")
def export() -> dict:
    """Everything, in one JSON document, so the data is never trapped in the app."""
    now = today()
    return {
        "exported_at": iso(now),
        "reasons": repo.list_reasons(),
        "habits": [
            {
                **repo.habit_dict(row),
                "entries": [repo.entry_dict(e) for e in repo.list_entries(row["id"])],
            }
            for row in repo.list_habits(include_archived=True)
        ],
    }
