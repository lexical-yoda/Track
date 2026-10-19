"""Streak, heatmap and summary maths.

Pure functions over plain data, so they can be unit-tested without a database.
The semantics they encode are the heart of the app, so they are spelled out here
rather than scattered across endpoints:

*   An entry is a positive record. For a positive habit it means "I did this on
    that day"; for a negative habit it means "I slipped on that day". The absence
    of a row therefore means "not done" for a positive habit and "clean" for a
    negative one, which is what makes logging cheap: nothing has to be recorded
    on an ordinary day.

*   A negative habit may allow *planned* slips. A planned slip is an accepted
    exception, decided in advance, and it does not break the clean streak. It is
    still recorded and still counted separately, so it cannot be used to quietly
    rewrite history.

*   Days before a habit's ``start_date`` are untracked, not missed. This keeps a
    habit added today from showing a wall of failure behind it.

*   A positive habit's streak is measured to yesterday when today has not been
    logged yet, so the number does not collapse to zero every morning and climb
    back each evening. Today counts the moment it is logged.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Iterable, Literal, Sequence

NEGATIVE = "negative"
POSITIVE = "positive"

DayState = Literal["clean", "planned", "slip", "done", "missed", "untracked"]


@dataclass(frozen=True)
class Entry:
    date: date
    planned: bool = False
    amount: float | None = None
    reason: str | None = None
    note: str | None = None


@dataclass(frozen=True)
class Habit:
    id: int
    kind: str
    start_date: date
    target_per_week: int | None = None
    allows_planned: bool = False


def _breaking_dates(entries: Iterable[Entry]) -> list[date]:
    """Slip dates that reset a negative habit's streak, oldest first."""
    return sorted(e.date for e in entries if not e.planned)


def _entry_dates(entries: Iterable[Entry]) -> set[date]:
    return {e.date for e in entries}


def current_streak(habit: Habit, entries: Sequence[Entry], today: date) -> int:
    """Days in the habit's current run.

    For a negative habit: complete days since the most recent streak-breaking
    slip, or since the quit date when there has been none. Quitting today gives
    zero, which the interface presents as day one.

    For a positive habit: consecutive logged days ending today, or ending
    yesterday when today is not logged yet.
    """
    if habit.kind == NEGATIVE:
        breaks = _breaking_dates(entries)
        anchor = max([habit.start_date, *[d for d in breaks if d <= today]], default=habit.start_date)
        return max((today - anchor).days, 0)

    done = _entry_dates(entries)
    cursor = today if today in done else today - timedelta(days=1)
    streak = 0
    while cursor >= habit.start_date and cursor in done:
        streak += 1
        cursor -= timedelta(days=1)
    return streak


def longest_streak(habit: Habit, entries: Sequence[Entry], today: date) -> int:
    """The longest clean run (negative) or longest consecutive run (positive)."""
    if habit.kind == NEGATIVE:
        breaks = [d for d in _breaking_dates(entries) if habit.start_date <= d <= today]
        best = 0
        anchor = habit.start_date
        for slip in breaks:
            best = max(best, (slip - anchor).days)
            anchor = slip
        return max(best, (today - anchor).days)

    done = sorted(d for d in _entry_dates(entries) if habit.start_date <= d <= today)
    best = run = 0
    previous: date | None = None
    for day in done:
        run = run + 1 if previous is not None and day - previous == timedelta(days=1) else 1
        best = max(best, run)
        previous = day
    return best


def day_state(habit: Habit, entry: Entry | None, day: date, today: date) -> DayState:
    if day < habit.start_date or day > today:
        return "untracked"
    if habit.kind == NEGATIVE:
        if entry is None:
            return "clean"
        return "planned" if entry.planned else "slip"
    return "done" if entry is not None else "missed"


def heatmap(
    habit: Habit,
    entries: Sequence[Entry],
    today: date,
    days: int = 371,
) -> list[dict]:
    """One cell per day for the trailing window, oldest first.

    371 days is 53 whole weeks, so a calendar grid starting on a Monday always
    fills without a ragged first column.
    """
    by_date = {e.date: e for e in entries}
    start = today - timedelta(days=days - 1)
    # Align to Monday so the rendered grid's rows are real weeks.
    start -= timedelta(days=start.weekday())
    cells = []
    cursor = start
    while cursor <= today:
        entry = by_date.get(cursor)
        cells.append(
            {
                "date": cursor.isoformat(),
                "state": day_state(habit, entry, cursor, today),
                "amount": entry.amount if entry else None,
            }
        )
        cursor += timedelta(days=1)
    return cells


def week_cells(habit: Habit, entries: Sequence[Entry], today: date) -> list[dict]:
    """The seven cells of the current calendar week, Monday first.

    The Today screen's strip uses these. They are produced here rather than
    derived on the client so that one implementation of ``day_state`` decides
    what a day looks like everywhere in the app.
    """
    monday = today - timedelta(days=today.weekday())
    by_date = {e.date: e for e in entries}
    cells = []
    for offset in range(7):
        day = monday + timedelta(days=offset)
        entry = by_date.get(day)
        cells.append(
            {
                "date": day.isoformat(),
                "state": day_state(habit, entry, day, today),
                "amount": entry.amount if entry else None,
            }
        )
    return cells


