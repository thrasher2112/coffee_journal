"""Entry point for the Coffee Journal API."""
from __future__ import annotations

from fastapi import Depends, FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .rate_limit import limiter
from .routers import api_router

app = FastAPI(title=settings.app_name)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS: tighten for production, permissive in debug mode
allowed_origins: set[str | None] = set()
if settings.frontend_url:
    allowed_origins.add(settings.frontend_url.rstrip("/"))
if settings.api_url:
    allowed_origins.add(settings.api_url.rstrip("/"))
if settings.debug:
    allowed_origins.update({
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
    })

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(filter(None, allowed_origins)),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type"],
)

@app.middleware("http")
async def security_headers(request: Request, call_next):
    response: Response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Content-Security-Policy"] = "default-src 'self'; frame-ancestors 'none'"
    return response


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
