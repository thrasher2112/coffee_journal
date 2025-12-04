"""CRUD helpers for Brew resources."""
from __future__ import annotations

from datetime import date, datetime
from typing import List, Optional, Tuple

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, selectinload

from ..models import Bean, Brew


def _base_brew_query() -> Select:
    return (
        select(Brew)
        .options(selectinload(Brew.bean))
        .order_by(Brew.date.desc(), Brew.created_at.desc())
    )


def list_brews(
    db: Session,
    skip: int = 0,
    limit: int = 50,
    bean_id: Optional[str] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
) -> Tuple[List[Brew], int]:
    query = _base_brew_query()
    count_query = select(func.count()).select_from(Brew)

    if bean_id:
        query = query.where(Brew.bean_id == bean_id)
        count_query = count_query.where(Brew.bean_id == bean_id)
    if start_date:
        query = query.where(Brew.date >= start_date)
        count_query = count_query.where(Brew.date >= start_date)
    if end_date:
        query = query.where(Brew.date <= end_date)
        count_query = count_query.where(Brew.date <= end_date)

    total = db.scalar(count_query) or 0
    items = db.execute(query.offset(skip).limit(limit)).scalars().all()
    return items, total


def get_brew(db: Session, brew_id: str) -> Optional[Brew]:
    return db.get(Brew, brew_id)


def create_brew(db: Session, data: dict) -> Brew:
    brew = Brew(**data)
    db.add(brew)
    db.commit()
    db.refresh(brew)
    return brew


def update_brew(db: Session, brew: Brew, data: dict) -> Brew:
    for key, value in data.items():
        setattr(brew, key, value)
    db.add(brew)
    db.commit()
    db.refresh(brew)
    return brew


def delete_brew(db: Session, brew: Brew) -> None:
    db.delete(brew)
    db.commit()


def metrics_overview(db: Session) -> dict:
    """Compute top beans, recent brews, and rating trends."""

    top_beans_query = (
        select(
            Bean.id,
            Bean.name,
            func.count(Brew.id).label("brew_count"),
            func.avg(Brew.rating).label("avg_rating"),
        )
        .join(Brew, Brew.bean_id == Bean.id)
        .group_by(Bean.id)
        .order_by(func.avg(Brew.rating).desc())
        .limit(5)
    )
    recent_brews_query = (
        select(Brew.id, Brew.date, Brew.rating, Bean.name.label("bean_name"))
        .join(Bean, Bean.id == Brew.bean_id)
        .order_by(Brew.date.desc())
        .limit(10)
    )
    rating_trends_query = (
        select(
            func.strftime("%Y-%W", Brew.date).label("week"),
            func.avg(Brew.rating).label("avg_rating"),
            func.count(Brew.id).label("count"),
        )
        .group_by("week")
        .order_by("week")
    )

    # SQLite compatibility: strftime not available in Postgres; fallback to date_trunc.
    dialect_name = getattr(getattr(db, "bind", None), "dialect", None)
    if getattr(dialect_name, "name", None) == "postgresql":
        rating_trends_query = (
            select(
                func.to_char(func.date_trunc("week", Brew.date), "IYYY-IW").label("week"),
                func.avg(Brew.rating).label("avg_rating"),
                func.count(Brew.id).label("count"),
            )
            .group_by("week")
            .order_by("week")
        )

    top_beans = [
        {
            "bean_id": row.id,
            "bean_name": row.name,
            "brew_count": row.brew_count,
            "avg_rating": float(row.avg_rating) if row.avg_rating is not None else None,
        }
        for row in db.execute(top_beans_query)
    ]
    recent_brews = [
        {
            "brew_id": row.id,
            "bean_name": row.bean_name,
            "date": row.date.isoformat() if row.date else None,
            "rating": row.rating,
        }
        for row in db.execute(recent_brews_query)
    ]
    rating_trends = [
        {
            "week": row.week,
            "avg_rating": float(row.avg_rating) if row.avg_rating is not None else None,
            "count": row.count,
        }
        for row in db.execute(rating_trends_query)
    ]

    return {
        "top_beans": top_beans,
        "recent_brews": recent_brews,
        "rating_trends": rating_trends,
    }
