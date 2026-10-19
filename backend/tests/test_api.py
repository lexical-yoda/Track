"""End-to-end API tests against a temporary database.

These cover the parts that would be embarrassing to get wrong on a service that
is reachable from the internet: the API refuses anonymous callers, a write
without the CSRF header is rejected, and logging a day is idempotent.
"""

from __future__ import annotations

import importlib
import sys

import pytest
from fastapi.testclient import TestClient

USERNAME = "lexi"
PASSWORD = "a-long-enough-password"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    monkeypatch.setenv("SECURE_COOKIES", "false")
    monkeypatch.setenv("TZ", "Asia/Kolkata")
    # The modules read their configuration at import time, so drop them and let
    # each test import a fresh copy pointed at its own tmp_path.
    for name in [m for m in list(sys.modules) if m.startswith("app")]:
        del sys.modules[name]
    main = importlib.import_module("app.main")
    with TestClient(main.app) as test_client:
        yield test_client


@pytest.fixture()
def signed_in(client):
    client.post("/api/session/setup", json={"username": USERNAME, "password": PASSWORD})
    csrf = client.cookies.get("track_csrf")
    client.headers.update({"X-Track-CSRF": csrf})
    return client


def test_health_needs_no_session(client):
    assert client.get("/api/health").status_code == 200


def test_api_refuses_anonymous_callers(client):
    assert client.get("/api/today").status_code == 401


def test_state_reports_an_uninitialised_instance(client):
    body = client.get("/api/session/state").json()
    assert body == {"initialised": False, "signed_in": False, "username": None}


def test_setup_then_state_is_signed_in(client):
    client.post("/api/session/setup", json={"username": USERNAME, "password": PASSWORD})
    body = client.get("/api/session/state").json()
    assert body["initialised"] is True
    assert body["signed_in"] is True
    assert body["username"] == USERNAME


def test_setup_runs_only_once(signed_in):
    response = signed_in.post(
        "/api/session/setup", json={"username": "someone", "password": "another-password"}
    )
    assert response.status_code == 409


def test_wrong_password_is_rejected(client):
    client.post("/api/session/setup", json={"username": USERNAME, "password": PASSWORD})
    client.post("/api/session/logout", headers={"X-Track-CSRF": client.cookies.get("track_csrf")})
    response = client.post("/api/session/login", json={"username": USERNAME, "password": "wrong"})
    assert response.status_code == 401


def test_login_is_rate_limited(client):
    client.post("/api/session/setup", json={"username": USERNAME, "password": PASSWORD})
    for _ in range(8):
        client.post("/api/session/login", json={"username": USERNAME, "password": "wrong"})
    response = client.post("/api/session/login", json={"username": USERNAME, "password": PASSWORD})
    assert response.status_code == 429


def test_write_without_the_csrf_header_is_refused(signed_in):
    response = signed_in.post(
        "/api/habits",
        json={"name": "Gym", "kind": "positive", "start_date": "2026-10-01"},
        headers={"X-Track-CSRF": ""},
    )
    assert response.status_code == 403


def test_create_and_list_a_habit(signed_in):
    created = signed_in.post(
        "/api/habits",
        json={
            "name": "  Quit smoking  ",
            "kind": "negative",
            "start_date": "2026-09-01",
            "allows_planned": True,
            "accent": "brass",
            "unit": "cigarettes",
        },
    )
    assert created.status_code == 201
    habit = created.json()
    assert habit["name"] == "Quit smoking"
    assert habit["allows_planned"] is True

    today = signed_in.get("/api/today").json()
    assert len(today["habits"]) == 1
    assert today["habits"][0]["summary"]["current_streak"] > 0
    assert today["reasons"], "default reason tags should be seeded"


def test_an_unknown_accent_is_rejected(signed_in):
    response = signed_in.post(
        "/api/habits",
        json={"name": "Gym", "kind": "positive", "start_date": "2026-10-01", "accent": "neon"},
    )
    assert response.status_code == 422


def test_a_future_start_date_is_rejected(signed_in):
    response = signed_in.post(
        "/api/habits", json={"name": "Gym", "kind": "positive", "start_date": "2099-01-01"}
    )
    assert response.status_code == 422


def test_logging_the_same_day_twice_edits_rather_than_duplicates(signed_in):
    habit_id = signed_in.post(
        "/api/habits",
        json={"name": "Gym", "kind": "positive", "start_date": "2026-10-01"},
    ).json()["id"]

    first = signed_in.put(
        f"/api/habits/{habit_id}/entries", json={"date": "2026-10-10", "amount": 30}
    )
    assert first.status_code == 200
    second = signed_in.put(
        f"/api/habits/{habit_id}/entries",
        json={"date": "2026-10-10", "amount": 45, "note": "legs"},
    )
    assert second.status_code == 200
    assert second.json()["id"] == first.json()["id"]
    assert second.json()["amount"] == 45

    detail = signed_in.get(f"/api/habits/{habit_id}").json()
    assert len(detail["entries"]) == 1


def test_unlogging_a_day_removes_it(signed_in):
    habit_id = signed_in.post(
        "/api/habits", json={"name": "Gym", "kind": "positive", "start_date": "2026-10-01"}
    ).json()["id"]
    signed_in.put(f"/api/habits/{habit_id}/entries", json={"date": "2026-10-10"})
    assert signed_in.delete(f"/api/habits/{habit_id}/entries/2026-10-10").status_code == 204
    assert signed_in.get(f"/api/habits/{habit_id}").json()["entries"] == []


