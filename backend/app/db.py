"""SQLite connection handling and schema migrations.

The database is a single file under DATA_DIR. There is no ORM: the schema is small
enough that hand-written SQL stays clearer than a mapping layer, and it keeps the
container dependency list short.
"""

from __future__ import annotations

import os
import sqlite3
import threading
from contextlib import contextmanager
from pathlib import Path
from typing import Iterator

DATA_DIR = Path(os.environ.get("DATA_DIR", "/app/data"))
DB_PATH = DATA_DIR / "track.db"

# One connection per thread. SQLite connections are not safe to share across
# threads, and uvicorn runs sync endpoint functions in a worker thread pool.
_local = threading.local()


def _configure(conn: sqlite3.Connection) -> None:
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    # WAL lets a read run while a write is in flight, which matters because the
    # service worker can flush a queue of writes while a screen is loading.
    conn.execute("PRAGMA journal_mode = WAL")
    conn.execute("PRAGMA synchronous = NORMAL")
    conn.execute("PRAGMA busy_timeout = 5000")


def get_conn() -> sqlite3.Connection:
    conn = getattr(_local, "conn", None)
    if conn is None:
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(DB_PATH, isolation_level=None)
        _configure(conn)
        _local.conn = conn
    return conn


@contextmanager
def transaction() -> Iterator[sqlite3.Connection]:
    conn = get_conn()
    conn.execute("BEGIN IMMEDIATE")
    try:
        yield conn
    except Exception:
        conn.execute("ROLLBACK")
        raise
    else:
        conn.execute("COMMIT")


SCHEMA = """
CREATE TABLE IF NOT EXISTS user (
    id            INTEGER PRIMARY KEY CHECK (id = 1),
    username      TEXT    NOT NULL,
    password_hash TEXT    NOT NULL,
    created_at    TEXT    NOT NULL,
    updated_at    TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS habits (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT    NOT NULL,
    kind             TEXT    NOT NULL CHECK (kind IN ('positive', 'negative')),
    icon             TEXT    NOT NULL DEFAULT 'circle',
    accent           TEXT    NOT NULL DEFAULT 'verdigris',
    -- For a negative habit this is the quit date, and the clean counter runs from
    -- it. For a positive habit it is the day tracking began; days before it are
    -- untracked rather than missed.
    start_date       TEXT    NOT NULL,
    -- Positive habits only: how many days a week counts as keeping the habit.
    -- NULL means every day.
    target_per_week  INTEGER,
    -- Negative habits only: whether a logged slip may be marked as a planned,
    -- accepted exception (an occasional party cigarette) that leaves the clean
    -- streak intact.
    allows_planned   INTEGER NOT NULL DEFAULT 0,
    unit             TEXT,
    notes            TEXT,
    sort_order       INTEGER NOT NULL DEFAULT 0,
    archived_at      TEXT,
    created_at       TEXT    NOT NULL,
    updated_at       TEXT    NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_habits_active ON habits (archived_at, sort_order);

CREATE TABLE IF NOT EXISTS entries (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    habit_id   INTEGER NOT NULL REFERENCES habits (id) ON DELETE CASCADE,
    -- Local date, YYYY-MM-DD. The absence of a row is meaningful: for a negative
    -- habit it is a clean day, for a positive habit a day the habit was not done.
    date       TEXT    NOT NULL,
    amount     REAL,
    note       TEXT,
    reason_id  INTEGER REFERENCES reasons (id) ON DELETE SET NULL,
    -- Negative habits only. A planned slip is a decision, not a relapse, and the
    -- streak maths skips it.
    planned    INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL,
    updated_at TEXT    NOT NULL,
    UNIQUE (habit_id, date)
);

CREATE INDEX IF NOT EXISTS idx_entries_habit_date ON entries (habit_id, date);

CREATE TABLE IF NOT EXISTS reasons (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    label      TEXT    NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT    NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    user_agent TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions (expires_at);

CREATE TABLE IF NOT EXISTS login_attempts (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ip         TEXT NOT NULL,
    at         TEXT NOT NULL,
    successful INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_login_attempts ON login_attempts (ip, at);
"""

DEFAULT_REASONS = ["Party", "Stress", "Travel", "Boredom", "Social", "Celebration"]


def init_db() -> None:
    conn = get_conn()
    conn.executescript(SCHEMA)
    existing = conn.execute("SELECT COUNT(*) AS n FROM reasons").fetchone()["n"]
    if existing == 0:
        from .util import now_iso

        stamp = now_iso()
        conn.executemany(
            "INSERT INTO reasons (label, sort_order, created_at) VALUES (?, ?, ?)",
            [(label, i, stamp) for i, label in enumerate(DEFAULT_REASONS)],
        )
