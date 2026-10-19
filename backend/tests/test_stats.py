"""Tests for the streak and summary maths.

These cover the semantics the whole app rests on: a missing day means "clean" for
a negative habit and "not done" for a positive one, a planned slip is not a
relapse, and days before a habit started are untracked rather than failed.
"""

from __future__ import annotations

from datetime import date

import pytest

from app import stats

TODAY = date(2026, 10, 19)


def negative(start: str = "2026-09-01", allows_planned: bool = True) -> stats.Habit:
    return stats.Habit(
        id=1, kind="negative", start_date=date.fromisoformat(start), allows_planned=allows_planned
    )


def positive(start: str = "2026-09-01", target: int | None = None) -> stats.Habit:
    return stats.Habit(id=2, kind="positive", start_date=date.fromisoformat(start), target_per_week=target)


def entries(*spec: tuple[str, bool]) -> list[stats.Entry]:
    return [stats.Entry(date=date.fromisoformat(day), planned=planned) for day, planned in spec]


# --- negative habits -------------------------------------------------------


def test_negative_with_no_slips_counts_from_quit_date():
    assert stats.current_streak(negative("2026-10-01"), [], TODAY) == 18


def test_negative_quit_today_is_zero_days_clean():
    assert stats.current_streak(negative("2026-10-19"), [], TODAY) == 0


def test_negative_streak_restarts_at_the_last_slip():
    habit = negative("2026-09-01")
    assert stats.current_streak(habit, entries(("2026-10-15", False)), TODAY) == 4


def test_slip_yesterday_leaves_one_clean_day():
    assert stats.current_streak(negative(), entries(("2026-10-18", False)), TODAY) == 1


def test_slip_today_resets_to_zero():
    assert stats.current_streak(negative(), entries(("2026-10-19", False)), TODAY) == 0


def test_planned_slip_does_not_break_the_streak():
    """The party-cigarette case: logged, counted, but not a relapse."""
    habit = negative("2026-10-01")
    assert stats.current_streak(habit, entries(("2026-10-12", True)), TODAY) == 18


def test_planned_and_unplanned_mixed_uses_only_the_unplanned_one():
    habit = negative("2026-09-01")
    logged = entries(("2026-10-10", False), ("2026-10-16", True))
    assert stats.current_streak(habit, logged, TODAY) == 9


def test_only_the_latest_unplanned_slip_matters():
    habit = negative("2026-09-01")
    logged = entries(("2026-09-20", False), ("2026-10-05", False))
    assert stats.current_streak(habit, logged, TODAY) == 14


def test_negative_longest_streak_spans_the_gap_between_slips():
    habit = negative("2026-01-01")
    logged = entries(("2026-02-01", False), ("2026-06-01", False), ("2026-10-18", False))
    # Runs are 31, 120 and 139 days, then 1 day for the current one. The gap
    # between the second and third slips is the longest.
    assert stats.longest_streak(habit, logged, TODAY) == 139


def test_negative_longest_streak_can_be_the_current_run():
    habit = negative("2026-01-01")
    assert stats.longest_streak(habit, entries(("2026-01-10", False)), TODAY) == 282


def test_negative_totals_treat_a_planned_slip_as_a_kept_day():
    habit = negative("2026-10-01")
    logged = entries(("2026-10-05", False), ("2026-10-12", True))
    result = stats.totals(habit, logged, TODAY)
    assert result["tracked_days"] == 19
    assert result["slip_days"] == 1
    assert result["planned_days"] == 1
    assert result["kept_days"] == 18
    assert result["success_rate"] == pytest.approx(18 / 19, abs=1e-4)


def test_the_forty_five_of_forty_six_case():
    """One lapse after a long run should read as a high success rate, not a reset."""
    habit = negative("2026-09-04")  # 46 tracked days to 19 Oct
    result = stats.totals(habit, entries(("2026-10-01", False)), TODAY)
    assert result["tracked_days"] == 46
    assert result["kept_days"] == 45
    assert round(result["success_rate"] * 100, 1) == 97.8


# --- positive habits -------------------------------------------------------


def test_positive_streak_counts_consecutive_logged_days():
    habit = positive("2026-09-01")
    logged = entries(("2026-10-17", False), ("2026-10-18", False), ("2026-10-19", False))
    assert stats.current_streak(habit, logged, TODAY) == 3


def test_positive_streak_survives_an_unlogged_today():
    """The streak must not read zero every morning before the gym."""
    habit = positive("2026-09-01")
    logged = entries(("2026-10-16", False), ("2026-10-17", False), ("2026-10-18", False))
    assert stats.current_streak(habit, logged, TODAY) == 3


def test_positive_streak_breaks_on_a_two_day_gap():
    habit = positive("2026-09-01")
    logged = entries(("2026-10-15", False), ("2026-10-16", False))
    assert stats.current_streak(habit, logged, TODAY) == 0


def test_positive_streak_stops_at_the_start_date():
    habit = positive("2026-10-17")
    logged = entries(("2026-10-17", False), ("2026-10-18", False), ("2026-10-19", False))
    assert stats.current_streak(habit, logged, TODAY) == 3