def totals(habit: Habit, entries: Sequence[Entry], today: date) -> dict:
    """Headline counts for a habit.

    ``success_rate`` deliberately treats a planned slip as a kept day for a
    negative habit: an exception decided in advance is not a failure. The raw
    counts sit beside it so the rate can never hide what actually happened.
    """
    tracked = max((today - habit.start_date).days + 1, 0)
    in_window = [e for e in entries if habit.start_date <= e.date <= today]

    if habit.kind == NEGATIVE:
        planned = sum(1 for e in in_window if e.planned)
        slips = sum(1 for e in in_window if not e.planned)
        kept = tracked - slips
        return {
            "tracked_days": tracked,
            "kept_days": max(kept, 0),
            "slip_days": slips,
            "planned_days": planned,
            "success_rate": round(kept / tracked, 4) if tracked else None,
            "amount_total": sum(e.amount or 0 for e in in_window) or None,
        }

    done = len(in_window)
    return {
        "tracked_days": tracked,
        "kept_days": done,
        "missed_days": max(tracked - done, 0),
        "success_rate": round(done / tracked, 4) if tracked else None,
        "amount_total": sum(e.amount or 0 for e in in_window) or None,
    }


def week_progress(habit: Habit, entries: Sequence[Entry], today: date) -> dict:
    """This calendar week (Monday start) against a positive habit's weekly target."""
    monday = today - timedelta(days=today.weekday())
    done = sum(1 for e in entries if monday <= e.date <= today)
    target = habit.target_per_week or 7
    return {
        "week_start": monday.isoformat(),
        "done": done,
        "target": target,
        "on_track": done >= target,
    }


def weeks_on_target(habit: Habit, entries: Sequence[Entry], today: date) -> int:
    """Consecutive complete weeks meeting a positive habit's weekly target.

    The current, partial week is excluded: it cannot have failed yet.
    """
    target = habit.target_per_week or 7
    by_week: Counter[date] = Counter()
    for entry in entries:
        by_week[entry.date - timedelta(days=entry.date.weekday())] += 1

    week = today - timedelta(days=today.weekday()) - timedelta(days=7)
    first_week = habit.start_date - timedelta(days=habit.start_date.weekday())
    streak = 0
    while week >= first_week and by_week.get(week, 0) >= target:
        streak += 1
        week -= timedelta(days=7)
    return streak


def summary(habit: Habit, entries: Sequence[Entry], today: date) -> dict:
    """Everything the Today card and the detail header need, in one shape."""
    today_entry = next((e for e in entries if e.date == today), None)
    data = {
        "habit_id": habit.id,
        "current_streak": current_streak(habit, entries, today),
        "longest_streak": longest_streak(habit, entries, today),
        "logged_today": today_entry is not None,
        "today_planned": bool(today_entry.planned) if today_entry else False,
        **totals(habit, entries, today),
    }
    if habit.kind == POSITIVE:
        data["week"] = week_progress(habit, entries, today)
        data["weeks_on_target"] = weeks_on_target(habit, entries, today)
    else:
        last_slip = max(_breaking_dates(entries), default=None)
        data["last_slip"] = last_slip.isoformat() if last_slip else None
    return data


def milestones_passed(streak: int) -> list[int]:
    """Milestones reached by the current streak, for the detail screen."""
    ladder = [1, 3, 7, 14, 30, 60, 90, 180, 365, 730, 1095]
    return [m for m in ladder if streak >= m]


def next_milestone(streak: int) -> int | None:
    ladder = [1, 3, 7, 14, 30, 60, 90, 180, 365, 730, 1095]
    return next((m for m in ladder if m > streak), None)


def weekday_pattern(entries: Sequence[Entry]) -> list[int]:
    """Entry counts by weekday, Monday first. Shows when slips cluster."""
    counts = [0] * 7
    for entry in entries:
        counts[entry.date.weekday()] += 1
    return counts


def reason_breakdown(entries: Sequence[Entry]) -> list[dict]:
    counts: Counter[str] = Counter(e.reason or "Unlogged" for e in entries)
    return [
        {"reason": reason, "count": count}
        for reason, count in sorted(counts.items(), key=lambda kv: (-kv[1], kv[0]))
    ]


def monthly_counts(entries: Sequence[Entry], months: int, today: date) -> list[dict]:
    """Entries per calendar month over the trailing window, oldest first."""
    buckets: dict[str, int] = defaultdict(int)
    year, month = today.year, today.month
    keys: list[str] = []
    for _ in range(months):
        keys.append(f"{year:04d}-{month:02d}")
        month -= 1
        if month == 0:
            year, month = year - 1, 12
    keys.reverse()
    for entry in entries:
        buckets[f"{entry.date.year:04d}-{entry.date.month:02d}"] += 1
    return [{"month": key, "count": buckets.get(key, 0)} for key in keys]
