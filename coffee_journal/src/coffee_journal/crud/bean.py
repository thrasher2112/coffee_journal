"""CRUD helpers for Bean resources."""
from __future__ import annotations

from datetime import date
from typing import List, Optional, Tuple

from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..models import Bean, Brew

RowType = Tuple[Bean, Optional[date], Optional[date], Optional[float], Optional[int]]


def list_beans(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    q: Optional[str] = None,
    first_used_after: Optional[date] = None,
    last_used_before: Optional[date] = None,
) -> Tuple[List[RowType], int]:
    usage_stats = (
        select(
            Brew.bean_id.label("bean_id"),
            func.min(Brew.date).label("first_used_at"),
            func.max(Brew.date).label("last_used_at"),
            func.avg(Brew.rating).label("avg_rating"),
            func.count(Brew.id).label("brew_count"),
        )
        .group_by(Brew.bean_id)
        .subquery()
    )

    base_query = (
        select(
            Bean,
            usage_stats.c.first_used_at,
            usage_stats.c.last_used_at,
            usage_stats.c.avg_rating,
            usage_stats.c.brew_count,
        )
        .outerjoin(usage_stats, Bean.id == usage_stats.c.bean_id)
        .order_by(Bean.created_at.desc())
    )
    count_query = (
        select(func.count())
        .select_from(Bean)
        .outerjoin(usage_stats, Bean.id == usage_stats.c.bean_id)
    )

    conditions = []
    if q:
        like_value = f"%{q.lower()}%"
        conditions.append(
            or_(
                func.lower(Bean.name).like(like_value),
                func.lower(Bean.roaster).like(like_value),
                func.lower(Bean.origin).like(like_value),
            )
        )
    if first_used_after:
        conditions.append(usage_stats.c.first_used_at >= first_used_after)
    if last_used_before:
        conditions.append(usage_stats.c.last_used_at <= last_used_before)

    if conditions:
        base_query = base_query.where(*conditions)
        count_query = count_query.where(*conditions)

    total = db.scalar(count_query) or 0
    rows = db.execute(base_query.offset(skip).limit(limit)).all()
    return rows, total


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


def copy_bean(db: Session, bean: Bean) -> Bean:
    suffix = " (copy)"
    base_name = bean.name or "Untitled Bean"
    new_name = base_name + suffix
    if len(new_name) > 255:
        new_name = base_name[: 255 - len(suffix)] + suffix
    data = {
        "name": new_name,
        "roaster": bean.roaster,
        "origin": bean.origin,
        "process": bean.process,
        "roast_level": bean.roast_level,
        "notes": bean.notes,
    }
    return create_bean(db, data)
