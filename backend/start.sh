#!/usr/bin/env bash
set -euo pipefail

alembic upgrade head
python -m coffee_journal.scripts.seed_db

# $PORT is injected by most managed hosts (Render, Cloud Run, Railway); fall back
# to 8000 for docker-compose. --proxy-headers is required so the app sees the
# original https scheme through the platform's TLS terminator - without it,
# redirects and absolute URLs come back as http.
exec uvicorn coffee_journal.main:app \
  --host 0.0.0.0 \
  --port "${PORT:-8000}" \
  --proxy-headers \
  --forwarded-allow-ips="*"
