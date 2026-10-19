"""Track — a personal habit tracker.

One FastAPI app serves both the JSON API under /api and the built single-page
frontend. Everything behind /api requires a session; the SPA itself is public,
because it shows nothing but a login form until the API answers.
"""

from __future__ import annotations

import csv
import io
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, Request
from fastapi.responses import FileResponse, JSONResponse, Response
from fastapi.staticfiles import StaticFiles

from . import repo
from .auth import require_session
from .db import init_db
from .routers import habits, session
from .util import iso, today

STATIC_DIR = Path(os.environ.get("STATIC_DIR", "/app/static"))


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="Track", docs_url=None, redoc_url=None, openapi_url=None, lifespan=lifespan
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    """Headers that matter for a single-page app on the public internet.

    The CSP is strict because the page needs nothing from anywhere else: no CDN,
    no web fonts, no analytics. Everything is served from this origin.
    """
    response = await call_next(request)
    response.headers.setdefault(
        "Content-Security-Policy",
        "default-src 'self'; "
        "script-src 'self'; "
        "style-src 'self' 'unsafe-inline'; "
        "img-src 'self' data:; "
        "font-src 'self'; "
        "connect-src 'self'; "
        "manifest-src 'self'; "
        "base-uri 'none'; "
        "form-action 'self'; "
        "frame-ancestors 'none'",
    )
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "same-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    response.headers.setdefault(
        "Permissions-Policy", "geolocation=(), camera=(), microphone=()"
    )
    return response


app.include_router(session.router)
app.include_router(habits.router)


@app.get("/api/health")
def health() -> dict:
    return {"ok": True, "date": iso(today())}


@app.get("/api/export.csv", dependencies=[Depends(require_session)])
def export_csv() -> Response:
    """A flat row per logged day, for a spreadsheet or a quick grep."""
    buffer = io.StringIO()
    writer = csv.writer(buffer)
    writer.writerow(["habit", "kind", "date", "amount", "unit", "planned", "reason", "note"])
    for row in repo.list_habits(include_archived=True):
        for entry in repo.list_entries(row["id"]):
            writer.writerow(
                [
                    row["name"],
                    row["kind"],
                    entry["date"],
                    entry["amount"] if entry["amount"] is not None else "",
                    row["unit"] or "",
                    "yes" if entry["planned"] else "no",
                    entry["reason"] or "",
                    (entry["note"] or "").replace("\n", " "),
                ]
            )
    return Response(
        buffer.getvalue(),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="track-{iso(today())}.csv"'},
    )


# --- Static frontend -------------------------------------------------------
# Mounted last so it never shadows an API route. Hashed Vite assets get a long
# cache; the shell and the service worker must not be cached, or a deploy would
# not reach an installed PWA.

if (STATIC_DIR / "assets").is_dir():
    app.mount(
        "/assets",
        StaticFiles(directory=STATIC_DIR / "assets"),
        name="assets",
    )


NO_CACHE = {"Cache-Control": "no-cache, must-revalidate"}


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str) -> Response:
    """Serve a real file when one exists, otherwise the app shell.

    Client-side routes such as /habit/3 have no file behind them, so anything
    unmatched falls through to index.html and React takes over.
    """
    if path.startswith("api/"):
        return JSONResponse({"detail": "Not found"}, status_code=404)

    candidate = (STATIC_DIR / path).resolve()
    if path and STATIC_DIR in candidate.parents and candidate.is_file():
        headers = NO_CACHE if candidate.name in {"sw.js", "index.html"} else None
        return FileResponse(candidate, headers=headers)

    index = STATIC_DIR / "index.html"
    if index.is_file():
        return FileResponse(index, headers=NO_CACHE)
    return JSONResponse(
        {"detail": "Frontend not built. Run `npm run build` in frontend/."},
        status_code=503,
    )
