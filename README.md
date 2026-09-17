# Coffee Journal

A personal coffee brewing journal with passwordless authentication, multi-tenant data isolation, and a full security hardening pass.

- **Backend**: Python 3.13 + FastAPI + SQLAlchemy 2.0 + Alembic + PostgreSQL (psycopg3)
- **Frontend**: Node 24 + React 19 + TypeScript + Vite 8 + Tailwind 4 — PWA with offline support
- **Auth**: Magic link email → JWT in HttpOnly cookie (24h, session-revocable)
- **Infrastructure**: Docker Compose (db + api + web) + Makefile helpers + GitHub Actions CI

---

## Quick Start

```bash
cp backend/.env.example backend/.env
# Edit backend/.env: set JWT_SECRET to a random 32+ char string
docker compose up --build
```

Visit:
- App: <http://localhost:3000>
- API docs: <http://localhost:8000/docs>
- Health check: <http://localhost:8000/health>

The API container automatically runs migrations and seeds demo beans/brews on first boot.

### Running natively (no Docker)

Requires **Python 3.12+** and **Node 24+**, plus a PostgreSQL you point `DATABASE_URL` at.

```bash
# Backend
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
PYTHONPATH=src alembic upgrade head
PYTHONPATH=src uvicorn coffee_journal.main:app --reload

# Frontend (separate shell)
cd frontend && npm install && npm run dev
```

Backend tests need no database — they run against SQLite in-memory:

```bash
cd backend && python -m pytest tests/ -q      # conftest adds src/ to sys.path
cd frontend && npx vitest run
```

---

## Authentication

Coffee Journal uses **magic link** (passwordless) auth:

1. Enter your email at `/login`
2. A sign-in link is printed to API container logs (dev) or sent via Resend (prod)
3. Click the link → JWT session cookie is set → redirected to app

To sign out, use the logout button — this **revokes all active sessions** via a token version bump.

