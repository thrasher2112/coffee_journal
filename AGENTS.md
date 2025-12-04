# Repository Guidelines

## Project Structure & Module Organization
This repo hosts the Codex AI stack for containerized agents. Keep the root tidy:

```
.
├── agents/              # agent configs, prompts, tools
├── src/                 # shared Python services/utilities
├── tests/               # unit & integration suites
├── assets/              # sample datasets, conversation logs
├── docs/                # design notes, diagrams
└── docker-compose.yml   # Open WebUI + runtime orchestration
```

Add runtime-specific env files under `configs/<service>.env`. Shared helper scripts belong in `scripts/` with the executable bit set.

## Build, Test, and Development Commands
- `docker compose up -d openwebui` boots the default UI backed by the data volume; use `docker compose down --remove-orphans` to reset.
- `docker compose exec openwebui bash` gives you a shell for manual checks or running migrations.
- `python -m venv .venv && source .venv/bin/activate` provisions the local toolchain; install agent dependencies with `pip install -r requirements.txt`.
- `pytest tests/unit` runs fast checks; `pytest tests/integration -m smoke` validates cross-agent workflows before pushing.

## Coding Style & Naming Conventions
Write Python modules with Black/PEP8 defaults (4-space indents, double quotes). Run `ruff check src agents` to enforce linting. YAML/JSON manifest files use two spaces, kebab-case keys, and descriptive IDs such as `assistant_router`. Agents live in `agents/<agent_name>/<agent_name>.yaml`; supporting modules follow snake_case filenames.

## Testing Guidelines
Every feature needs unit coverage plus one integration scenario describing the agent handshake. Name tests `test_<feature>.py` and classes `Test<Feature>`. Target ≥85% branch coverage (`pytest --cov=src --cov=agents`). When touching Compose, run `docker compose config` to verify syntax before merging.

## Commit & Pull Request Guidelines
Write commits using Conventional Commits (`feat: add planner agent`, `fix: tighten auth middleware`). Keep commits scoped and include rationale in the body when bumping dependencies. PRs must describe the change, include testing evidence (command output or screenshots from Open WebUI), reference issues (`Closes #123`), and mention follow-up work if deferred. Request review from another agent maintainer whenever altering docker orchestration or shared libraries.

## Security & Configuration Tips
Keep secrets in `.env.local` files excluded via `.gitignore`; never hardcode API keys. Rotate service tokens in `openwebui-data` when contributors leave. Validate any new third-party tools in a sandbox container before wiring them into production Compose profiles.
