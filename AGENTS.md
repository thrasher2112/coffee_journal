# Repository Guidelines

Coffee Journal ships as a FastAPI backend (`backend/`) and a Vite/React frontend (`frontend/`) orchestrated via the root `docker-compose.yml`. API runs on port `8000`, frontend on port `3000`.

## Project Structure

```
.
├── AGENTS.md
├── backend/
│   ├── src/coffee_journal/
│   │   ├── main.py          # CORS, security headers middleware, app factory
│   │   ├── config.py        # Settings dataclass (env vars + production guards)
│   │   ├── auth.py          # Magic links, JWT, session revocation
│   │   ├── email.py         # Resend / console fallback
│   │   ├── rate_limit.py    # Shared slowapi Limiter instance
│   │   ├── models/          # SQLAlchemy ORM models
│   │   ├── schemas/         # Pydantic v2 schemas (input limits)
│   │   ├── crud/            # DB helpers
│   │   └── routers/         # beans, brews, auth, metrics, data
│   ├── alembic/versions/    # DB migrations
│   ├── tests/               # pytest suites
│   └── pyproject.toml       # ruff + pytest config
├── frontend/
│   └── src/
│       ├── pages/           # Login, AuthVerify, Home, Beans, AllCups, BestCups, Settings
│       ├── components/      # NavBar, ProtectedRoute, QuickLogBar, BrewCard, …
│       ├── contexts/        # AuthContext, PreferencesContext
│       ├── hooks/           # useLocalBrewStore
│       ├── styles/index.css # Tailwind v4 @theme (replaces tailwind.config.js)
│       └── lib/api.ts       # All API calls
├── .github/workflows/ci.yml # CI: lint + test + build
├── docker-compose.yml
├── docker-compose.override.yml
├── Makefile
└── docs/STRUCTURE.md        # Architecture deep-dive
```

## Development Workflow

```bash
# Full stack
cp backend/.env.example backend/.env
docker compose up --build

# Backend dev (local)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn coffee_journal.main:app --reload

# Frontend dev (local)
cd frontend && npm install && npm run dev

# Apply migrations
docker compose run --rm api alembic upgrade head

# Seed demo data
docker compose run --rm api python -m coffee_journal.scripts.seed_db
```

## Testing

```bash
# Backend — tests dir is NOT in the Docker image; mount it explicitly
docker compose run --rm --no-deps \
  -v "$(pwd)/backend/tests:/app/tests" \
  api python -m pytest tests/ -q

# Frontend — node_modules owned by root in Docker, must use compose
docker compose run --rm --no-deps web npx vitest run

# Make targets
make api-test
make api-test-auth   # auth + multi-tenant only
make frontend-test
make lint            # ruff check

# Natively (Python 3.12+ / Node 24+) — faster, and backend tests need no database
cd backend  && python -m pytest tests/ -q
cd frontend && npx vitest run
```

Current baseline: **71 backend tests, 17 frontend tests**, ruff clean.

Keep regression coverage when touching routers, CRUD helpers, or auth logic.

## Critical Patterns

**`from __future__ import annotations` must NOT appear in router files.**
Lazy type evaluation prevents Pydantic from resolving schema types at import time,
causing `PydanticUndefinedAnnotation` at startup. This applies to all files under
`routers/`. All other modules can use it freely.

**Pydantic v2**: `Optional[T]` fields without `= None` are treated as required. Always add `= None`.

**Never name a Pydantic field the same as the type it is annotated with.** In modules that use
`from __future__ import annotations`, the class body's assignment shadows the imported type before
Pydantic resolves the (string) annotation. `date: Optional[date] = None` silently resolves to
`Optional[None]`, so the field rejects every real value with "Input should be None" — this shipped
undetected in `BrewUpdate` and made `PUT /api/brews/{id}` unable to change a brew's date. Import the
module instead and qualify the annotation (`import datetime as dt` → `dt.date`), as `schemas/brew.py`
now does.

**Rate limiter**: there is one shared `Limiter` in `rate_limit.py`. Never create a second instance
in a router — import from `rate_limit` instead. In tests, `limiter.enabled = False` is set in
`conftest.py` before any requests are made.

**Settings dataclass**: `os.getenv()` defaults are evaluated at class-definition time (module import),
not at instantiation. `patch.dict(os.environ)` has no effect on existing defaults.
To test different configs, pass kwargs directly: `Settings(debug=False, jwt_secret="...")`.

