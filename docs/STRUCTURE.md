# Coffee Journal Architecture Overview

This document describes how the stack is organized for contributors.

## Top-Level Layout

```
.
├── docker-compose.yml            # orchestrates db, api, web (production parity)
├── docker-compose.override.yml   # dev overrides: source mounts + hot-reload
├── Makefile                      # helper commands
├── AGENTS.md                     # contributor guide
├── .github/workflows/ci.yml      # CI pipeline
├── backend/
│   ├── src/coffee_journal/       # application source
│   ├── alembic/versions/         # 9 DB migrations
│   ├── tests/                    # pytest suites (SQLite in-memory)
│   ├── requirements.txt
│   └── pyproject.toml            # ruff + pytest config
├── frontend/
│   └── src/                      # pages, components, contexts, hooks, lib
└── docs/
    ├── STRUCTURE.md              # this file
    └── HANDOFF.txt               # historical context
```

---

## Backend (FastAPI)

### Entry point — `main.py`
- Configures CORS (explicit methods/headers, origin allowlist from env)
- Adds `security_headers` HTTP middleware (CSP, X-Frame-Options, nosniff, Referrer-Policy)
- Attaches shared rate limiter to `app.state`
- Mounts `api_router` (prefix `/api`)
- Exposes `/health` (DB probe)

### Configuration — `config.py`
- `Settings` dataclass reads env vars at class-definition time
- `__post_init__` guard: if `DEBUG=false`, crashes on weak `JWT_SECRET` or missing `COOKIE_SECURE`
- In tests: set `os.environ["DEBUG"] = "true"` **before** importing the app (done in `conftest.py`), or pass kwargs directly to `Settings()`

### Database — `db.py`
- SQLAlchemy 2.0 async-style session factory
- PostgreSQL in production; SQLite in-memory for tests

### Models — `models/`
| Model | Key Fields |
|---|---|
| `User` | `id`, `email`, `display_name`, `token_version`, `created_at` |
| `MagicLinkToken` | `email`, `token`, `expires_at`, `used` |
| `Bean` | `user_id`, `name`, `roaster`, `origin`, `process`, `roast_level`, `elevation_m`, `notes` |
| `Brew` | `user_id`, `bean_id`, `date`, `bean_weight_g`, `water_weight_g`, `brew_style`, `grinder_name`, `grind_setting`, `grind_setting_notes`, `water_temp_c`, `bloom_time_s`, `total_brew_time_s`, `agitation_events`, `tasting_notes`, `flavor_tags`, `aroma_tags`, `rating`, `aroma_rating`, `flavor_rating` |

All user-owned data (`Bean`, `Brew`) has a `user_id` FK; every CRUD query filters by it.

### Authentication — `auth.py`
- `create_magic_link_token(db, email)` — creates a single-use 64-char hex token
- `verify_magic_link_token(db, token)` — validates, marks used, finds/creates user
- `cleanup_expired_tokens(db)` — called on every `/magic-link` request; deletes used/expired tokens
- `create_session_jwt(user)` — HS256 JWT with `sub`, `email`, `jti`, `token_version`, `iss`, `aud`, `iat`, `exp`
- `decode_session_jwt(token)` — validates signature, expiry, `iss`, `aud`
- `get_current_user(session, db)` — FastAPI dependency; validates `token_version` against DB (session revocation)

### Rate limiting — `rate_limit.py`
- Single shared `Limiter` instance (avoids duplicate instances between `main.py` and routers)
- Key function: `X-Forwarded-For` header → first IP (proxy-aware), fallback to `request.client.host`
- Disabled in tests via `limiter.enabled = False` in `conftest.py`

### Schemas — `schemas/`
`brew.py` imports `datetime as dt` and annotates `dt.date`/`dt.datetime`: a field named
`date` would otherwise shadow a bare `from datetime import date` under postponed
annotation evaluation and resolve to `Optional[None]`. See AGENTS.md.

