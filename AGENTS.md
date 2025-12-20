# Repository Guidelines

Coffee Journal ships as a FastAPI backend (`backend/`) and a Vite/React frontend (`frontend/`) orchestrated via the root `docker-compose.yml`. The stack exposes API port `8000` and web port `3000`.

## Project Structure
```
.
├── AGENTS.md
├── backend/                 # FastAPI service, Alembic, tests, docs
│   ├── src/coffee_journal   # config, routers, CRUD, models, scripts
│   ├── tests/               # pytest suites (SQLite in-memory)
│   ├── alembic/             # migrations
│   └── README.md            # backend runbook
├── frontend/                # React + Vite PWA
│   └── src/                 # pages, components, lib/api, styles
├── docs/STRUCTURE.md        # architecture map
├── docker-compose.yml       # db + api + web services
└── Makefile                 # helper targets (docker-up, migrate, etc.)
```

## Development Workflow
- Copy `backend/.env.example` to `.env`, then run `docker compose up --build` from repo root to start Postgres, API, and Web.
- Backend dev:
  - `cd backend`
  - `python -m venv .venv && source .venv/bin/activate`
  - `pip install -r requirements.txt`
  - `uvicorn coffee_journal.main:app --reload`
- Frontend dev:
  - `cd frontend && npm install`
  - `npm run dev`
- Apply migrations with `cd backend && alembic upgrade head`. The API container also runs migrations + seeds automatically on boot.
- Latest revisions (`20250220_03` and `20250220_04`) add aroma/flavor rating fields and `grinder_name`; `20251216_05` adds bean `elevation_m`. Run migrations after pulling to avoid column-missing errors.
- Build static assets with `cd frontend && npm run build` (Compose does this during image build as well).

## Testing Guidelines
- Backend tests live in `backend/tests`. Run `pytest` from `backend/` (SQLite in-memory DB). Keep regression coverage for new routers/CRUD helpers.
- Linting: `ruff check backend/src`.
- Frontend currently relies on manual/visual QA; add React Testing Library coverage when touching complex logic (QuickLog, Beans filters, All Cups sorting).

## Coding Standards
- Python: Black/PEP8, prefer dataclass settings, SQLAlchemy 2.0 style ORM, Pydantic v2 `model_validate`.
- TypeScript/React: functional components, hooks, Tailwind utility classes. Co-locate small helpers (e.g., `lib/api.ts`) and keep stateful pages under `src/pages`.
- Commits follow Conventional Commits (e.g., `feat: add all cups page`, `fix: beans filter timezone math`).
- When touching brew payloads, keep the new `grinder_name`, `aroma_rating`, `flavor_rating`, and `aroma_tags` fields wired through schemas, tests, and UI.

## Release & Ops Notes
- `docker compose up --build` is the canonical way to boot prod parity locally. Postgres maps to host port `5555` by default (container 5432).
- Makefile shortcuts: `make docker-up`, `make docker-down`, `make migrate`, `make seed`, `make frontend-build`.
- Seeds (`backend/src/coffee_journal/scripts/seed_db.py`) load demo beans/brews; rerun after dropping data to keep dashboards populated.

## Security & Configuration
- Never commit `.env` files; secrets stay in local `.env` copies (ignored via `.gitignore`).
- Postgres credentials default to `postgres/postgres`; adjust in `.env` for shared deployments.
- When wiring new third-party services (Drive sync, auth), prototype inside containers before exposing credentials, and document required environment vars in `backend/.env.example`.