**conftest.py ordering**: `os.environ["DEBUG"] = "true"` must be set before any app imports
so `Settings.__post_init__` doesn't raise on the default `jwt_secret`. This is already in place.

**SQLite tests**: FK cascades are not enforced. Test deletions by asserting 404 responses,
not by counting cascaded row deletions.

**dependency_overrides is global**: use the `make_client(user)` factory fixture for multi-tenant
tests so each client has the correct user injected.

**Never put a catch-all route in front of the API.** The SPA fallback in `main.py` is a
`@app.exception_handler(404)`, not a `@app.get("/{full_path:path}")`. A catch-all matches
during routing, before Starlette's `redirect_slashes` runs, which silently turned the 307 on
`/api/brews` → `/api/brews/` into a 404 (GET) and a 405 (POST). The frontend happened to use
trailing slashes so nothing broke visibly. A 404 handler runs only after routing has already
failed, so redirects and 405s behave exactly as they do with no frontend attached.

**The CSP now covers the SPA, not just API JSON.** `main.py` sends
`default-src 'self'` on every response, including the app HTML the API serves. Any CDN asset
is blocked outright with no visible error - this is why fonts are self-hosted via
`@fontsource/*` in `main.tsx` rather than imported from Google Fonts. Bundle new assets;
do not loosen the header.

**The frontend API base must stay relative.** `api.ts` defaults `API_URL` to `''` so requests
go to `/api/...` on whatever origin served the app. Setting `VITE_API_URL` bakes an absolute
host into the bundle at build time, which is what made earlier builds work only on the machine
that built them. Use it only for a genuinely split-origin deploy.

**Shell scripts must stay LF.** `.gitattributes` forces `eol=lf` on `*.sh` and `Dockerfile`.
Without it a Windows checkout (`core.autocrlf=true`) rewrites `start.sh` with CRLF and the
container dies at startup with `env: 'bash': No such file or directory`.

## Coding Standards

- **Python**: Black/PEP8, SQLAlchemy 2.0 style, Pydantic v2 `model_validate`/`model_dump`
- **TypeScript/React**: functional components, hooks, Tailwind utilities
- **Tailwind v4 is CSS-first**: there is no `tailwind.config.js`. The theme (colors `night`,
  `espresso`, `crema`, `caramel`, `moss`, `ember`; `font-display`/`font-body`; `shadow-card`)
  lives in the `@theme` block of `frontend/src/styles/index.css`. Add new design tokens there.
- **Commits**: Conventional Commits (`feat:`, `fix:`, `chore:`, `docs:`)
- When adding a field to Brew or Bean: wire it through the model, migration, schema, CRUD, router, and frontend types/API client

## Security Rules

- Never commit `.env` files (already `.gitignore`d)
- Never log or include the raw magic link token in responses — it goes to email/logs only
- All protected endpoints must use `Depends(get_current_user)`
- All CRUD functions must accept and filter by `user_id`
- New `setattr`-based update functions must use a field allowlist (`_BEAN_MUTABLE_FIELDS` / `_BREW_MUTABLE_FIELDS` pattern)
- Search strings passed to LIKE must be escaped (see `crud/bean.py` for the pattern)
- New endpoints that create or modify data should have a `@limiter.limit(...)` decorator
- Never give an account-creating script a default email address. Sign-in is by magic
  link, so any hardcoded address is an account whoever controls that domain's mailbox
  can claim. `seed_db.py` requires `SEED_USER_EMAIL` and skips seeding when unset.

## Ops Notes

- Postgres maps to host port `5555` (container `5432`) to avoid conflicts
- The API container runs `alembic upgrade head` + seed on every boot (safe to re-run)
- `docker compose down -v` drops the Postgres volume — data is lost
- `JWT_EXPIRY_HOURS=24` by default; the dev `.env.example` leaves it at 24
- In production: set `DEBUG=false`, `JWT_SECRET` (32+ chars), `COOKIE_SECURE=true`, `COOKIE_DOMAIN`
- Production is the **root `Dockerfile`**: one container, node builds the SPA into `/app/static`
  and FastAPI serves it same-origin. `docker-compose` still uses the split
  `backend/`+`frontend/` Dockerfiles for local dev — do not conflate the two.
- `start.sh` honours `$PORT` (managed hosts inject it) and passes `--proxy-headers`, without
  which the app cannot see the TLS terminator's original https scheme.
