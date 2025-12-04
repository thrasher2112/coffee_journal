"""CRUD helpers for Bean resources."""
from __future__ import annotations

from typing import List, Optional, Tuple

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from ..models import Bean


def list_beans(db: Session, skip: int = 0, limit: int = 50) -> Tuple[List[Bean], int]:
    total = db.scalar(select(func.count()).select_from(Bean)) or 0
    items = db.execute(select(Bean).offset(skip).limit(limit)).scalars().all()
    return items, total


def get_bean(db: Session, bean_id: str) -> Optional[Bean]:
    return db.get(Bean, bean_id)


def create_bean(db: Session, data: dict) -> Bean:
    bean = Bean(**data)
    db.add(bean)
    db.commit()
    db.refresh(bean)
    return bean


def update_bean(db: Session, bean: Bean, data: dict) -> Bean:
    for key, value in data.items():
        setattr(bean, key, value)
    db.add(bean)
    db.commit()
    db.refresh(bean)
    return bean


def delete_bean(db: Session, bean: Bean) -> None:
    db.delete(bean)
    db.commit()
