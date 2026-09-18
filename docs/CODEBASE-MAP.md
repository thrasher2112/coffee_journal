# Codebase Map: coffee_journal
_Mapped 2026-09-18 at commit `aaf3db4`. Regenerate with `/onboard`._

**Read this alongside `docs/STRUCTURE.md` and `AGENTS.md`, not instead of them.**
Both are unusually thorough and largely accurate as of this commit — they were
cross-checked against the code below, not just paraphrased. This map exists to
add: verified commands, the handful of places those docs have drifted from the
code, and anything neither mentions. For file-by-file architecture detail
(router table, migration table, schema input limits), STRUCTURE.md is the
better source; don't re-derive it here.

## 1. What this does
A personal coffee-brewing journal: log pour-over/Aeropress/French-press brews
against a library of beans, rate them, and track trends over time. Single-user
per account, passwordless (magic-link) auth, installable as an offline-capable
PWA.

## 2. Stack and versions
- **Backend**: Python 3.13, FastAPI, SQLAlchemy 2.0 (sync, not async — see §5),
  Pydantic v2, Alembic, PostgreSQL via `psycopg3` in prod / SQLite in-memory
  for tests, `slowapi` for rate limiting, `python-jose`-style HS256 JWT in
  `auth.py`, Resend for email.
- **Frontend**: Node 24, React 19, TypeScript, Vite 8, Tailwind v4 (CSS-first,
  no `tailwind.config.js`), React Router, Vitest + Testing Library.
- **Infra**: Docker Compose (dev, split containers) + a single root
  `Dockerfile` (prod, one container). Deploy target is Render
  (`render.yaml`); DB is typically Neon Postgres in prod.

## 3. How to run it
Commands below are copied from `Makefile` and `README.md` and cross-checked
against each other — **note that `make api-test`, `make frontend-test`, and
`make lint` run natively (no Docker), while README's "Run tests" section
shows the Docker-mounted form of the same commands. Both work; they are not
the same invocation.** Only `frontend-build`, `migrate`, and `seed` actually
shell out to `docker compose`.

```bash
# Full stack (dev, split containers, hot reload)
cp backend/.env.example backend/.env   # set JWT_SECRET to 32+ random chars
docker compose up --build              # app :3000, api :8000, db :5555->5432

# Backend, native (Python 3.12+, no DB needed — SQLite in-memory)
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
PYTHONPATH=src alembic upgrade head
PYTHONPATH=src uvicorn coffee_journal.main:app --reload
cd backend && python -m pytest -q          # = `make api-test`. This sandbox's system
                                            # Python is 3.10 (repo wants 3.12+), but a
                                            # pre-existing Windows venv at backend/.venv
                                            # (Python 3.12) works: .venv/Scripts/python.exe

# Frontend, native (Node 24)
cd frontend && npm install && npm run dev
cd frontend && npx vitest run              # = `make frontend-test` (unverified — not run this session)

# Lint
cd backend && python3 -m ruff check src tests   # = `make lint` (or .venv/Scripts/python.exe -m ruff)

# Backend tests via Docker (tests dir is NOT baked into the image)
docker compose run --rm --no-deps -v "$(pwd)/backend/tests:/app/tests" api python -m pytest tests/ -q

# Migrations / seed (these DO use compose)
make migrate    # docker compose run --rm api alembic upgrade head
make seed       # docker compose run --rm api python -m coffee_journal.scripts.seed_db
```

Current baseline per README/STRUCTURE.md: 103 backend tests, 32 frontend
tests, ruff clean. Backend confirmed by an actual run this session (103
passed, ruff clean, via `backend/.venv/Scripts/python.exe`). Frontend count
still `(unverified)` — no Node/vitest run this session.

## 4. Directory map
- `backend/src/coffee_journal/main.py` — FastAPI app object, CORS, security
  headers, `/health`, SPA static-file serving + 404-handler fallback, boot
  security-posture log. Touch when changing global middleware, headers, or
  how the SPA is served.
- `backend/src/coffee_journal/config.py` — `Settings` dataclass, env var
  defaults evaluated at **import time** (not instantiation), production
  guards, `normalize_database_url`. Touch when adding a new env-driven
  setting.
- `backend/src/coffee_journal/auth.py` — magic link issuance/verification,
  JWT create/decode, `get_current_user` dependency, session revocation via
  `token_version`. Touch for anything auth-related; read AGENTS.md's Security
  Rules first.
- `backend/src/coffee_journal/rate_limit.py` — the one shared `slowapi`
  `Limiter` and `_get_real_ip` (trusted-hop `X-Forwarded-For` parsing). Never
  instantiate a second `Limiter`.
