# Coffee Journal Architecture Overview

This document explains how the stack is organized so contributors can quickly find the right layer.

## Top-Level Layout
```
.
├── docker-compose.yml        # orchestrates db, api, web
├── Makefile                  # helper commands (docker-up, migrate, seed, etc.)
├── AGENTS.md                 # contributor guide
├── backend/                  # FastAPI backend
│   ├── src/coffee_journal/   # application source
│   ├── alembic/              # migrations
│   ├── tests/                # pytest suites
│   └── README.md             # backend runbook
├── frontend/                 # Vite + React PWA
│   └── src/                  # pages, components, hooks, lib
├── docs/STRUCTURE.md         # this file
└── docs/HANDOFF.txt          # roadmap + readiness checklist
```

## Backend (FastAPI)
- **Entry point**: `backend/src/coffee_journal/main.py`
  - Configures CORS, includes API router, exposes `/health`.
- **Configuration**: `config.py` reads env vars (DB URL, API/front URLs, debug flag).
- **Database**: `db.py` (SQLAlchemy engine/session). PostgreSQL in production; SQLite in tests.
- **Models**: `models/bean.py`, `models/brew.py`
  - Beans: metadata for each coffee.
  - Brews: log entries including brew style (`brew_style`), grinder names/settings, agitation events, aroma/flavor ratings (`aroma_rating`, `flavor_rating`), flavor/aroma tags, ratios, and tasting notes.
- **Schemas**: `schemas/*.py` define Pydantic models used by routers.
- **CRUD**: `crud/bean.py`, `crud/brew.py`
  - Beans CRUD now joins against brews to return usage metadata (first/last brew date, avg rating, brew count) and supports copying beans.
- **Routers**: `routers/`
  - `beans.py`: list/create/update/delete/copy + filters (`q`, `first_used_after`, `last_used_before`).
  - `brews.py`: CRUD for brews.
  - `metrics.py`: top beans, recent brews, rating trends.
  - `data.py`: import/export/sync stubs.
- **Scripts**: `scripts/seed_db.py` loads demo beans + brews (used on container start).
- **Migrations**: Alembic revisions live under `alembic/versions`. Latest revisions add brew style plus aroma/grinder fields (`20250220_03`, `20250220_04`) and bean elevation (`20251216_05`); run `alembic upgrade head` after pulling.
- **Tests**: `tests/test_health.py`, `tests/test_beans.py`, `tests/test_brews.py` use SQLite in-memory fixtures defined in `tests/conftest.py`.

## Frontend (React + Vite + Tailwind)
- **Entry**: `frontend/src/main.tsx` mounts `App`.
- **Routing**: `frontend/src/App.tsx` uses React Router with pages:
  - `HomePage`: Quick Brew, rating trend chart, top beans, recent brews.
  - `BeansPage`: search/filterable bean library with edit/copy/delete flows.
  - `AllCupsPage`: new archive listing every brew (newest first).
  - `BestCupsPage`: brews rated ≥ 8.
  - `BrewFormPage`: full brew form (beyond Quick Brew).
  - `SettingsPage`: import/export + offline tools, temperature-unit toggle, grinder management (add/remove/preferred), offline vault, sync stubs.
- **Components**:
  - `QuickLogBar`: captures brews with Hoffmann ratio presets, °C/°F-aware temperature inputs, grinder dropdown tied to settings, agitation timeline builder, and separate overall/aroma/flavor sliders.
  - `BrewCard`, `BeanPicker`, `FlavorWheel`, `AromaTags`, etc. (`BrewCard` respects temperature preferences and surfaces aroma tags + grinder metadata.)
  - `NavBar`: contains navigation links (Home, Beans, All Cups, Best Cups, Settings) plus Quick Log shortcut.
- **State & Hooks**:
  - `hooks/useLocalBrewStore.ts`: offline queue for unsynced brews.
- **API client**: `lib/api.ts`
  - Wraps fetch with JSON defaults. Provides helper functions for beans (with filters & copy), brews, metrics, import/export, sync.
- **Styles**:
  - Tailwind config + CSS variables under `frontend/src/styles`.
  - Style guide reference: `frontend/src/assets/style-guide.md`, plus `backend/style_example.jpg`.

## Data Flow
1. **User logs a brew** via Quick Log → `createBrew` -> `/api/brews/` → DB. Metrics endpoint reflects updated rating trends/top beans.
2. **Beans page** fetches `/api/beans/` with optional query params. Response includes usage metadata aggregated server-side.
3. **All Cups** pulls `/api/brews/`, sorts client-side (newest first), displays via `BrewCard`.
4. **Metrics** fetch `/api/metrics/overview` for charts (rating trend, top beans, recent brews).

## Environments & Commands
- **Everything at once**: `docker compose up --build` (db exposed on host port 5555)
- **Backend dev**: `uvicorn coffee_journal.main:app --reload`
- **Frontend dev**: `npm run dev` (port 5173 by default)
- **Tests**: `cd coffee_journal && pytest`
- **Build**: `npm run build` (frontend), `docker compose build` (full stack)
- **Migrations**: `alembic upgrade head`

## Known Gaps / Future Work
- Authentication & multi-tenant safeguards are not implemented.
- Google Drive sync endpoint is a stub.
- Frontend lacks automated tests; manual QA is still required.
- Import/export needs stronger validation/pagination for large datasets.

Refer back to `AGENTS.md` for contributor expectations and `docs/HANDOFF.txt` for roadmap context, especially if you’re preparing the repo for a public GitHub release.
