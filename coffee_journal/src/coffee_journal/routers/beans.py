"""Bean endpoints."""
from __future__ import annotations

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
    db: Session = Depends(get_db),
):
    items, total = crud.bean.list_beans(db, skip=skip, limit=limit)
    return {"items": items, "total": total}


@router.post("/", response_model=BeanRead, status_code=status.HTTP_201_CREATED)
def create_bean(payload: BeanCreate, db: Session = Depends(get_db)):
    return crud.bean.create_bean(db, payload.dict())


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
    return crud.bean.update_bean(db, bean, payload.dict(exclude_unset=True))


@router.delete("/{bean_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_bean(bean_id: str, db: Session = Depends(get_db)):
    bean = crud.bean.get_bean(db, bean_id)
    if not bean:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Bean not found")
    crud.bean.delete_bean(db, bean)
    return None