Input limits enforced at the Pydantic layer:
- Bean text fields: `max_length=255` (name/roaster/origin), `max_length=5000` (notes)
- Brew text fields: `max_length=5000` (tasting_notes), `max_length=2000` (grind_setting_notes)
- Tag lists: `max_length=50` items
- Agitation events: `max_length=100` items
- Import: `max_length=500` beans, `max_length=2000` brews

### CRUD — `crud/`
- `bean.py`: search uses `%`/`_`-escaped LIKE; `update_bean` uses `_BEAN_MUTABLE_FIELDS` allowlist
- `brew.py`: `update_brew` uses `_BREW_MUTABLE_FIELDS` allowlist
- Ownership always checked: `get_bean(db, id, user_id)` returns `None` if user doesn't own it

### Routers — `routers/`
| Router | Prefix | Rate limited |
|---|---|---|
| `auth.py` | `/api/auth` | `/magic-link`: 5/min |
| `beans.py` | `/api/beans` | `POST /`: 30/min |
| `brews.py` | `/api/brews` | `POST /`: 30/min |
| `data.py` | `/api` | `GET /export`: 10/min; `POST /import`: 5/min |
| `metrics.py` | `/api/metrics` | — |

### Migrations — `alembic/versions/`
| Revision | Change |
|---|---|
| `20241202_01` | Initial tables (beans, brews) |
| `20250220_02` | Add `brew_style` |
| `20250220_03` | Add `aroma_rating`, `flavor_rating`, aroma/flavor tags |
| `20250220_04` | Add `grinder_name` |
| `20251216_05` | Add `elevation_m` on beans |
| `20260325_06` | Add `users` + `magic_link_tokens` tables |
| `20260325_07` | Add `user_id` FK to beans + brews |
| `20260325_08` | Backfill + enforce NOT NULL on `user_id` |
| `20260325_09` | Add `token_version` to users (session revocation) |

### Tests — `tests/`
78 tests across:
- `test_health.py` — health endpoint
- `test_beans.py` — bean CRUD + search + filters
- `test_brews.py` — brew CRUD (incl. `test_update_brew_date` regression)
- `test_auth.py` — magic link flow, session cookies, logout + revocation
- `test_multi_tenant.py` — cross-user isolation, IDOR checks
- `test_config.py` — production guard behavior + `DATABASE_URL` driver normalisation
- `test_data.py` — import/export, incl. id-collision and idempotency regressions
- `test_metrics.py` — metrics endpoint
- `test_validation.py` — schema input limits

Run via Docker (tests dir not in image):
```bash
docker compose run --rm --no-deps \
  -v "$(pwd)/backend/tests:/app/tests" \
  api python -m pytest tests/ -q
```

---

## Frontend (React 19 + Vite 8 + Tailwind 4)

### Entry — `main.tsx`
- Imports the self-hosted `@fontsource/*` faces (the CSP the API serves the app under blocks the Google Fonts CDN, and bundled fonts survive going offline)
- Registers `/sw.js`. It used to unregister every worker first, which left the page uncontrolled on most loads; `sw.js` skips `/api/` itself, so the workaround was obsolete
- Mounts `App` inside `AuthProvider` + `PreferencesProvider`

### Routing — `App.tsx`
All routes under `/` are wrapped in `ProtectedRoute` (redirects to `/login` if not authenticated).

| Route | Page | Notes |
|---|---|---|
| `/login` | `LoginPage` | Requests magic link |
| `/auth/verify` | `AuthVerifyPage` | POSTs token to backend, sets cookie |
| `/` | `HomePage` | Quick Brew + dashboard charts |
| `/beans` | `BeansPage` | Search, filter, edit/copy/delete |
| `/all-cups` | `AllCupsPage` | Full brew archive |
| `/best-cups` | `BestCupsPage` | Brews rated ≥8 |
| `/settings` | `SettingsPage` | Preferences, import/export, grinders |

