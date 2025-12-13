# Coffee Journal Monorepo

This repository contains the full Coffee Journal stack:

- **Backend** (`backend/`): FastAPI + SQLAlchemy 2.0 + Alembic, serving beans/brews/metrics/import-export APIs.
- **Frontend** (`frontend/`): React + Vite + Tailwind PWA with Quick Brew logging, Beans library, All Cups archive, Best Cups, and Settings.
- **Infrastructure**: Root `docker-compose.yml` to run Postgres, API, and Web, plus Makefile helpers.

## Quick Start

```bash
cp backend/.env.example backend/.env   # configure DB + URLs
docker compose up --build              # boots db:5432, api:8000, web:3000
```

Visit:
- Frontend: <http://localhost:3000>
- API docs: <http://localhost:8000/docs>

The API container automatically runs migrations (`alembic upgrade head`) and seeds demo beans/brews.

## Repo Structure
```
.
├── AGENTS.md                 # contributor guide
├── README.md                 # (this file)
├── backend/                  # FastAPI backend + Alembic + tests
├── frontend/                 # React/Vite PWA
├── docs/STRUCTURE.md         # architecture overview
├── docker-compose.yml        # orchestrates db + api + web
└── Makefile                  # docker-up/down, migrate, seed, etc.
```

## Common Tasks

### Backend dev
```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn coffee_journal.main:app --reload
pytest          # backend tests (SQLite)
alembic upgrade head
```

### Frontend dev
```bash
cd frontend
npm install
npm run dev      # hot reload
npm run build    # production bundle
```

### Seeds & migrations
- Apply migrations manually: `cd backend && alembic upgrade head`
- Seed demo data: `python -m coffee_journal.scripts.seed_db`

### Useful Make targets
```bash
make docker-up        # docker compose up -d
make docker-down      # docker compose down
make migrate          # alembic upgrade head (inside backend)
make seed             # run seed script
make frontend-build   # npm run build
```

## Feature Highlights
- Quick Brew now tracks brew style (pour over, Aeropress, French press) with Hoffmann ratios, per-style water/dose presets, grinder selection, and split sliders for overall/aroma/flavor scoring.
- Advanced mode captures detailed brew data (water temp, bloom/total time, agitation timeline) with unit preferences (°C/°F) and default values that save automatically.
- Beans library offers search, date filters, edit/copy/delete actions, usage metadata, plus average ratings fed by the richer brew logs.
- All Cups lists every brew (newest first) while Best Cups spotlights ≥8 scores; Recent Brews cards render aroma tags, grinder details, and respect the chosen temperature unit.
- Settings provides offline export/import, sync stubs, temperature-unit toggle, and full CRUD for personal grinder lists (used throughout Quick Brew).

## Testing Notes
- Backend: `pytest` (SQLite). Keep regression coverage for beans/brews changes.
- Frontend: manual smoke tests (Quick Brew logging, Beans filters/edit, All Cups ordering). Automated UI tests are a TODO.
- CI tip: run `npm run build` before shipping to catch TypeScript or bundler errors.

## Roadmap Snapshot
- Authentication + multi-tenant safeguards
- Drive sync implementation behind existing stub
- Frontend automated tests (React Testing Library)
- Enhanced import/export validation and pagination

For deeper details, see `backend/README.md`, `docs/STRUCTURE.md`, and `docs/HANDOFF.txt`.

## Publishing / GitHub Prep

- Copy only safe config: keep `.env` files local (already `.gitignore`d) and verify no secrets are committed via `rg` or tools like `detect-secrets`.
- Run regression commands (`make api-test`, `make frontend-build`) before pushing so CI starts green.
- Review `docs/HANDOFF.txt` for outstanding production-readiness work (auth, multitenancy, ops) and convert items into issues if you’re opening the repo.
- Licensing: the repo now ships with the MIT License (`LICENSE` at repo root). Update the copyright line if
  you need to attribute a specific organization.
