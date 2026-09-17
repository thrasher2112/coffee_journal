# Production image: one container serving both the API and the built SPA.
#
# Single-origin on purpose. It keeps the session cookie on SameSite=Lax, takes
# CORS out of the picture, and means the frontend bundle needs no baked-in API
# host - it just calls relative /api paths against whatever origin served it.
#
# Local development does NOT use this file; docker-compose still builds the
# split backend/frontend images so vite HMR and uvicorn --reload keep working.

# ---- Stage 1: build the SPA -------------------------------------------------
FROM node:24-alpine AS frontend
WORKDIR /build

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# Deliberately no VITE_API_URL: an unset value makes the API base an empty
# string, i.e. same-origin relative requests. Baking a host in here is what made
# earlier builds unusable anywhere but the machine that built them.
RUN npm run build

# ---- Stage 2: the API, serving that build -----------------------------------
FROM python:3.13-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/src

WORKDIR /app

COPY backend/requirements.txt ./
RUN pip install --upgrade pip && pip install --no-cache-dir -r requirements.txt

COPY backend/pyproject.toml ./
COPY backend/alembic ./alembic
COPY backend/alembic.ini ./
COPY backend/src ./src
COPY backend/start.sh ./start.sh
RUN chmod +x /app/start.sh

# main.py looks here by default (override with STATIC_DIR).
COPY --from=frontend /build/dist ./static

CMD ["./start.sh"]
