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
70 tests across:
- `test_health.py` — health endpoint
- `test_beans.py` — bean CRUD + search + filters
- `test_brews.py` — brew CRUD
- `test_auth.py` — magic link flow, session cookies, logout + revocation
- `test_multi_tenant.py` — cross-user isolation, IDOR checks
- `test_config.py` — production guard behavior
- `test_data.py` — import/export
- `test_metrics.py` — metrics endpoint
- `test_validation.py` — schema input limits

Run via Docker (tests dir not in image):
```bash
docker compose run --rm --no-deps \
  -v "$(pwd)/backend/tests:/app/tests" \
  api python -m pytest tests/ -q
```

---

## Frontend (React + Vite + Tailwind)

### Entry — `main.tsx`
- Unregisters any stale service workers before registering the new one (prevents old SW from intercepting `/api/` calls)
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
3. `AuthContext.checkAuth()` calls `GET /api/auth/me`; if 401, clears auth state

### Service worker — `public/sw.js`
- Cache version `v2`, auto-activates with `skipWaiting()` + `clients.claim()`
- **Never intercepts `/api/` requests** (bypasses entirely)
- Only caches `res.ok` responses (no error pages cached)

### API client — `lib/api.ts`
- `request<T>()` wrapper: adds `credentials: 'include'`, `Content-Type: application/json`; throws `AuthError` on 401
- Auth functions: `requestMagicLink`, `verifyMagicLink` (POST), `fetchCurrentUser`, `logoutUser`
- Data functions: `fetchBeans`, `createBean`, `updateBean`, `deleteBean`, `copyBean`
- Brew functions: `fetchBrews`, `createBrew`
- Util: `syncBrews` (flushes offline queue)

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