### Auth environment variables

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | `dev-secret-change-me` | **Must** be 32+ chars in production |
| `JWT_EXPIRY_HOURS` | `24` | Session lifetime |
| `COOKIE_SECURE` | `false` | Set `true` in production (HTTPS) |
| `COOKIE_DOMAIN` | *(empty)* | Set to your domain in production |
| `RESEND_API_KEY` | *(empty)* | Leave blank to log links to console instead of emailing |
| `RESEND_FROM` | `Coffee Journal <onboarding@resend.dev>` | Sender. The default is Resend's test sender: no domain verification needed, but it only delivers to your own Resend account address |
| `ALLOWED_EMAILS` | *(empty)* | Comma-separated addresses allowed to sign in. **Empty means anyone who can reach the app can create an account** — sign-in is passwordless, so requesting a link is registration |
| `TRUSTED_PROXY_HOPS` | `0` | Proxies in front of the app that append to `X-Forwarded-For` (3 on Render: Cloudflare, which fronts every public service by default, then Render's own internal load balancer). Rate limiting reads that hop as the client. Setting it too low is just as bad as too high — it reads a hop that churns per request instead of the real client, and rate limiting silently stops doing anything |
| `MAGIC_LINK_EXPIRY_MINUTES` | `15` | How long magic links stay valid |
| `SEED_USER_EMAIL` | *(empty)* | Address the sample data is attached to. **Unset = no seeding.** Use an address you control; it becomes a real loggable account |

**Production guard**: if `DEBUG=false`, the app refuses to start without a strong `JWT_SECRET` and `COOKIE_SECURE=true`.

`ALLOWED_EMAILS` and `TRUSTED_PROXY_HOPS` are *not* guarded — a wrong value fails silently
and is invisible from outside. The app states both in its startup log instead, so one glance
at the boot output confirms the posture.

---

## Repo Structure

```
.
├── backend/
│   ├── src/coffee_journal/
│   │   ├── main.py          # CORS, security headers, router mount, SPA serving, boot posture log
│   │   ├── config.py        # Settings dataclass + production guards
│   │   ├── auth.py          # Magic links, JWT creation/validation, session revocation
│   │   ├── email.py         # Resend / console fallback
│   │   ├── rate_limit.py    # Shared slowapi limiter (trusted-hop client key)
│   │   ├── models/          # SQLAlchemy ORM (User, Bean, Brew, MagicLinkToken)
│   │   ├── schemas/         # Pydantic v2 (input limits, validation)
│   │   ├── crud/            # DB helpers (setattr allowlist, LIKE-escaped search)
│   │   ├── routers/         # beans, brews, auth, metrics, data, preferences
│   │   └── scripts/         # seed_db.py
│   ├── alembic/versions/    # 11 migrations (latest: user preferences)
│   └── tests/               # 103 pytest tests (SQLite in-memory)
├── frontend/
│   └── src/
│       ├── pages/           # Login, AuthVerify, Home, Beans, AllCups, BestCups, Settings
│       ├── components/      # NavBar, ProtectedRoute, QuickLogBar, BrewCard, …
│       ├── contexts/        # AuthContext, PreferencesContext
│       ├── hooks/           # useLocalBrewStore, useBrewSync
│       └── lib/api.ts       # fetch wrapper + all API calls
├── Dockerfile               # Production image: one container, API + built SPA
├── render.yaml              # Render blueprint
├── .github/workflows/ci.yml # Lint + test on push/PR
├── docker-compose.yml
├── docker-compose.override.yml  # dev mounts + hot-reload
├── Makefile
└── docs/
    ├── STRUCTURE.md         # Architecture deep-dive
    └── HANDOFF.txt          # Historical context
```

---

## Common Tasks

### Run tests

```bash
# Backend (via Docker — tests dir is not in the image, must mount)
docker compose run --rm --no-deps \
  -v "$(pwd)/backend/tests:/app/tests" \
  api python -m pytest tests/ -q

# Frontend
docker compose run --rm --no-deps web npx vitest run

# Or use Make
make api-test
make frontend-test
```

### Lint

```bash
make lint
# or: docker compose run --rm --no-deps api python -m ruff check src tests
```

### Migrations

```bash
make migrate
# or: docker compose run --rm api alembic upgrade head
```

### Seed demo data

```bash
make seed
# or: docker compose run --rm api python -m coffee_journal.scripts.seed_db
```

### Make targets

```bash
make docker-up        # docker compose up --build
make docker-down      # docker compose down -v
make migrate          # alembic upgrade head
make seed             # run seed script
make api-test         # pytest (all backend tests)
make api-test-auth    # pytest auth + multi-tenant tests only
make frontend-test    # vitest run
make frontend-build   # npm run build
make lint             # ruff check
```

---

## Feature Highlights

- **Quick Brew**: brew style presets (pour over, Aeropress, French press) with Hoffmann ratios, grinder dropdown, °C/°F toggle, agitation timeline builder, split aroma/flavor/overall sliders
- **Beans library**: search, date filters, elevation field, edit/copy/delete, usage metadata (first/last used, avg rating, brew count)
- **All Cups / Best Cups**: full brew archive; Best Cups shows ≥8 rated brews with aroma tags and grinder details
- **Settings**: full backup/restore (beans, brews and preferences as one JSON file), offline queue sync, temperature unit preference, grinder management
- **Preferences follow the account**, not the browser — the same grinders and units on every device
- **PWA**: installable on a phone, works offline (API calls are never cached/intercepted); brews logged with no signal queue locally and sync themselves on reconnect

---

## Security

A full audit was completed covering 22 issues. Key hardening applied:

- Production config guards (startup crash if `JWT_SECRET` is weak or `COOKIE_SECURE` is off)
- Session revocation — logout bumps `token_version`; old JWTs are rejected on next request
- Magic link verify is `POST` (token in body, not URL/logs/history)
- Cross-tenant IDOR fix — brew create/update verifies bean ownership
- Input limits on all free-text and array fields
- Rate limiting: magic-link (5/min), bean/brew create (30/min), import (5/min), export (10/min)
- CORS restricted to explicit methods and `Content-Type` header only
- Security headers on all responses (`X-Content-Type-Options`, `X-Frame-Options`, `CSP`, `Referrer-Policy`)
- JWT `iss`/`aud` claims validated on decode
- LIKE wildcard escaping in bean search
- `setattr` allowlist on bean/brew update
- Service worker never caches error responses or `/api/` requests

---

## Deploying (and using it on a phone)

Production runs as **one container serving both the API and the built SPA** from
a single origin (root `Dockerfile`). That is not just tidiness:

- the session cookie stays `SameSite=Lax`, which a split frontend/API deploy
  would break;
- CORS stops mattering;
- the frontend bundle needs no baked-in API host - it calls relative `/api`
  paths against whatever origin served it. The old build froze
  `http://localhost:8000` into the bundle, which is why it only ever worked on
  the machine that built it.

Local development is unaffected: `docker compose up` still builds the split
backend/frontend images so vite HMR and `uvicorn --reload` keep working.

### One-time setup

1. **Database** - create a free [Neon](https://neon.tech) Postgres and copy its
   connection string in verbatim; the app pins the psycopg3 driver itself, so
   there is no scheme to hand-edit. Migrations run automatically on every boot
   (`backend/start.sh`), so the schema builds itself.

   With the Neon CLI you can skip the copying: `neon link --project-id <id>
   --branch production` writes `DATABASE_URL` into a gitignored `.env.local`.
2. **App** - point Render at this repo; `render.yaml` describes the service.
   Fill in the env vars it marks `sync: false`. Note `branch:` in that file:
   Render tracks whatever it names, so update it when the deploying branch
   changes or you will keep shipping a stale one.
3. **First deploy is two steps**: `FRONTEND_URL` and `API_URL` must be the URL
   Render assigns, which you only learn after the service exists. Deploy, copy
   the `https://...onrender.com` URL into both (no trailing slash), redeploy.
   Until then, magic-link emails will point at the wrong host.
4. **Email** - add a `RESEND_API_KEY`. Without one the app still "works" but
   prints the sign-in link to the logs instead of emailing it, which reads as a
   silent failure. `RESEND_FROM` defaults to Resend's test sender, which needs
   no domain verification but only delivers to your own Resend account address -
   fine for a personal journal, not for inviting anyone else.
5. **Move your data across** - use Settings → Back up / Restore on the local
   instance, then restore the file on the deployed one.

### Backups

Settings → Back up / Restore downloads everything the account holds - beans,
brews and preferences - plus any brews still queued offline on that device.
Restoring merges by id, so re-running the same file updates in place instead of
duplicating. Worth doing periodically: a free managed database gives you no
backup you control.

The free Render instance sleeps after ~15 minutes idle and takes ~50s to wake.
The service worker still paints the app shell instantly and the offline queue
accepts a brew regardless, so it mostly hides. If it stops being tolerable,
Cloud Run or Fly.io cold-start in a few seconds instead.

### Installing on a phone

Open the deployed URL and use "Add to Home Screen" (iOS) or "Install app"
(Android). It then runs standalone, and brews logged with no signal are queued
in `localStorage` and flushed automatically when the connection returns.

## Production Checklist

- [ ] Set `JWT_SECRET` to a random 32+ character string (the app refuses to boot otherwise)
- [ ] Set `COOKIE_SECURE=true` (likewise enforced at boot)
- [ ] Set `COOKIE_DOMAIN` to your domain (only needed for a multi-subdomain setup)
- [ ] Leave `DEBUG` unset so the production config guards stay armed
- [ ] Configure `RESEND_API_KEY` (or accept console-logged links)
- [ ] Set `FRONTEND_URL` and `API_URL` to the deployed URL, no trailing slash
- [ ] Leave `VITE_API_URL` unset - the single-origin build wants a relative base
- [ ] Change `POSTGRES_PASSWORD` from default (self-hosted Postgres only)
- [ ] Set `ALLOWED_EMAILS` to the addresses that may sign in - **empty means anyone who
      finds the URL can create an account**, because requesting a magic link is registration
- [ ] Set `TRUSTED_PROXY_HOPS` to the number of proxies in front of the app (3 on Render:
      Cloudflare, then Render's own internal load balancer). Too low - including the
      default 0 - buckets every visitor together or, worse, reads a hop that churns per
      request and disables rate limiting outright; too high lets callers forge their own
      bucket
- [ ] Leave `SEED_USER_EMAIL` unset so no demo account is created
- [ ] Verify no `.env` files are committed (`git status`)

---

## CI

GitHub Actions runs on every PR:
- **backend-lint**: `ruff check`
- **backend-test**: `pytest` (SQLite in-memory)
- **frontend-test**: `vitest run`
- **frontend-build**: `vite build` (TypeScript + bundler checks)

See `.github/workflows/ci.yml`.
