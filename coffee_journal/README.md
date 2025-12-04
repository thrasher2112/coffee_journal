# Coffee Journal

Coffee Journal is a FastAPI service backed by PostgreSQL for logging brews, cuppings, and tasting notes. The project now ships with a Docker-first stack (API, Postgres, React/Tailwind frontend) plus a lightweight test suite to validate beans/brews endpoints.

## Project layout

```
coffee_journal/
├── docker-compose.yml      # FastAPI API + Postgres stack
├── Dockerfile              # Production-ready app image
├── requirements.txt        # Runtime + dev dependencies
├── pyproject.toml          # Packaging metadata
├── src/coffee_journal      # Application source
│   ├── api/                # Routers & view logic
│   ├── config.py           # Environment handling
│   ├── db.py               # SQLAlchemy session helpers
│   └── main.py             # FastAPI entrypoint
├── tests                   # Pytest suites
└── .env.example            # Copy to .env for Compose
```

## Getting started

1. Copy environment variables:
   ```bash
   cp .env.example .env
   ```
2. Launch everything from the repo root:
   ```bash
   docker compose up --build
   ```
3. Visit `http://localhost:3000` for the frontend (PWA) and `http://localhost:8000/docs` for the API schema. A seed script loads three beans + two brews automatically.

## Local development

- Install dependencies (outside containers):
  ```bash
  python -m venv .venv && source .venv/bin/activate
  pip install -r requirements.txt
  ```
- Run FastAPI with live reload:
  ```bash
  uvicorn coffee_journal.main:app --reload
  ```
- Run tests:
  ```bash
  pytest
  ```

- Tailwind/React dev server (from `frontend/`):
  ```bash
  npm install
  npm run dev
  ```

## Database migrations & seeds

- Apply migrations (local shell):
  ```bash
  alembic upgrade head
  ```
- Inside Docker:
  ```bash
  docker compose run --rm api alembic upgrade head
  docker compose run --rm api python -m coffee_journal.scripts.seed_db
  ```

## Style reference

The dark café aesthetic matches `codex/coffee_journal/style_example.jpg`. Palette + typography guidance lives in `frontend/src/assets/style-guide.md`.
