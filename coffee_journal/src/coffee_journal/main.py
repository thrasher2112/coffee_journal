"""Entry point for the Coffee Journal API."""
from __future__ import annotations

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .routers import api_router

app = FastAPI(title=settings.app_name)

allowed_origins = {
    settings.frontend_url.rstrip("/") if settings.frontend_url else None,
    settings.api_url.rstrip("/") if settings.api_url else None,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
}

if settings.debug:
    allowed_origins = {"*"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(filter(None, allowed_origins)),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)


@app.get("/health", tags=["health"])
def health(db: Session = Depends(get_db)):
    """Lightweight health probe."""
    db_status = "ok"
    try:
        db.execute(text("SELECT 1"))
    except Exception:  # noqa: BLE001 - we intentionally mask DB errors for health
        db_status = "degraded"
    return {"status": "ok", "database": db_status}
