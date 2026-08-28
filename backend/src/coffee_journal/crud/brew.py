"""CRUD helpers for Brew resources."""
from __future__ import annotations

from datetime import date

from sqlalchemy import Select, func, select
from sqlalchemy.orm import Session, selectinload

from ..models import Bean, Brew


def _base_brew_query(user_id: str) -> Select:
    return (
        select(Brew)
        .options(selectinload(Brew.bean))
        .where(Brew.user_id == user_id)
        .order_by(Brew.date.desc(), Brew.created_at.desc())
    )


def list_brews(
    db: Session,
    user_id: str,
    skip: int = 0,
    limit: int = 50,
    bean_id: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> tuple[list[Brew], int]:
    query = _base_brew_query(user_id)
    count_query = select(func.count()).select_from(Brew).where(Brew.user_id == user_id)

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


def get_brew(db: Session, brew_id: str, user_id: str) -> Brew | None:
    brew = db.get(Brew, brew_id)
    if brew and brew.user_id != user_id:
        return None
    return brew


def create_brew(db: Session, data: dict) -> Brew:
    brew = Brew(**data)
    db.add(brew)
    db.commit()
    db.refresh(brew)
    return brew


_BREW_MUTABLE_FIELDS = frozenset({
    "date", "bean_id", "bean_weight_g", "water_weight_g", "brew_style",
    "grind_setting", "grind_setting_notes", "grinder_name", "water_temp_c",
    "bloom_time_s", "total_brew_time_s", "agitation_events", "tasting_notes",
    "flavor_tags", "aroma_tags", "rating", "aroma_rating", "flavor_rating",
})


def update_brew(db: Session, brew: Brew, data: dict) -> Brew:
    for key, value in data.items():
        if key in _BREW_MUTABLE_FIELDS:
            setattr(brew, key, value)
    db.add(brew)
    db.commit()
    db.refresh(brew)
    return brew


def delete_brew(db: Session, brew: Brew) -> None:
    db.delete(brew)
    db.commit()


def metrics_overview(db: Session, user_id: str) -> dict:
    """Compute top beans, recent brews, and rating trends for a user."""

    top_beans_query = (
        select(
            Bean.id,
            Bean.name,
            func.count(Brew.id).label("brew_count"),
            func.avg(Brew.rating).label("avg_rating"),
        )
        .join(Brew, Brew.bean_id == Bean.id)
        .where(Brew.user_id == user_id)
        .group_by(Bean.id)
        .order_by(func.avg(Brew.rating).desc())
        .limit(5)
    )
    recent_brews_query = (
        select(Brew.id, Brew.date, Brew.rating, Bean.name.label("bean_name"))
        .join(Bean, Bean.id == Brew.bean_id)
        .where(Brew.user_id == user_id)
        .order_by(Brew.date.desc())
        .limit(10)
    )
    rating_trends_query = (
        select(
            Brew.date.label("bucket_date"),
            func.avg(Brew.rating).label("avg_rating"),
            func.count(Brew.id).label("count"),
        )
        .where(Brew.user_id == user_id)
        .group_by(Brew.date)
        .order_by(Brew.date)
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
    rating_trends = []
    for row in db.execute(rating_trends_query):
        bucket_date = row.bucket_date
        iso_week = None
        if isinstance(bucket_date, date):
            iso_year, iso_week_number, _ = bucket_date.isocalendar()
            iso_week = f"{iso_year}-{iso_week_number:02d}"
        rating_trends.append(
            {
                "date": bucket_date.isoformat() if bucket_date else None,
                "iso_week": iso_week,
                "avg_rating": float(row.avg_rating) if row.avg_rating is not None else None,
                "count": row.count,
            }
        )

    return {
        "top_beans": top_beans,
        "recent_brews": recent_brews,
        "rating_trends": rating_trends,
    }
