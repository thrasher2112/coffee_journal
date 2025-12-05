# Coffee Journal Monorepo

This repository contains the full Coffee Journal stack:

- **Backend** (`coffee_journal/`): FastAPI + SQLAlchemy 2.0 + Alembic, serving beans/brews/metrics/import-export APIs.
- **Frontend** (`frontend/`): React + Vite + Tailwind PWA with Quick Brew logging, Beans library, All Cups archive, Best Cups, and Settings.
- **Infrastructure**: Root `docker-compose.yml` to run Postgres, API, and Web, plus Makefile helpers.

## Quick Start

```bash
cp coffee_journal/.env.example coffee_journal/.env   # configure DB + URLs
docker compose up --build                            # boots db:5432, api:8000, web:3000
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
├── coffee_journal/           # FastAPI backend + Alembic + tests
├── frontend/                 # React/Vite PWA
├── docs/STRUCTURE.md         # architecture overview
├── docker-compose.yml        # orchestrates db + api + web
└── Makefile                  # docker-up/down, migrate, seed, etc.
```

## Common Tasks

### Backend dev
```bash
cd coffee_journal
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
- Apply migrations manually: `cd coffee_journal && alembic upgrade head`
- Seed demo data: `python -m coffee_journal.scripts.seed_db`

### Useful Make targets
```bash
make docker-up        # docker compose up -d
make docker-down      # docker compose down
make migrate          # alembic upgrade head (inside coffee_journal)
make seed             # run seed script
make frontend-build   # npm run build
```

## Feature Highlights
- Quick Brew now tracks brew style (pour over, Aeropress, French press) with James Hoffmann ratio presets.
- Beans library offers search, date filters, and edit/copy/delete actions while showing first/last brew dates, brew counts, and average ratings.
- All Cups lists every brew (newest first); Best Cups spotlights brews rated ≥ 8.
- Settings provides import/export, offline vault, and sync stubs (Google Drive integration planned).

## Testing Notes
- Backend: `pytest` (SQLite). Keep regression coverage for beans/brews changes.
- Frontend: manual smoke tests (Quick Brew logging, Beans filters/edit, All Cups ordering). Automated UI tests are a TODO.
- CI tip: run `npm run build` before shipping to catch TypeScript or bundler errors.

## Roadmap Snapshot
- Authentication + multi-tenant safeguards
- Drive sync implementation behind existing stub
- Frontend automated tests (React Testing Library)
- Enhanced import/export validation and pagination

For deeper details, see `coffee_journal/README.md`, `docs/STRUCTURE.md`, and `coffee_journal/HANDOFF.txt`.
