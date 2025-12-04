# Coffee Journal Prototype

## Product Goals
- Log every brew with beans, recipe, and tasting impressions in under 30 seconds.
- Surface trends (favorite roasters, optimal ratios) from historical data.
- Support cupping sessions where multiple tasters score the same beans.

## Personas & Use Cases
- **Home Brewer Ava** wants a fast mobile-friendly form to capture recipe + notes post-brew.
- **Cafe Lead Sam** stores shared recipes, tracks dial-ins, and exports tasting data for staff training.
- **Roaster Analyst Leo** compares cupping scores and bean origins to guide sourcing.

## Experience Flow
1. Landing dashboard highlights latest brews, bean inventory reminders, and quick actions (`+ Brew`, `Start Cupping`).
2. `+ Brew` opens a single-page modal with bean selector, brew parameters (dose, yield, temp, device), sliders for acidity/sweetness/body, and free-text notes.
3. `Start Cupping` generates a session code; participants join, log scores per attribute, and see consensus once closed.
4. Detail pages surface charts (brew by ratio, top beans, tasting radar). Editing uses inline sections rather than navigating away.

## Data Model (initial)
| Table | Key Fields | Notes |
| --- | --- | --- |
| `beans` | `id`, `name`, `roaster`, `origin_country`, `process`, `roast_date` | Optional `flavor_notes` JSON for tags |
| `brews` | `id`, `bean_id`, `brew_method`, `dose_g`, `yield_g`, `grind_setting`, `water_temp_c`, `brew_time_s`, `rating`, `notes`, `brewed_at` | FK to `beans`; `rating` 1-5 |
| `cupping_sessions` | `id`, `title`, `host_user_id`, `started_at`, `status` | status ∈ {draft, active, closed} |
| `cupping_scores` | `id`, `session_id`, `bean_id`, `taster`, `aroma`, `flavor`, `aftertaste`, `balance`, `overall`, `notes` | Weighted averages feed analytics |
| `users` (future) | `id`, `email`, `display_name`, `role` | roles: admin, member |

## API Surface (FastAPI)
- `GET /health` – existing probe returning API + DB status.
- `GET /api/beans` / `POST /api/beans` / `PATCH /api/beans/{id}` – CRUD for bean catalog with pagination + search (`?q=`).
- `GET /api/brews` – list brews with filters (`bean_id`, `method`, `date_range`).
- `POST /api/brews` – create brew entry; validates numeric ranges and auto-computes brew ratio.
- `GET /api/brews/{id}` – detail with derived insights (ratio, water-to-coffee). PATCH for edits.
- `POST /api/cupping-sessions` / `POST /api/cupping-sessions/{id}/scores` – manage collaborative cuppings.
- `GET /api/metrics/overview` – aggregates (favorite beans, average rating by method) powering dashboard cards.

## UI Prototype (web/mobile)
- **Dashboard**: Three cards (Upcoming Cuppings, Recent Brews, Bean Shelf) + chart widget (ratings vs. time). Primary CTA button persists bottom-right on mobile.
- **Brew Form**: Two-column layout on desktop; inputs grouped (Bean, Recipe, Tasting). Includes preset buttons for common ratios (1:15, 1:17). Inline validation shows brew ratio result instantaneously.
- **Cupping Session Screen**: Table view listing tasters vs. attributes; progress chips show completion. “Broadcast consensus” panel reveals averaged radar once all tasters submit.
- **Bean Detail**: Hero panel with roast info, collapsible history list, and “Brew again” shortcut pre-fills last recipe.

## Delivery Plan
1. **MVP sprint (Week 1-2)**: Implement beans + brews CRUD, dashboard skeleton, brew form UI, and analytics endpoint for totals.
2. **Cupping sprint (Week 3)**: Session model, real-time-ish updates via polling, consensus chart.
3. **Insights sprint (Week 4)**: Trend visualizations, export CSV, tagging system.

## Open Questions
- Auth: local accounts vs. OAuth? For prototype, consider passwordless magic links.
- Multi-tenant needs? If cafes share an instance, add `workspace_id` to core tables.
- Attachments: should photos of beans/brews be supported? Requires S3 or similar.

## Runbook & Interfaces
- `docker compose up --build` (repo root) starts `db` (Postgres 16), `api` (FastAPI on :8000 running Alembic + seeding), and `web` (Vite build served on :3000).
- Apply migrations manually with `docker compose run --rm api alembic upgrade head`; seed sample beans/brews via `docker compose run --rm api python -m coffee_journal.scripts.seed_db`.
- Frontend dev mode: `cd frontend && npm install && npm run dev -- --host` (hits API at `VITE_API_URL`, defaults to `http://localhost:8000`).
- OpenAPI docs: http://localhost:8000/docs; healthcheck: `curl -s http://localhost:8000/health`.
- Sample POSTs:
  ```bash
  curl -X POST http://localhost:8000/api/beans/ \
    -H 'Content-Type: application/json' \
    -d '{"name":"Kenya Kirinyaga","roaster":"SEY","origin":"Kenya"}'

  curl -X POST http://localhost:8000/api/brews/ \
    -H 'Content-Type: application/json' \
    -d '{"date":"2024-12-01","bean_id":"<bean_id>","bean_weight_g":18,"water_weight_g":288,"rating":9}'
  ```
- Import/export JSON via `POST /api/import` and `GET /api/export`; manual sync placeholder at `POST /api/sync/google-drive` prepares for OAuth.
- Frontend PWA + offline vault: Quick Log writes to `localStorage`, Settings > Sync posts unsynced brews back to `/api/brews/`.
