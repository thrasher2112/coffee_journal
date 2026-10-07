"""CRUD helpers for BrewSetup resources. Every query is scoped by user_id."""
from __future__ import annotations

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models import BrewSetup
from ..models.brew_setup import UNIQUE_NAME_INDEX

_SETUP_MUTABLE_FIELDS = frozenset({
    "name",
    "brew_style",
    "ratio",
    "dose_g",
    "grinder_name",
    "target_time_s",
    "machine_profile",
})


class DuplicateSetupName(Exception):
    """The user already has a setup with this name (case-insensitive)."""


def list_setups(db: Session, user_id: str) -> list[BrewSetup]:
    stmt = (
        select(BrewSetup)
        .where(BrewSetup.user_id == user_id)
        .order_by(func.lower(BrewSetup.name), BrewSetup.name, BrewSetup.id)
    )
    return list(db.scalars(stmt))


def get_setup(db: Session, setup_id: str, user_id: str) -> BrewSetup | None:
    stmt = select(BrewSetup).where(
        BrewSetup.id == setup_id, BrewSetup.user_id == user_id
    )
    return db.scalars(stmt).first()


def name_taken(
    db: Session, user_id: str, name: str, exclude_id: str | None = None
) -> bool:
    """Case-insensitive name check, using the same lower() as the unique index."""
    stmt = select(BrewSetup.id).where(
        BrewSetup.user_id == user_id,
        func.lower(BrewSetup.name) == func.lower(name),
    )
    if exclude_id is not None:
        stmt = stmt.where(BrewSetup.id != exclude_id)
    return db.scalars(stmt.limit(1)).first() is not None


def _is_duplicate_name_error(exc: IntegrityError) -> bool:
    # Postgres (psycopg) names the violated constraint in diag; SQLite only
    # puts the index name in the message text.
    diag = getattr(exc.orig, "diag", None)
    constraint = getattr(diag, "constraint_name", None)
    if constraint is not None:
        return constraint == UNIQUE_NAME_INDEX
    return UNIQUE_NAME_INDEX in str(exc.orig)


def _commit(db: Session) -> None:
    """Commit, mapping a unique-name violation to DuplicateSetupName.

    The pre-check in create/update cannot see a concurrent writer, so the index
    is the real guarantee. Only that index is mapped: any other integrity error
    (e.g. a missing user) is a bug and must stay loud.
    """
    try:
        db.commit()
    except IntegrityError as exc:
        db.rollback()
        if _is_duplicate_name_error(exc):
            raise DuplicateSetupName from exc
        raise


def create_setup(db: Session, data: dict) -> BrewSetup:
    if name_taken(db, data["user_id"], data["name"]):
        raise DuplicateSetupName
    setup = BrewSetup(**data)
    db.add(setup)
    _commit(db)
    db.refresh(setup)
    return setup


def update_setup(db: Session, setup: BrewSetup, data: dict) -> BrewSetup:
    new_name = data.get("name")
    if new_name is not None and name_taken(
        db, setup.user_id, new_name, exclude_id=setup.id
    ):
        raise DuplicateSetupName
    for key, value in data.items():
        if key in _SETUP_MUTABLE_FIELDS:
            setattr(setup, key, value)
    db.add(setup)
    _commit(db)
    db.refresh(setup)
    return setup


def delete_setup(db: Session, setup: BrewSetup) -> None:
    db.delete(setup)
    db.commit()
