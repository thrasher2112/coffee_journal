"""Entry point for the Coffee Journal API."""
from __future__ import annotations

import logging
import mimetypes
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from sqlalchemy import text
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .rate_limit import limiter
from .routers import api_router

logger = logging.getLogger("coffee_journal.startup")


def _log_security_posture() -> None:
    """State the security-relevant configuration plainly at boot.

    Both of these fail silently when unset: the app starts, serves, and looks
    healthy while being wide open or leaking credentials into the log stream.
    Neither is visible from outside either - the magic-link endpoint answers
    identically whether or not an address is allowed, by design - so the boot
    log is the only place the posture can be seen.

    Counts, never the addresses themselves: this log is read in a hosting
    dashboard and should not become a list of who uses the app.
    """
    allowed = settings.allowed_email_set
    if allowed:
        logger.info("Sign-in restricted to %d allowed address(es).", len(allowed))
    else:
        logger.warning(
            "ALLOWED_EMAILS is not set: anyone who can reach this app can create "
            "an account, because requesting a magic link is registration."
        )

    if settings.resend_api_key:
        logger.info("Magic links will be emailed via Resend.")
    else:
        logger.warning(
            "RESEND_API_KEY is not set: magic links will be PRINTED TO THESE LOGS "
            "instead of emailed. Anyone who can read them can sign in."
        )


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Runs after uvicorn has configured logging, so these actually appear.
    _log_security_posture()
    yield


app = FastAPI(title=settings.app_name, lifespan=lifespan)
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
    # This header now covers the SPA itself, not just API JSON (see the static
    # mount below). Fonts are self-hosted so 'self' is enough for them; data:/blob:
    # cover the canvas charts and the JSON export download in Settings.
    response.headers["Content-Security-Policy"] = (
        "default-src 'self'; "
        "img-src 'self' data: blob:; "
        "font-src 'self'; "
        "frame-ancestors 'none'"
    )
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


# ---------------------------------------------------------------------------
# Static SPA
#
# The production image builds the frontend and drops it here, so the API and the
# app share one origin. That is what lets the session cookie stay SameSite=Lax
# and keeps CORS out of the picture entirely.
#
# When the directory is absent - the local split setup, where vite serves the
# frontend - none of this is installed and the app stays API-only.
# ---------------------------------------------------------------------------

# Not registered by default on every platform, and the bundled fonts are the
# only thing serving them.
mimetypes.add_type("font/woff2", ".woff2")
mimetypes.add_type("font/woff", ".woff")

STATIC_DIR = Path(
    os.getenv("STATIC_DIR", str(Path(__file__).resolve().parents[2] / "static"))
)

if (STATIC_DIR / "index.html").is_file():
    _INDEX = STATIC_DIR / "index.html"
    _ROOT = STATIC_DIR.resolve()
    _NO_STORE = {"Cache-Control": "no-cache, max-age=0"}

    if (STATIC_DIR / "assets").is_dir():
        # Vite fingerprints these, so they are safe to cache indefinitely.
        app.mount(
            "/assets",
            StaticFiles(directory=STATIC_DIR / "assets"),
            name="assets",
        )

    def _static_file(path: str) -> Path | None:
        """Resolve a URL path to a file inside STATIC_DIR, or None."""
        if not path:
            return None
        candidate = (STATIC_DIR / path).resolve()
        # Reject traversal: the resolved path must stay inside STATIC_DIR.
        if candidate.is_file() and candidate.is_relative_to(_ROOT):
            return candidate
        return None

    @app.exception_handler(404)
    async def spa_fallback(request: Request, exc: HTTPException) -> Response:
        """Serve the SPA for client-side routes and its root-level assets.

        Deliberately a 404 handler rather than a catch-all route: a catch-all
        matches before Starlette's own routing finishes, which silently turned
        the trailing-slash redirect on e.g. `/api/brews` into a 404. This runs
        only once real routing has already failed, so redirects and 405s behave
        exactly as they do without a frontend attached.
        """
        path = request.url.path

        # A miss under /api is a genuine miss and must stay JSON, never HTML.
        if path == "/api" or path.startswith("/api/"):
            return JSONResponse({"detail": exc.detail}, status_code=404)

        if request.method not in ("GET", "HEAD"):
            return JSONResponse({"detail": exc.detail}, status_code=404)

        served = _static_file(path.lstrip("/"))
        if served is not None:
            # A pinned service worker is nearly impossible to dislodge from a
            # phone, so never let it be cached.
            if served.name == "sw.js":
                return FileResponse(served, headers=_NO_STORE)
            return FileResponse(served)

        # Anything else is a client-side route: hand back the app shell.
        return FileResponse(_INDEX, headers=_NO_STORE)
