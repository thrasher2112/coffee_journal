"""Bean endpoints."""
from __future__ import annotations

from datetime import date
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from .. import crud
from ..db import get_db
from ..schemas.bean import BeanCreate, BeanRead, BeanUpdate, BeanListResponse

router = APIRouter()


@router.get("/", response_model=BeanListResponse)
def list_beans(
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    q: Optional[str] = Query(None, min_length=1),
    first_used_after: Optional[date] = Query(None),
    last_used_before: Optional[date] = Query(None),
    db: Session = Depends(get_db),
):
    rows, total = crud.bean.list_beans(
        db,
        skip=skip,
        limit=limit,
        q=q,
        first_used_after=first_used_after,
        last_used_before=last_used_before,
    )
    items: list[BeanRead] = []
    for bean, first_used_at, last_used_at, avg_rating, brew_count in rows:
        bean_payload = BeanRead.model_validate(bean).model_copy(
            update={
                "first_used_at": first_used_at,
                "last_used_at": last_used_at,
                "avg_rating": float(avg_rating) if avg_rating is not None else None,
                "brew_count": int(brew_count or 0),
            }
        )
        items.append(bean_payload)
    return {"items": items, "total": total}


@router.post("/", response_model=BeanRead, status_code=status.HTTP_201_CREATED)
def create_bean(payload: BeanCreate, db: Session = Depends(get_db)):
    return crud.bean.create_bean(db, payload.model_dump())


@router.get("/{bean_id}", response_model=BeanRead)
def get_bean(bean_id: str, db: Session = Depends(get_db)):
    bean = crud.bean.get_bean(db, bean_id)
    if not bean:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bean not found")
    return bean


@router.put("/{bean_id}", response_model=BeanRead)
def update_bean(bean_id: str, payload: BeanUpdate, db: Session = Depends(get_db)):
    bean = crud.bean.get_bean(db, bean_id)
    if not bean:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bean not found")
    return crud.bean.update_bean(db, bean, payload.model_dump(exclude_unset=True))


@router.delete("/{bean_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bean(bean_id: str, db: Session = Depends(get_db)):
    bean = crud.bean.get_bean(db, bean_id)
    if not bean:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bean not found")
    crud.bean.delete_bean(db, bean)
    return None


@router.post("/{bean_id}/copy", response_model=BeanRead, status_code=status.HTTP_201_CREATED)
def copy_bean(bean_id: str, db: Session = Depends(get_db)):
    bean = crud.bean.get_bean(db, bean_id)
    if not bean:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bean not found")
    duplicate = crud.bean.copy_bean(db, bean)
    return duplicate
