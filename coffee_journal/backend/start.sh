#!/usr/bin/env bash
set -euo pipefail

alembic upgrade head
python -m coffee_journal.scripts.seed_db
exec uvicorn coffee_journal.main:app --host 0.0.0.0 --port 8000
