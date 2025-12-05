# Coffee Journal

Coffee Journal is a Docker-first coffee logging stack composed of:

- **Backend** (`coffee_journal/src/coffee_journal`): FastAPI + SQLAlchemy 2.0 + Alembic, exposing beans/brews/metrics/sync routes.
- **Frontend** (`frontend/`): React + Vite + Tailwind PWA with Quick Brew capture, Beans library, All Cups archive, and dashboards.
- **PostgreSQL 16**: Primary datastore; migrations handled via Alembic.

Recent highlights:
- Quick Brew now tracks brew style (pour over, Aeropress, French press) with James Hoffmann ratio presets.
- Beans library features search, date filters, edit/copy/delete actions, and usage insights (first/last brew, average rating, brew count).
- “All Cups” page lists every brew (newest first) alongside the long‑running Best Cups hall of fame.

## Repository layout

```
.
├── docker-compose.yml            # db + api + web
├── Makefile                      # helper targets (docker-up, migrate, seed, etc.)
├── AGENTS.md                     # contributor guidelines
├── coffee_journal/               # backend service (this directory)
│   ├── src/coffee_journal/       # FastAPI app, routers, models, CRUD, scripts
│   ├── tests/                    # pytest suites (SQLite)
│   ├── alembic/                  # migrations
│   ├── README.md                 # current file
│   └── HANDOFF.txt               # status + roadmap
├── frontend/                     # Vite + React PWA
│   └── src/{pages,components,...}
└── docs/STRUCTURE.md             # architecture reference
```

## Getting started

1. **Configure env vars**
   ```bash
   cd coffee_journal
   cp .env.example .env
   ```
2. **Launch the stack**
   ```bash
   cd ..
   docker compose up --build
   ```
   - API: <http://localhost:8000> (`/docs` for OpenAPI)
   - Frontend: <http://localhost:3000>
3. **Seed data** (optional if containers already seeded):
   ```bash
   cd coffee_journal
   alembic upgrade head
   python -m coffee_journal.scripts.seed_db
   ```

## Local development

### Backend
```bash
cd coffee_journal
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
- `GET/POST /api/brews`
- `GET /api/metrics/overview` (top beans, recent brews, rating trend)
- `GET /export`, `POST /import`, `POST /sync/google-drive`
- `GET /health`

See `/docs` for the full OpenAPI schema.

## Testing & QA

- Run `pytest` inside `coffee_journal/` for backend coverage (`tests/test_health.py`, `tests/test_beans.py`, `tests/test_brews.py`).
- Manual frontend smoke tests:
  1. Log a Quick Brew with each style and verify ratio chips.
  2. Use Beans filters + edit mode actions (edit/copy/delete) and confirm counts update.
  3. Visit All Cups + Best Cups to ensure ordering and rating thresholds look right.
- `npm run build` catches TypeScript/ESLint issues during CI or pre-release builds.

## Style reference

UI styling follows `coffee_journal/style_example.jpg` and `frontend/src/assets/style-guide.md`. Use Tailwind tokens present in `frontend/src/styles/variables.css` for colors and typography to maintain the café aesthetic.
