"""Single-user authentication.

The app is for one person, so there is no registration flow and no user table to
speak of: the first visit sets a password, and everything after that is a session
cookie. The pieces that matter for a service exposed to the internet are all
here — bcrypt hashing, server-side sessions that can be revoked, a CSRF token on
every state change, and per-IP rate limiting on the login route.
"""

from __future__ import annotations

import hmac
import os
import secrets
from datetime import datetime, timedelta, timezone

import bcrypt
from fastapi import HTTPException, Request, Response, status

from .db import get_conn, transaction
from .util import now_iso

SESSION_COOKIE = "track_session"
CSRF_COOKIE = "track_csrf"
CSRF_HEADER = "X-Track-CSRF"

SESSION_DAYS = int(os.environ.get("SESSION_DAYS", "90"))
SECURE_COOKIES = os.environ.get("SECURE_COOKIES", "true").lower() not in {"0", "false", "no"}

# Rate limiting: a short window with a low ceiling. Generous enough that a
# mistyped password is never a problem, tight enough that guessing is useless.
MAX_ATTEMPTS = int(os.environ.get("LOGIN_MAX_ATTEMPTS", "8"))
ATTEMPT_WINDOW_MINUTES = int(os.environ.get("LOGIN_WINDOW_MINUTES", "15"))

# A placeholder hash so a login attempt against an uninitialised instance costs
# the same time as a real one, instead of returning instantly and revealing that
# no password has been set.
_DUMMY_HASH = bcrypt.hashpw(b"placeholder", bcrypt.gensalt(rounds=12))


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode("ascii")


def verify_password(password: str, password_hash: str | None) -> bool:
    candidate = password.encode("utf-8")
    if password_hash is None:
        bcrypt.checkpw(candidate, _DUMMY_HASH)
        return False
    return bcrypt.checkpw(candidate, password_hash.encode("ascii"))


def is_initialised() -> bool:
    row = get_conn().execute("SELECT COUNT(*) AS n FROM user").fetchone()
    return row["n"] > 0


def create_user(username: str, password: str) -> None:
    stamp = now_iso()
    with transaction() as conn:
        if conn.execute("SELECT COUNT(*) AS n FROM user").fetchone()["n"] > 0:
            raise HTTPException(status.HTTP_409_CONFLICT, "Already set up")
        conn.execute(
            "INSERT INTO user (id, username, password_hash, created_at, updated_at)"
            " VALUES (1, ?, ?, ?, ?)",
            (username, hash_password(password), stamp, stamp),
        )


def change_password(current: str, new: str) -> None:
    conn = get_conn()
    row = conn.execute("SELECT password_hash FROM user WHERE id = 1").fetchone()
    if row is None or not verify_password(current, row["password_hash"]):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Current password is wrong")
    with transaction() as tx:
        tx.execute(
            "UPDATE user SET password_hash = ?, updated_at = ? WHERE id = 1",
            (hash_password(new), now_iso()),
        )
        # Changing the password logs every other device out, which is the whole
        # point of changing it.
        tx.execute("DELETE FROM sessions")


def client_ip(request: Request) -> str:
    # nginx on the VPS sets X-Forwarded-For; the left-most entry is the client.
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def check_rate_limit(ip: str) -> None:
    cutoff = (datetime.now(timezone.utc) - timedelta(minutes=ATTEMPT_WINDOW_MINUTES)).isoformat()
    row = get_conn().execute(
        "SELECT COUNT(*) AS n FROM login_attempts"
        " WHERE ip = ? AND at > ? AND successful = 0",
        (ip, cutoff),
    ).fetchone()
    if row["n"] >= MAX_ATTEMPTS:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Too many attempts. Try again in {ATTEMPT_WINDOW_MINUTES} minutes.",
        )


def record_attempt(ip: str, successful: bool) -> None:
    with transaction() as conn:
        conn.execute(
            "INSERT INTO login_attempts (ip, at, successful) VALUES (?, ?, ?)",
            (ip, now_iso(), 1 if successful else 0),
        )
        # Keep the table from growing without bound.
        conn.execute(
            "DELETE FROM login_attempts WHERE at < ?",
            ((datetime.now(timezone.utc) - timedelta(days=7)).isoformat(),),
        )


def start_session(response: Response, request: Request) -> None:
    token = secrets.token_urlsafe(32)
    csrf = secrets.token_urlsafe(24)
    now = datetime.now(timezone.utc)
    with transaction() as conn:
        conn.execute(
            "INSERT INTO sessions (token, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?)",
            (
                token,
                now.isoformat(timespec="seconds"),
                (now + timedelta(days=SESSION_DAYS)).isoformat(timespec="seconds"),
                request.headers.get("user-agent", "")[:200],
            ),
        )
        conn.execute("DELETE FROM sessions WHERE expires_at < ?", (now.isoformat(),))

    max_age = SESSION_DAYS * 24 * 3600
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=max_age,
        httponly=True,
        secure=SECURE_COOKIES,
        samesite="lax",
        path="/",
    )
    # Readable by JavaScript on purpose: the client echoes it back in a header,
    # which an attacker on another origin cannot do.
    response.set_cookie(
        CSRF_COOKIE,
        csrf,
        max_age=max_age,
        httponly=False,
        secure=SECURE_COOKIES,
        samesite="lax",
        path="/",
    )


def end_session(request: Request, response: Response) -> None:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        with transaction() as conn:
            conn.execute("DELETE FROM sessions WHERE token = ?", (token,))
    response.delete_cookie(SESSION_COOKIE, path="/")
    response.delete_cookie(CSRF_COOKIE, path="/")


def session_valid(request: Request) -> bool:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        return False
    row = get_conn().execute(
        "SELECT expires_at FROM sessions WHERE token = ?", (token,)
    ).fetchone()
    if row is None:
        return False
    return row["expires_at"] > datetime.now(timezone.utc).isoformat()


def require_session(request: Request) -> None:
    """FastAPI dependency: every API route except login and setup uses this."""
    if not session_valid(request):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not signed in")
    if request.method not in {"GET", "HEAD", "OPTIONS"}:
        sent = request.headers.get(CSRF_HEADER, "")
        expected = request.cookies.get(CSRF_COOKIE, "")
        if not sent or not expected or not hmac.compare_digest(sent, expected):
            raise HTTPException(status.HTTP_403_FORBIDDEN, "CSRF check failed")
