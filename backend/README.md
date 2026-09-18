# Coffee Journal

Coffee Journal is a Docker-first coffee logging stack composed of:

- **Backend** (`backend/src/coffee_journal`): FastAPI + SQLAlchemy 2.0 + Alembic, exposing beans/brews/metrics/sync routes.
- **Frontend** (`frontend/`): React + Vite + Tailwind PWA with Quick Brew capture, Beans library, All Cups archive, and dashboards.
- **PostgreSQL 16**: Primary datastore; migrations handled via Alembic.

Recent highlights:
- Quick Brew now tracks brew style (pour over, Aeropress, French press) with James Hoffmann ratio presets.
- Beans library features search, date filters, elevation (m), edit/copy/delete actions, and usage insights (first/last brew, average rating, brew count).
- “All Cups” page lists every brew (newest first) alongside the long‑running Best Cups hall of fame.

## Repository layout

```
.
├── docker-compose.yml            # db + api + web
├── Makefile                      # helper targets (docker-up, migrate, seed, etc.)
├── AGENTS.md                     # contributor guidelines
├── backend/                      # backend service (this directory)
│   ├── src/coffee_journal/       # FastAPI app, routers, models, CRUD, scripts
│   ├── tests/                    # pytest suites (SQLite)
│   ├── alembic/                  # migrations
│   └── README.md                 # current file
├── frontend/                     # Vite + React PWA
│   └── src/{pages,components,...}
└── docs/                         # shared docs
    ├── STRUCTURE.md              # architecture reference
    └── HANDOFF.txt               # status + roadmap
```

## Getting started

1. **Configure env vars**
   ```bash
   cd backend
   cp .env.example .env
   ```
2. **Launch the stack**
   ```bash
   cd ..
   docker compose up --build
   ```
   - API: <http://localhost:8000> (`/docs` for OpenAPI)
   - Frontend: <http://localhost:3000>
   - Postgres (host): <http://localhost:5555> (for psql/GUI; container port remains 5432)
3. **Seed data** (optional if containers already seeded):
   ```bash
   cd backend
   alembic upgrade head
   python -m coffee_journal.scripts.seed_db
   ```

## Local development

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn coffee_journal.main:app --reload
```
- Tests (SQLite in-memory): `pytest`
- Lint: `ruff check src`
- Migrations: `alembic revision --autogenerate -m "..."` then `alembic upgrade head`

### Frontend
```bash
cd frontend
npm install
npm run dev          # hot reload
npm run build        # production bundle
```

## Feature tour

- **Quick Brew bar** (Home):
  - Pick a bean, enter dose/yield, choose a brew style, and log tasting notes.
  - Ratio chips auto-adjust to the selected style (pour over, Aeropress, French press).
  - Advanced mode captures water temp, bloom/total time, agitation events, grinder name + grind setting, and separate overall/aroma/flavor ratings with flavor/aroma tags.
  - Measurement preferences (°C/°F) and grinder options are driven by user settings and stored in each brew (`grinder_name`, `aroma_rating`, `flavor_rating`, `aroma_tags`).
- **Beans library**:
  - Search by name/roaster/origin or filter by first/last brew dates.
  - Toggle edit mode to update, copy, or delete beans.
  - Each card displays first/last usage, brew count, and average rating (aggregated from brews).
- **All Cups**:
  - Chronological archive of every brew (newest first) powered by the `/api/brews` endpoint.
- **Best Cups**:
  - Spotlight on brews rated ≥ 8, sorted by score and recency.
- **Settings**:
  - Import/export, offline vault, and placeholder sync stubs (Google Drive integration TBD).

## API overview

- `GET /api/beans`, `POST /api/beans`, `PUT/DELETE /api/beans/{id}`, `POST /api/beans/{id}/copy`
  - Bean payloads optionally include `elevation_m` (meters above sea level).
- `GET/POST /api/brews`
  - Brew payloads support `grinder_name`, `grind_setting`, `aroma_rating`, `flavor_rating`, and `aroma_tags` in addition to the existing fields.
- `GET /api/metrics/overview` (top beans, recent brews, rating trend)
- `GET /export`, `POST /import`
- `GET /health`

See `/docs` for the full OpenAPI schema.

## Testing & QA

- Run `pytest` inside `backend/` for backend coverage (`tests/test_health.py`, `tests/test_beans.py`, `tests/test_brews.py`).
- Manual frontend smoke tests:
  1. Log a Quick Brew with each style (toggle °C/°F) and verify ratio chips, grinder dropdown, and rating sliders.
  2. Use Beans filters + edit mode actions (edit/copy/delete) and confirm counts update.
  3. Visit All Cups + Best Cups to ensure ordering and rating thresholds look right, and verify Recent Brews shows aroma tags + grinder name.
- `npm run build` catches TypeScript/ESLint issues during CI or pre-release builds.

## Style reference

UI styling follows `backend/style_example.jpg` and `frontend/src/assets/style-guide.md`. Use Tailwind tokens present in `frontend/src/styles/variables.css` for colors and typography to maintain the café aesthetic.
