"""API routers."""
from fastapi import APIRouter

from . import auth, beans, brews, data, metrics, preferences

api_router = APIRouter(prefix="/api")
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(beans.router, prefix="/beans", tags=["beans"])
api_router.include_router(brews.router, prefix="/brews", tags=["brews"])
api_router.include_router(metrics.router, prefix="/metrics", tags=["metrics"])
api_router.include_router(
    preferences.router, prefix="/preferences", tags=["preferences"]
)
api_router.include_router(data.router, tags=["sync"])

__all__ = ["api_router"]