- `backend/src/coffee_journal/db.py` — sync SQLAlchemy engine/session
  (`create_engine`, `sessionmaker`), `get_db()` FastAPI dependency. Despite
  STRUCTURE.md calling it "async-style," it is plain synchronous SQLAlchemy —
  every router handler is `def`, not `async def` (confirmed in
  `routers/brews.py`).
- `backend/src/coffee_journal/models/` — SQLAlchemy ORM: `User`,
  `MagicLinkToken`, `Bean`, `Brew`. Touch when adding a persisted field (and
  then also touch alembic, schemas, crud, router, frontend types per
  AGENTS.md's checklist).
- `backend/src/coffee_journal/schemas/` — Pydantic v2 request/response
  shapes and input limits. `brew.py` and `bean.py` both do the `import
  datetime as dt` dance to avoid the field-name-shadows-type bug documented
  in AGENTS.md.
- `backend/src/coffee_journal/crud/` — DB access functions, all
  user_id-scoped. `_BEAN_MUTABLE_FIELDS` / `_BREW_MUTABLE_FIELDS` allowlists
  gate `setattr`-based updates.
- `backend/src/coffee_journal/routers/` — `auth`, `beans`, `brews`, `data`
  (export/import + a Google Drive stub, see §8), `metrics`, `preferences`.
  All mounted under `/api` via `routers/__init__.py:api_router`.
- `backend/alembic/versions/` — 11 migrations, applied automatically on
  container boot (`start.sh`). Touch when changing a model's persisted shape.
- `backend/tests/` — pytest suites, one file per router/concern, SQLite
  in-memory, no external DB required. `conftest.py` sets `DEBUG=true` before
  any app import and provides the `make_client(user)` multi-tenant fixture.
- `frontend/src/pages/` — one component per route (`Login`, `AuthVerify`,
  `Home`, `BrewForm`, `Beans`, `AllCups`, `BestCups`, `Settings`). Touch for
  page-level flow/layout changes.
- `frontend/src/components/` — reusable UI (`NavBar`, `ProtectedRoute`,
  `QuickLogBar`, `BrewCard`, `AromaTags`, `FlavorWheel`, `AgitationTimeline`,
  `BeanPicker`, `MinSecInput`, `ExportImportModal`). `QuickLogBar.tsx` is the
  single most-changed frontend file in git history (§8).
- `frontend/src/contexts/` — `AuthContext` (session state, `/api/auth/me`,
  offline fallback to cached identity), `PreferencesContext` (server-backed
  temperature unit / grinders, with localStorage as offline cache).
- `frontend/src/hooks/` — `useLocalBrewStore` (localStorage-backed offline
  brew queue), `useBrewSync` (`useBrewSync()` manual flush, `useAutoSync()`
  automatic flush on `online`/visibility/mount, mounted in
  `App.tsx:AuthenticatedLayout`).
- `frontend/src/lib/api.ts` — every backend call, the `request<T>()` fetch
  wrapper, `AuthError`/`NetworkError` distinction (only `NetworkError` should
  trigger offline queuing/cached-session fallback).
- `frontend/src/styles/index.css` — Tailwind v4 `@theme` block; this is
  where the design tokens (`night`, `espresso`, `crema`, `caramel`, `moss`,
  `ember`, `font-display`/`font-body`, `shadow-card`) live. There is no
  `tailwind.config.js`.
- `frontend/public/sw.js` — service worker; bypasses `/api/` entirely,
  network-first for navigations, cache-first otherwise, only caches `res.ok`.
- `Dockerfile` (root) — production single-container build (SPA built by
  Node stage, copied into the Python/FastAPI stage's `static/`).
  `docker-compose.yml` + `docker-compose.override.yml` — dev split
  containers; the override (auto-applied by plain `docker compose up`) sets
  `VITE_PROXY_TARGET` for the dev proxy.

## 5. The main path
Traced: logging a brew, end to end, including the offline path and the
ownership check that guards against cross-tenant writes.

1. `frontend/src/components/QuickLogBar.tsx` (or `pages/BrewForm.tsx`) —
   user fills out a brew, submits.
2. `frontend/src/hooks/useLocalBrewStore.ts` — the draft is queued locally
   first (localStorage), regardless of connectivity.
3. `frontend/src/hooks/useBrewSync.ts:useBrewSync().syncNow()` — filters
   queued drafts to those with a `bean_id`, calls `syncBrews()`; also run
   automatically by `useAutoSync()` (mounted in
   `frontend/src/App.tsx:AuthenticatedLayout`) on `online`, tab-visibility,
   and mount.
4. `frontend/src/lib/api.ts:syncBrews()` → `createBrew()` → `request<Brew>()`
   → `fetch('/api/brews/', { method: 'POST', credentials: 'include', ... })`.
   A network failure here throws `NetworkError` (distinct from a rejected
   request) and the draft stays queued for the next auto-sync attempt.
5. `backend/src/coffee_journal/routers/brews.py:create_brew()` — FastAPI
   handler. `Depends(get_current_user)` resolves the session cookie first
   (see auth flow below); `payload: BrewCreate` is validated by
   `schemas/brew.py`.
6. Same function: `crud.bean.get_bean(db, payload.bean_id, current_user.id)`
   — ownership check. Returns 404 (not the bean's data) if the bean doesn't
   belong to this user — this is the cross-tenant IDOR guard AGENTS.md
   references.
7. `backend/src/coffee_journal/crud/brew.py:create_brew()` — builds a
   `Brew(**data)` ORM object (with `user_id` injected by the router),
   commits, refreshes.
8. `backend/src/coffee_journal/models/brew.py:Brew` — persisted row;
   `ratio` is a computed Python property (`water_weight_g / bean_weight_g`),
   not a stored column.
9. Back in the router, `_to_schema()` wraps the ORM object in
   `schemas/brew.py:BrewRead`, adding `ratio` and `bean_name` via
   `model_copy(update={...})`, and returns 201.
10. `useBrewSync` marks the draft synced (`markSynced`) only after the
    `createBrew` call resolves without throwing.

**Auth flow** (shorter trace, since it gates step 5 above):
1. `pages/Login.tsx` → `api.ts:requestMagicLink(email)` →
   `POST /api/auth/magic-link` → `routers/auth.py` →
   `auth.py:create_magic_link_token()` (stores `sha256(token)` only, returns
   raw token) → `email.py` sends it (or logs it in dev).
2. User clicks the link; `pages/AuthVerify.tsx` reads the token from the URL
   **fragment** (`#token=...`, never the query string — see AGENTS.md) and
   POSTs it: `api.ts:verifyMagicLink()` → `POST /api/auth/verify` →
   `auth.py:verify_magic_link_token()` → sets an HttpOnly `session` cookie
   containing a JWT from `auth.py:create_session_jwt()`.
3. Every subsequent request: `auth.py:get_current_user()` decodes the JWT,
   checks `token_version` against the DB row (this is what makes logout
   revoke *all* sessions, not just the current one, by bumping that column).

## 6. Data model
- `User` (`models/user.py`) — `id` (UUID str), `email` (unique), `token_version`
  (session revocation counter), plus account-level brewing preferences:
  `temperature_unit`, `grinders` (JSON list), `preferred_grinder`. `NULL` on
  these three means "never set on the server" (distinct from "set empty") —
  the frontend falls back to its local default in that case.
- `MagicLinkToken` (`models/magic_link_token.py`) — `email`, `token_hash`
  (SHA-256 of the raw token; the raw value is never persisted), `expires_at`,
  `used`.
- `Bean` (`models/bean.py`) — `user_id` FK, `name`, `roaster`, `origin`,
  `process`, `roast_level`, `elevation_m`, `notes`.
- `Brew` (`models/brew.py`) — `user_id` FK, `bean_id` FK (`ondelete="CASCADE"`,
  but SQLite tests don't enforce FK cascades — assert via 404s, not row
  counts, per AGENTS.md), `date`, `bean_weight_g`, `water_weight_g`,
  `brew_style`, `grinder_name`, `grind_setting(_notes)`, `water_temp_c`,
  `bloom_time_s`, `total_brew_time_s`, `agitation_events` (JSON),
  `tasting_notes`, `flavor_tags`/`aroma_tags` (JSON), `rating`,
  `aroma_rating`, `flavor_rating`. `ratio` is a computed property, not a
  column.

Persistence: `backend/src/coffee_journal/db.py` — plain synchronous
SQLAlchemy 2.0 (`create_engine` + `sessionmaker`), one `Session` per request
via `get_db()`. Schema changes go through Alembic
(`backend/alembic/versions/`, 11 revisions as of this commit — applied
automatically on every container boot by `start.sh`, safe to re-run).

Frontend-side types mirroring these live in `frontend/src/types.ts` (the
9th-most-changed file in git history — kept in lockstep with backend schema
changes per AGENTS.md's "wire it through" checklist).

## 7. Conventions in force
- **User-scoped everything**: every CRUD function takes and filters by
  `user_id` (e.g. `crud/brew.py:get_brew(db, brew_id, user_id)` returns
  `None`, not someone else's row, on mismatch). The one documented exception
  is `routers/data.py:_id_taken()`, which checks global id uniqueness during
  import and is explicitly called out as not-to-be-generalized.
- **setattr update allowlists**: `crud/bean.py` and `crud/brew.py` each
  define a `_..._MUTABLE_FIELDS` frozenset gating any `setattr(obj, key,
  value)` loop, e.g. `crud/brew.py:_BREW_MUTABLE_FIELDS`.
- **No `from __future__ import annotations` in `routers/`**: breaks Pydantic
  schema resolution at import time. Present in `main.py`, `config.py`,
  `db.py`, `auth.py` (non-router modules), absent from every file in
  `backend/src/coffee_journal/routers/`.
- **Rate limiting**: one shared `Limiter` (`rate_limit.py`), imported by
  routers that need it (e.g. `routers/brews.py:create_brew` uses
  `@limiter.limit("30/minute")`). Never a second instance.
- **Pydantic schemas** (`schemas/`) qualify date/datetime types via `import
  datetime as dt` rather than `from datetime import date`, to dodge the
  field-name-shadows-type bug documented in AGENTS.md (see
  `schemas/brew.py:BrewUpdate.date: dt.date | None`).
- **Frontend state**: server is source of truth once reachable
  (`PreferencesContext`, `AuthContext`), localStorage is an offline
  cache/fallback, never the primary store. `AuthError` (401, real rejection)
  vs `NetworkError` (unreachable) is a load-bearing distinction throughout
  `lib/api.ts` — only `NetworkError` should trigger queuing or cached-session
  fallback.
- **Tests**: one file per router/concern in `backend/tests/`; multi-tenant
  isolation gets its own `test_multi_tenant.py` and uses a `make_client(user)`
  factory fixture (because `dependency_overrides` is global — see
  AGENTS.md). Frontend tests live in `__tests__/` siblings next to the code
  they cover (e.g. `components/__tests__/BrewCard.test.tsx`).

## 8. Where to be careful
- **`db.py`** is plain synchronous SQLAlchemy despite STRUCTURE.md's
  "async-style session factory" description — every router handler is
  `def`, not `async def`. Writing an `async def` handler that calls the sync
  session directly would block the event loop; don't pattern-match on the
  STRUCTURE.md wording here.
- **Hottest files** (by commit touch count over the last ~150 commits):
  `README.md`/`AGENTS.md`/`docs/STRUCTURE.md` (docs churn heavily — check
  they still match code before trusting a detail), then
  `frontend/src/components/QuickLogBar.tsx` (10), `frontend/src/types.ts` (9),
  `backend/src/coffee_journal/main.py` (8), `backend/.env.example` (8),
  `render.yaml` (7), `frontend/src/pages/Home.tsx` (7),
  `frontend/src/pages/Beans.tsx` (7), `frontend/src/lib/api.ts` (7),
  `frontend/src/components/BrewCard.tsx` (7),
  `backend/src/coffee_journal/config.py` (7). These are where changes land
  most often and where regressions are most likely.
- **SQLite test FK cascades**: don't test cascading deletes by counting
  rows — SQLite in the test suite doesn't enforce them. Assert via 404
  responses on the dependent resource instead (per AGENTS.md, followed in
  `backend/tests/test_brews.py`/`test_beans.py`).
- **Shell script line endings**: `.gitattributes` forces `eol=lf` on `*.sh`
  and `Dockerfile` — a Windows checkout without it breaks `start.sh` at
  container boot. Don't add a new `.sh` file without checking it's covered.

## Open questions
- Frontend test count (32) is still unverified — no Node/vitest run this
  session. Backend's 103 was confirmed by an actual `pytest` run (see §3).

## Resolved since first mapping (2026-09-18)
The four items originally listed here as issues/open questions were cleaned
up the same day the map was written:
- `config.py`'s stale "Render = 1 hop" comment and the matching stale
  comment in `backend/.env.example` now both say 3, matching README/AGENTS.md.
- Root `docker-compose.yml` no longer sets `VITE_API_URL` on the `web`
  service; the frontend Dockerfile's own `ARG VITE_API_URL=http://localhost:8000`
  default covers local dev, and `docker-compose.override.yml`'s
  `VITE_PROXY_TARGET` still handles the actual dev proxying.
- `backend/docker-compose.yml` (the undocumented, unreferenced duplicate)
  was deleted.
- The Google Drive sync stub (`sync/google_drive.py`, `GoogleDriveSyncStub`,
  and `routers/data.py`'s `/sync/google-drive` endpoint) was removed — it
  had no frontend caller and wasn't on the `docs/FUTURE_FEATURES.md`
  roadmap. `backend/README.md`'s endpoint list was updated to match.