def test_positive_longest_streak_finds_the_best_run():
    habit = positive("2026-09-01")
    logged = entries(
        ("2026-09-02", False),
        ("2026-09-03", False),
        ("2026-09-04", False),
        ("2026-09-05", False),
        ("2026-10-18", False),
    )
    assert stats.longest_streak(habit, logged, TODAY) == 4


def test_positive_totals_count_missed_days():
    habit = positive("2026-10-15")
    logged = entries(("2026-10-16", False), ("2026-10-18", False))
    result = stats.totals(habit, logged, TODAY)
    assert result["tracked_days"] == 5
    assert result["kept_days"] == 2
    assert result["missed_days"] == 3


def test_week_progress_against_a_weekly_target():
    habit = positive("2026-09-01", target=3)
    # 19 Oct 2026 is a Monday, so the week holds one day so far.
    logged = entries(("2026-10-19", False))
    week = stats.week_progress(habit, logged, TODAY)
    assert week["week_start"] == "2026-10-19"
    assert week == {"week_start": "2026-10-19", "done": 1, "target": 3, "on_track": False}


def test_weeks_on_target_ignores_the_current_partial_week():
    habit = positive("2026-09-28", target=2)
    logged = entries(
        ("2026-10-12", False), ("2026-10-13", False),  # week of 12 Oct
        ("2026-10-05", False), ("2026-10-06", False),  # week of 5 Oct
        ("2026-10-19", False),                          # current week, partial
    )
    assert stats.weeks_on_target(habit, logged, TODAY) == 2


# --- heatmap and day states ------------------------------------------------


def test_days_before_the_start_date_are_untracked():
    habit = negative("2026-10-01")
    assert stats.day_state(habit, None, date(2026, 9, 30), TODAY) == "untracked"
    assert stats.day_state(habit, None, date(2026, 10, 1), TODAY) == "clean"


def test_future_days_are_untracked():
    assert stats.day_state(negative(), None, date(2026, 10, 20), TODAY) == "untracked"


def test_day_states_distinguish_planned_from_unplanned():
    habit = negative("2026-10-01")
    slip = stats.Entry(date=date(2026, 10, 5), planned=False)
    allowed = stats.Entry(date=date(2026, 10, 6), planned=True)
    assert stats.day_state(habit, slip, slip.date, TODAY) == "slip"
    assert stats.day_state(habit, allowed, allowed.date, TODAY) == "planned"


def test_positive_day_states():
    habit = positive("2026-10-01")
    done = stats.Entry(date=date(2026, 10, 5))
    assert stats.day_state(habit, done, done.date, TODAY) == "done"
    assert stats.day_state(habit, None, date(2026, 10, 6), TODAY) == "missed"


def test_heatmap_starts_on_a_monday_and_ends_today():
    cells = stats.heatmap(negative("2026-01-01"), [], TODAY, days=371)
    assert date.fromisoformat(cells[0]["date"]).weekday() == 0
    assert cells[-1]["date"] == "2026-10-19"


def test_heatmap_marks_pre_start_days_untracked():
    cells = stats.heatmap(negative("2026-10-15"), [], TODAY, days=28)
    states = {cell["state"] for cell in cells[:5]}
    assert states == {"untracked"}


# --- milestones and insight aggregates -------------------------------------


def test_milestones():
    assert stats.milestones_passed(31) == [1, 3, 7, 14, 30]
    assert stats.next_milestone(31) == 60
    assert stats.next_milestone(2000) is None


def test_weekday_pattern_is_monday_first():
    logged = entries(("2026-10-19", False), ("2026-10-18", False), ("2026-10-12", False))
    # 19 and 12 Oct are Mondays, 18 Oct is a Sunday.
    assert stats.weekday_pattern(logged) == [2, 0, 0, 0, 0, 0, 1]


def test_reason_breakdown_sorts_by_count_then_label():
    logged = [
        stats.Entry(date=date(2026, 10, 1), reason="Party"),
        stats.Entry(date=date(2026, 10, 2), reason="Party"),
        stats.Entry(date=date(2026, 10, 3), reason="Stress"),
        stats.Entry(date=date(2026, 10, 4)),
    ]
    assert stats.reason_breakdown(logged) == [
        {"reason": "Party", "count": 2},
        {"reason": "Stress", "count": 1},
        {"reason": "Unlogged", "count": 1},
    ]


def test_monthly_counts_returns_a_full_oldest_first_window():
    logged = entries(("2026-10-01", False), ("2026-10-02", False), ("2026-08-15", False))
    months = stats.monthly_counts(logged, 3, TODAY)
    assert [m["month"] for m in months] == ["2026-08", "2026-09", "2026-10"]
    assert [m["count"] for m in months] == [1, 0, 2]


def test_summary_reports_whether_today_is_logged():
    habit = negative("2026-10-01")
    assert stats.summary(habit, [], TODAY)["logged_today"] is False
    logged = entries(("2026-10-19", True))
    summary = stats.summary(habit, logged, TODAY)
    assert summary["logged_today"] is True
    assert summary["today_planned"] is True
    assert summary["last_slip"] is None