### Auth flow
1. `AuthVerifyPage` extracts `?token=` from URL, POSTs it to `POST /api/auth/verify` (token in JSON body — never in URL to backend)
2. Backend sets `session` HttpOnly cookie
3. `AuthContext.checkAuth()` calls `GET /api/auth/me`. A real 401 (`AuthError`) clears auth state; an unreachable API (`NetworkError`) instead falls back to the identity cached in `localStorage`, so launching the installed app offline opens the journal rather than the login screen. That cache is display-only — the session is still the HttpOnly cookie and every call is authorised server-side.

### Service worker — `public/sw.js`
- Cache version `v4`, auto-activates with `skipWaiting()` + `clients.claim()`
- **Never intercepts `/api/` requests** (bypasses entirely) — now that the API shares the app's origin, this check is what keeps live data out of the shell cache
- At install, precaches the shell *and* parses `index.html` for the hashed `/assets/*` bundles; without them a first-ever offline launch renders an empty `<div id="root">`
- Navigations are network-first, falling back to the cached `index.html`, so client-side routes like `/beans` work offline (they have no file of their own)
- Everything else is cache-first; only `res.ok` responses are cached (no error pages)

### Styling — `styles/index.css`
Tailwind v4 CSS-first: `@import 'tailwindcss'` plus an `@theme` block holding the palette
(`night`, `espresso`, `crema`, `caramel`, `moss`, `ember`), fonts and `shadow-card`.
There is no `tailwind.config.js`; PostCSS uses `@tailwindcss/postcss` (autoprefixer dropped).

### API client — `lib/api.ts`
- `request<T>()` wrapper: adds `credentials: 'include'`, `Content-Type: application/json`; throws `AuthError` on 401
- Auth functions: `requestMagicLink`, `verifyMagicLink` (POST), `fetchCurrentUser`, `logoutUser`
- Data functions: `fetchBeans`, `createBean`, `updateBean`, `deleteBean`, `copyBean`
- Brew functions: `fetchBrews`, `createBrew`
- Util: `syncBrews` (flushes offline queue)
- `NetworkError` marks a request that never reached the API, as distinct from one that arrived and was rejected. Only the former should queue a brew or keep a cached session — a 422 queued as an outage would retry forever.
- `API_URL` defaults to `''` (same origin). See AGENTS.md before setting `VITE_API_URL`.

### Offline sync — `hooks/useBrewSync.ts`
- `useBrewSync()` is the single flush path, shared by Settings' "Sync now" button and the automatic flush
- `useAutoSync()` (mounted in `AuthenticatedLayout`) drains the queue on the `online` event, on tab focus, and on mount — previously syncing only ever happened if you remembered to open Settings and press the button
- Drafts with no `bean_id` can never be accepted by the API; they are reported back rather than silently dropped from the queue

### Navigation — `components/NavBar.tsx`
- Above `md`: the sticky header nav (`aria-label="Primary"`)
- Below `md`: a fixed bottom tab bar (`aria-label="Bottom navigation"`) with safe-area padding. The header nav is `display:none` there, so before this bar existed a phone had no navigation at all

---

## Data Flow

```
User enters email → POST /api/auth/magic-link
  → token printed to logs (dev) or emailed (prod)
  → user clicks link → frontend extracts token from URL
  → POST /api/auth/verify {token}
  → backend validates token, creates JWT, sets HttpOnly cookie
  → frontend calls GET /api/auth/me to confirm auth
  → redirect to /

Authenticated requests:
  → cookie sent automatically (credentials: 'include')
  → get_current_user: decode JWT → check token_version vs DB
  → all CRUD filtered by user_id

Logout:
  → POST /api/auth/logout
  → backend increments user.token_version
  → all existing JWTs rejected on next use
```

---

## Environments & Commands

```bash
# Full stack (prod-parity dev)
docker compose up --build

# Backend dev (local venv)
cd backend && python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn coffee_journal.main:app --reload

# Frontend dev
cd frontend && npm install && npm run dev

# Tests
docker compose run --rm --no-deps -v "$(pwd)/backend/tests:/app/tests" api python -m pytest tests/ -q
docker compose run --rm --no-deps web npx vitest run

# Migrations
docker compose run --rm api alembic upgrade head

# Lint
cd backend && python -m ruff check src tests
```
