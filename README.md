# Track

A private habit ledger. Two kinds of habit: things to stay away from, and things
to keep up. It runs as one container, behind a login, and installs on a phone as
a PWA.

## The idea

Most habit trackers assume you will tick a box every day. This one assumes the
opposite: **an ordinary day needs no attention at all.**

- A day with no entry means *clean* for a habit you are avoiding, and *not done*
  for one you are keeping up.
- You only open the app when something happened — you slipped, or you went to the
  gym.
- A slip is recorded, not punished. It carries an optional note, an amount, and a
  reason tag, and the history before it is never erased.

### Planned exceptions

The feature the other trackers do not have. A habit you are avoiding can **allow
planned exceptions**: an occasional cigarette at a party is a decision, not a
relapse. A planned slip is logged, shown in brass rather than madder, and counted
separately — but it does not reset your run.

Turn it off for a habit where any exception is a real break.

## Screens

| Screen | What it is for |
|---|---|
| **Today** | Every habit as a card: the current run as a large figure, and the current week as seven tappable cells. Logging a day you forgot never needs another screen. |
| **Habit** | The counter, a year heatmap, best run, days kept against days tracked, the success rate, milestones, and every day ever logged with its notes. |
| **Patterns** | Which weekday slips cluster on, what was going on, planned against unplanned, and a month-by-month trend. |
| **Settings** | Add, edit, reorder and archive habits; reason tags; theme; JSON and CSV export; password. |

Each habit carries its own colour and symbol, picked when it is set up: eighteen
suggested colours plus the system colour well, and a grid of symbols plus a field
that takes any emoji or character. The colour marks the habit everywhere it
appears and fills its days on the chart; the state colours — clean, slipped,
planned — never change with it, so a habit coloured red does not turn its own
clean run into an alarm.

## Running it

### Locally

```bash
# Backend
python3 -m venv backend/.venv
backend/.venv/bin/pip install -r backend/requirements.txt pytest httpx

# Frontend
npm --prefix frontend install
npm --prefix frontend run build

# Serve both on http://127.0.0.1:8470
scripts/dev.sh
```

For frontend hot reloading, run `npm --prefix frontend run dev` alongside
`scripts/dev.sh`; Vite proxies `/api` to port 8470.

To look at the app with plausible data:

```bash
DATA_DIR=/tmp/track-dev backend/.venv/bin/python scripts/seed_demo.py
```

That creates `demo` / `demo-password-1` and about a year of entries. It refuses
to run against a database that already holds habits.

### Tests

```bash
cd backend && .venv/bin/python -m pytest tests/ -q
```

The streak maths in `backend/app/stats.py` is the part worth testing, and
`tests/test_stats.py` covers it directly: planned against unplanned slips,
untracked days before a start date, and a positive habit's streak surviving an
unlogged today. `tests/test_api.py` covers auth, CSRF and the log round trip.

### In Docker

```bash
docker build -t track .
docker run --rm -p 8470:8470 -v "$PWD/data:/app/data" -e TZ=Asia/Kolkata \
  -e SECURE_COOKIES=false track
```

The first visit sets the username and password. There is no recovery, so put
them in a password manager.

## Configuration

| Variable | Default | What it does |
|---|---|---|
| `DATA_DIR` | `/app/data` | Where `track.db` lives. |
| `STATIC_DIR` | `/app/static` | The built frontend. |
| `TZ` | `Asia/Kolkata` | Decides when "today" rolls over. Every date in the app is a local date. |
| `SECURE_COOKIES` | `true` | Set `false` only for plain-HTTP local development. |
| `SESSION_DAYS` | `90` | How long a signed-in device stays signed in. |
| `LOGIN_MAX_ATTEMPTS` | `8` | Failed attempts per IP before a lockout. |
| `LOGIN_WINDOW_MINUTES` | `15` | The window those attempts are counted over. |

## Deployment

The repository is public and the image is public, so the NAS pulls without a
token. `deploy/` holds the two files that are not in this repository's build:

- `compose.yaml` — the Dockhand stack. Create
  `/mnt/apps/appdata/track` owned by uid 10001 before the first start.
- `nginx-track.conf` — the VPS site for `track.l3xj.com`. It uses a named
  upstream with `keepalive`, ships both a `listen 80` redirect and the 443
  block, and repeats the HSTS header inside `location /`.

Full notes, including the order to do things in, are in
`~/Documents/Personal/LLMDocs/personal-projects/track.md`.

## Security

Single user, no registration. bcrypt at 12 rounds; server-side sessions that can
be revoked; a double-submit CSRF token required on every write; per-IP rate
limiting on login; a strict CSP that allows nothing from another origin — no CDN,
no web fonts, no analytics. The container runs as a non-root user with a
read-only root filesystem.

Changing the password signs every other device out.

The icons are generated by `scripts/make_icons.py`, which draws them with the
standard library alone, so no rasteriser has to be installed to rebuild them.

## Layout

```
backend/app/
  main.py      app, security headers, static serving, CSV export
  db.py        connection handling and schema
  stats.py     streak, heatmap and summary maths — pure functions
  auth.py      bcrypt, sessions, CSRF, rate limiting
  repo.py      queries, and row to dataclass translation
  routers/     session.py, habits.py
frontend/src/
  components/  cells (the day cell at both scales), ui, LogSheet, HabitSheet, HabitBand
  screens/     Today, HabitDetail, Insights, Settings, Auth
  lib/         api, types, format, theme
  styles/      tokens.css (the design decisions), base.css, app.css
```
