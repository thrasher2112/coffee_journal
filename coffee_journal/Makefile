.PHONY: install run lint test format docker-up docker-down migrate seed frontend-build

install:
	python -m venv .venv && . .venv/bin/activate && pip install -r requirements.txt

run:
	uvicorn coffee_journal.main:app --host 0.0.0.0 --port 8000 --reload

lint:
	ruff check src

format:
	ruff format src
	ruff format tests

test:
	pytest

docker-up:
	docker compose up --build

docker-down:
	docker compose down --volumes

migrate:
	alembic upgrade head

seed:
	python -m coffee_journal.scripts.seed_db

frontend-build:
	cd ../frontend && npm install && npm run build
