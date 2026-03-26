"""Brew endpoints."""

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy.orm import Session

from .. import crud
from ..auth import get_current_user
from ..db import get_db
from ..models.user import User
from ..rate_limit import limiter
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
    current_user: User = Depends(get_current_user),
):
    items, total = crud.brew.list_brews(
        db,
        user_id=current_user.id,
        skip=skip,
        limit=limit,
        bean_id=bean_id,
        start_date=start_date,
        end_date=end_date,
    )
    enriched = [_to_schema(brew) for brew in items]
    return {"items": enriched, "total": total}


@router.post("/", response_model=BrewRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_brew(
    request: Request,
    payload: BrewCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Verify the bean belongs to this user
    if not crud.bean.get_bean(db, payload.bean_id, current_user.id):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Bean not found"
        )
    data = payload.model_dump()
    data["user_id"] = current_user.id
    brew = crud.brew.create_brew(db, data)
    db.refresh(brew, attribute_names=["bean"])
    return _to_schema(brew)


@router.get("/{brew_id}", response_model=BrewRead)
def get_brew(
    brew_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brew = crud.brew.get_brew(db, brew_id, current_user.id)
    if not brew:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brew not found")
    db.refresh(brew, attribute_names=["bean"])
    return _to_schema(brew)


@router.put("/{brew_id}", response_model=BrewRead)
def update_brew(
    brew_id: str,
    payload: BrewUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brew = crud.brew.get_brew(db, brew_id, current_user.id)
    if not brew:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brew not found")
    # If bean_id is being changed, verify ownership of the new bean
    if payload.bean_id is not None:
        if not crud.bean.get_bean(db, payload.bean_id, current_user.id):
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Bean not found"
            )
    brew = crud.brew.update_brew(db, brew, payload.model_dump(exclude_unset=True))
    db.refresh(brew, attribute_names=["bean"])
    return _to_schema(brew)


@router.delete("/{brew_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_brew(
    brew_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    brew = crud.brew.get_brew(db, brew_id, current_user.id)
    if not brew:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Brew not found")
    crud.brew.delete_brew(db, brew)
    return None
