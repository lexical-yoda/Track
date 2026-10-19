#!/usr/bin/env bash
# Run Track locally: the API on 8470, serving the built frontend from
# frontend/dist. Build the frontend first with `npm --prefix frontend run build`,
# or run `npm --prefix frontend run dev` alongside this for hot reloading, which
# proxies /api here.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

export DATA_DIR="${DATA_DIR:-/tmp/track-dev}"
export STATIC_DIR="${STATIC_DIR:-$root/frontend/dist}"
export TZ="${TZ:-Asia/Kolkata}"
# Local development is plain HTTP, so a Secure cookie would never be stored.
export SECURE_COOKIES="${SECURE_COOKIES:-false}"

mkdir -p "$DATA_DIR"

exec "$root/backend/.venv/bin/python" -m uvicorn app.main:app \
  --app-dir "$root/backend" \
  --host 127.0.0.1 \
  --port "${PORT:-8470}" \
  --reload
