"""Brew endpoints."""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import crud
from ..db import get_db
from ..schemas.brew import BrewCreate, BrewRead, BrewUpdate, BrewListResponse

router = APIRouter()


def _to_schema(brew) -> BrewRead:
    base = BrewRead.model_validate(brew)
    return base.model_copy(
        update={"ratio": brew.ratio, "bean_name": getattr(brew.bean, "name", None)}
    )


@router.get("/", response_model=BrewListResponse)
def list_brews(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    bean_id: Optional[str] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    items, total = crud.brew.list_brews(
        db,
        skip=skip,
        limit=limit,
        bean_id=bean_id,
        start_date=start_date,
        end_date=end_date,
    )
    enriched = [_to_schema(brew) for brew in items]
    return {"items": enriched, "total": total}


@router.post("/", response_model=BrewRead, status_code=status.HTTP_201_CREATED)
def create_brew(payload: BrewCreate, db: Session = Depends(get_db)):
    brew = crud.brew.create_brew(db, payload.dict())
    db.refresh(brew, attribute_names=["bean"])
    return _to_schema(brew)


@router.get("/{brew_id}", response_model=BrewRead)
def get_brew(brew_id: str, db: Session = Depends(get_db)):
    brew = crud.brew.get_brew(db, brew_id)
    if not brew:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brew not found")
    db.refresh(brew, attribute_names=["bean"])
    return _to_schema(brew)


@router.put("/{brew_id}", response_model=BrewRead)
def update_brew(brew_id: str, payload: BrewUpdate, db: Session = Depends(get_db)):
    brew = crud.brew.get_brew(db, brew_id)
    if not brew:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brew not found")
    brew = crud.brew.update_brew(db, brew, payload.dict(exclude_unset=True))
    db.refresh(brew, attribute_names=["bean"])
    return _to_schema(brew)


@router.delete("/{brew_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_brew(brew_id: str, db: Session = Depends(get_db)):
    brew = crud.brew.get_brew(db, brew_id)
    if not brew:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brew not found")
    crud.brew.delete_brew(db, brew)
    return None
