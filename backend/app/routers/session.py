"""Setup, login, logout and password change."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status

from .. import auth
from ..db import get_conn
from ..schemas import LoginIn, PasswordChangeIn, SetupIn

router = APIRouter(prefix="/api/session", tags=["session"])


@router.get("/state")
def state(request: Request) -> dict:
    """What the client needs before it decides which screen to show."""
    initialised = auth.is_initialised()
    signed_in = auth.session_valid(request)
    username = None
    if signed_in:
        row = get_conn().execute("SELECT username FROM user WHERE id = 1").fetchone()
        username = row["username"] if row else None
    return {"initialised": initialised, "signed_in": signed_in, "username": username}


@router.post("/setup")
def setup(payload: SetupIn, request: Request, response: Response) -> dict:
    auth.create_user(payload.username, payload.password)
    auth.start_session(response, request)
    return {"ok": True, "username": payload.username}


@router.post("/login")
def login(payload: LoginIn, request: Request, response: Response) -> dict:
    ip = auth.client_ip(request)
    auth.check_rate_limit(ip)

    row = get_conn().execute("SELECT username, password_hash FROM user WHERE id = 1").fetchone()
    stored_hash = row["password_hash"] if row else None
    # Always run the hash comparison, so a wrong username and a wrong password
    # take the same time.
    password_ok = auth.verify_password(payload.password, stored_hash)
    username_ok = row is not None and payload.username == row["username"]

    if not (password_ok and username_ok):
        auth.record_attempt(ip, successful=False)
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Wrong username or password")

    auth.record_attempt(ip, successful=True)
    auth.start_session(response, request)
    return {"ok": True, "username": row["username"]}


@router.post("/logout")
def logout(request: Request, response: Response) -> dict:
    auth.end_session(request, response)
    return {"ok": True}


@router.post("/password", dependencies=[Depends(auth.require_session)])
def password(payload: PasswordChangeIn, request: Request, response: Response) -> dict:
    auth.change_password(payload.current_password, payload.new_password)
    # change_password revokes every session including this one, so sign back in
    # on this device rather than making the user log in again immediately.
    auth.start_session(response, request)
    return {"ok": True}
