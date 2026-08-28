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
| `RESEND_API_KEY` | *(empty)* | Leave blank to log links to console |
| `MAGIC_LINK_EXPIRY_MINUTES` | `15` | How long magic links stay valid |
| `SEED_USER_EMAIL` | `demo@coffeejournal.dev` | Account the seed data is attached to |

**Production guard**: if `DEBUG=false`, the app refuses to start without a strong `JWT_SECRET` and `COOKIE_SECURE=true`.

---

## Repo Structure

```
.
├── backend/
│   ├── src/coffee_journal/
│   │   ├── main.py          # CORS, security headers, router mount
│   │   ├── config.py        # Settings dataclass + production guards
│   │   ├── auth.py          # Magic links, JWT creation/validation, session revocation
│   │   ├── email.py         # Resend / console fallback
│   │   ├── rate_limit.py    # Shared slowapi limiter (proxy-aware)
│   │   ├── models/          # SQLAlchemy ORM (User, Bean, Brew, MagicLinkToken)
│   │   ├── schemas/         # Pydantic v2 (input limits, validation)
│   │   ├── crud/            # DB helpers (setattr allowlist, LIKE-escaped search)
│   │   ├── routers/         # beans, brews, auth, metrics, data
│   │   └── scripts/         # seed_db.py
│   ├── alembic/versions/    # 9 migrations (latest: token_version on users)
│   └── tests/               # 71 pytest tests (SQLite in-memory)
├── frontend/
│   └── src/
│       ├── pages/           # Login, AuthVerify, Home, Beans, AllCups, BestCups, Settings
│       ├── components/      # NavBar, ProtectedRoute, QuickLogBar, BrewCard, …
│       ├── contexts/        # AuthContext, PreferencesContext
│       ├── hooks/           # useLocalBrewStore
│       └── lib/api.ts       # fetch wrapper + all API calls
├── .github/workflows/ci.yml # Lint + test on PR
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
- **Settings**: JSON export/import (rate limited), offline vault sync, temperature unit preference, grinder management
- **PWA**: offline-capable with service worker (API calls are never cached/intercepted)

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

## Production Checklist

- [ ] Set `JWT_SECRET` to a random 32+ character string
- [ ] Set `COOKIE_SECURE=true`
- [ ] Set `COOKIE_DOMAIN` to your domain
- [ ] Set `DEBUG=false`
- [ ] Configure `RESEND_API_KEY` (or accept console-logged links)
- [ ] Set `FRONTEND_URL` and `API_URL` to your actual URLs
- [ ] Change `POSTGRES_PASSWORD` from default
- [ ] Run migrations before deploy: `alembic upgrade head`
- [ ] Verify no `.env` files are committed (`git status`)

---

## CI

GitHub Actions runs on every PR:
- **backend-lint**: `ruff check`
- **backend-test**: `pytest` (SQLite in-memory)
- **frontend-test**: `vitest run`
- **frontend-build**: `vite build` (TypeScript + bundler checks)

See `.github/workflows/ci.yml`.