def test_a_day_before_the_start_date_is_refused(signed_in):
    habit_id = signed_in.post(
        "/api/habits", json={"name": "Gym", "kind": "positive", "start_date": "2026-10-01"}
    ).json()["id"]
    response = signed_in.put(f"/api/habits/{habit_id}/entries", json={"date": "2026-09-30"})
    assert response.status_code == 422


def test_a_future_day_cannot_be_logged(signed_in):
    habit_id = signed_in.post(
        "/api/habits", json={"name": "Gym", "kind": "positive", "start_date": "2026-10-01"}
    ).json()["id"]
    response = signed_in.put(f"/api/habits/{habit_id}/entries", json={"date": "2099-01-01"})
    assert response.status_code == 422


def test_a_planned_slip_is_only_honoured_when_the_habit_allows_it(signed_in):
    strict = signed_in.post(
        "/api/habits",
        json={"name": "No sugar", "kind": "negative", "start_date": "2026-10-01",
              "allows_planned": False},
    ).json()["id"]
    entry = signed_in.put(
        f"/api/habits/{strict}/entries", json={"date": "2026-10-10", "planned": True}
    ).json()
    assert entry["planned"] is False, "planned must be ignored when the habit forbids it"

    lenient = signed_in.post(
        "/api/habits",
        json={"name": "Smoking", "kind": "negative", "start_date": "2026-10-01",
              "allows_planned": True},
    ).json()["id"]
    entry = signed_in.put(
        f"/api/habits/{lenient}/entries", json={"date": "2026-10-10", "planned": True}
    ).json()
    assert entry["planned"] is True


def test_archiving_hides_a_habit_from_today(signed_in):
    habit_id = signed_in.post(
        "/api/habits", json={"name": "Gym", "kind": "positive", "start_date": "2026-10-01"}
    ).json()["id"]
    signed_in.patch(f"/api/habits/{habit_id}", json={"archived": True})
    assert signed_in.get("/api/today").json()["habits"] == []
    assert len(signed_in.get("/api/habits").json()) == 1


def test_reorder_sets_display_order(signed_in):
    first = signed_in.post(
        "/api/habits", json={"name": "A", "kind": "positive", "start_date": "2026-10-01"}
    ).json()["id"]
    second = signed_in.post(
        "/api/habits", json={"name": "B", "kind": "positive", "start_date": "2026-10-01"}
    ).json()["id"]
    signed_in.post("/api/habits/reorder", json={"habit_ids": [second, first]})
    names = [h["name"] for h in signed_in.get("/api/today").json()["habits"]]
    assert names == ["B", "A"]


def test_export_round_trips_entries(signed_in):
    habit_id = signed_in.post(
        "/api/habits",
        json={"name": "Smoking", "kind": "negative", "start_date": "2026-10-01",
              "allows_planned": True, "unit": "cigarettes"},
    ).json()["id"]
    reason_id = signed_in.get("/api/reasons").json()[0]["id"]
    signed_in.put(
        f"/api/habits/{habit_id}/entries",
        json={"date": "2026-10-10", "amount": 3, "note": "wedding", "reason_id": reason_id,
              "planned": True},
    )

    export = signed_in.get("/api/export").json()
    assert export["habits"][0]["entries"][0]["note"] == "wedding"

    csv_body = signed_in.get("/api/export.csv").text
    assert "Smoking" in csv_body
    assert "wedding" in csv_body
    assert "cigarettes" in csv_body


def test_insights_include_reason_and_planned_breakdowns(signed_in):
    habit_id = signed_in.post(
        "/api/habits",
        json={"name": "Smoking", "kind": "negative", "start_date": "2026-09-01",
              "allows_planned": True},
    ).json()["id"]
    reason_id = signed_in.get("/api/reasons").json()[0]["id"]
    signed_in.put(
        f"/api/habits/{habit_id}/entries", json={"date": "2026-10-10", "reason_id": reason_id}
    )
    signed_in.put(
        f"/api/habits/{habit_id}/entries", json={"date": "2026-10-12", "planned": True}
    )

    habit = signed_in.get("/api/insights").json()["habits"][0]
    assert habit["planned_split"] == {"planned": 1, "unplanned": 1}
    assert sum(r["count"] for r in habit["reasons"]) == 2
    assert len(habit["monthly"]) == 12


def test_a_custom_reason_is_deduplicated(signed_in):
    first = signed_in.post("/api/reasons", json={"label": "Work trip"}).json()
    second = signed_in.post("/api/reasons", json={"label": "work trip"}).json()
    assert first["id"] == second["id"]


def test_logout_revokes_the_session(signed_in):
    assert signed_in.get("/api/today").status_code == 200
    signed_in.post("/api/session/logout")
    assert signed_in.get("/api/today").status_code == 401


def test_changing_the_password_keeps_this_device_signed_in(signed_in):
    response = signed_in.post(
        "/api/session/password",
        json={"current_password": PASSWORD, "new_password": "a-brand-new-password"},
    )
    assert response.status_code == 200
    signed_in.headers.update({"X-Track-CSRF": signed_in.cookies.get("track_csrf")})
    assert signed_in.get("/api/today").status_code == 200


def test_changing_the_password_needs_the_current_one(signed_in):
    response = signed_in.post(
        "/api/session/password",
        json={"current_password": "not-it", "new_password": "a-brand-new-password"},
    )
    assert response.status_code == 403


def test_security_headers_are_present(client):
    headers = client.get("/api/health").headers
    assert "default-src 'self'" in headers["content-security-policy"]
    assert headers["x-frame-options"] == "DENY"
    assert headers["x-content-type-options"] == "nosniff"


def test_an_unknown_api_path_is_not_served_the_spa(client):
    assert client.get("/api/nope").status_code == 404
