"""Metrics endpoints."""
from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import crud
from ..db import get_db
from ..schemas.brew import MetricsOverview

router = APIRouter()


@router.get("/overview", response_model=MetricsOverview)
def overview(db: Session = Depends(get_db)):
    return crud.brew.metrics_overview(db)
