.PHONY: docker-up docker-down migrate seed frontend-build api-test

ENV_FILE ?= coffee_journal/.env

export $(shell grep -v '^#' $(ENV_FILE) 2>/dev/null | xargs)

docker-up:
	docker compose up --build

docker-down:
	docker compose down -v

migrate:
	docker compose run --rm api alembic upgrade head

seed:
	docker compose run --rm api python -m coffee_journal.scripts.seed_db

frontend-build:
	docker compose run --rm web npm run build

api-test:
	cd coffee_journal && python -m pytest
