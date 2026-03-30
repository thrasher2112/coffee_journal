"""Metrics endpoints."""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from .. import crud
from ..auth import get_current_user
from ..db import get_db
from ..models.user import User
from ..schemas.brew import MetricsOverview

router = APIRouter()


@router.get("/overview", response_model=MetricsOverview)
def overview(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return crud.brew.metrics_overview(db, user_id=current_user.id)
