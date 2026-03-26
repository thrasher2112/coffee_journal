{ pkgs, lib, config, ... }:

let
  apiPort = 3001;
  webPort = 4173;
  pgPort = 5555;
  pgDataDir =
    if pkgs.stdenv.isLinux
    then "/home/dev/.local/share/devenv/coffee-journal/postgres"
    else null;
in
{
  languages.python = {
    enable = true;
    package = pkgs.python311;
    venv.enable = true;
    uv = {
      enable = true;
      sync.enable = false;
    };
  };

  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_22;
    npm.enable = true;
  };

  packages = [
    pkgs.postgresql_16
  ];

  services.postgres = {
    enable = true;
    package = pkgs.postgresql_16;
    listen_addresses = "127.0.0.1";
    port = pgPort;
    initialDatabases = [
      { name = "coffee_journal"; }
    ];
    initialScript = ''
      CREATE ROLE postgres WITH LOGIN SUPERUSER CREATEDB PASSWORD 'postgres';
    '';
    settings = {
      log_connections = true;
      log_statement = "all";
    };
  };

  env = {
    PGPASSWORD = "postgres";
    DATABASE_URL = "postgresql+psycopg://postgres:postgres@127.0.0.1:${toString pgPort}/coffee_journal";
    DEBUG = "true";
    API_URL = "http://localhost:${toString apiPort}";
    FRONTEND_URL = "http://localhost:${toString webPort}";
    VITE_API_URL = "";
    JWT_SECRET = "change-me-in-production";
    JWT_EXPIRY_HOURS = "24";
    MAGIC_LINK_EXPIRY_MINUTES = "15";
    COOKIE_SECURE = "false";
  } // (if pgDataDir != null then {
    PGDATA = lib.mkForce pgDataDir;
  } else {});

  scripts.setup.exec = ''
    set -euo pipefail
    echo "Installing backend dependencies..."
    uv pip install -r backend/requirements.txt
    echo ""
    echo "Installing frontend dependencies..."
    npm --prefix frontend install
    echo ""
    echo "Running migrations..."
    (cd backend && PYTHONPATH=src alembic upgrade head)
    echo ""
    echo "Seeding database..."
    (cd backend && PYTHONPATH=src python -m coffee_journal.scripts.seed_db)
    echo ""
    echo "Setup complete!"
  '';

  scripts.api.exec = ''
    cd backend
    PYTHONPATH=src uvicorn coffee_journal.main:app --reload --host 0.0.0.0 --port ${toString apiPort}
  '';

  scripts.web.exec = ''
    cd frontend
    npm run dev -- --port ${toString webPort}
  '';

  scripts.test.exec = ''
    echo "==> Backend tests"
    (cd backend && PYTHONPATH=src python -m pytest tests/ -q)
    echo ""
    echo "==> Frontend tests"
    (cd frontend && npx vitest run)
  '';

  scripts.lint.exec = ''
    cd backend
    PYTHONPATH=src python -m ruff check src tests
  '';

  scripts.migrate.exec = ''
    cd backend
    PYTHONPATH=src alembic upgrade head
  '';

  enterShell = ''
    echo "coffee_journal dev environment"
    echo "  Python:   $(python --version)"
    echo "  UV:       $(uv --version)"
    echo "  Node:     $(node --version)"
    echo "  npm:      $(npm --version)"
    echo "  Postgres: $(psql --version)"
    echo ""
    echo "Commands:"
    echo "  setup     - Install deps, run migrations, seed DB"
    echo "  api       - Start FastAPI backend (port ${toString apiPort})"
    echo "  web       - Start Vite frontend (port ${toString webPort})"
    echo "  test      - Run backend + frontend tests"
    echo "  lint      - Run ruff linter on backend"
    echo "  migrate   - Run alembic migrations"
    echo ""
    echo "Postgres is running on port ${toString pgPort}"
  '';
}
