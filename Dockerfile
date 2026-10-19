# Two stages: build the frontend with Node, then serve it from the Python image
# alongside the API. One container, one port.

FROM node:22-alpine AS frontend

WORKDIR /build
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build


FROM python:3.13-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    DATA_DIR=/app/data \
    STATIC_DIR=/app/static

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# A fixed, high uid so the bind-mounted data directory can be chowned on the
# host without guessing what the image picked.
RUN useradd --uid 10001 --create-home --shell /usr/sbin/nologin track \
    && mkdir -p /app/data \
    && chown track:track /app/data

COPY backend/app/ ./app/
COPY --from=frontend /build/dist/ ./static/

USER track

EXPOSE 8470

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8470/api/health || exit 1

# One worker on purpose: SQLite with a single writer, and a personal app that
# will never see concurrent load.
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8470", "--workers", "1", \
     "--proxy-headers", "--forwarded-allow-ips", "*"]
