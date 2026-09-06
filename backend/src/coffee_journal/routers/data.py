"""Import/export + sync stubs."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import crud
from ..auth import get_current_user
from ..db import get_db
from ..models import Bean, Brew
from ..models.user import User
from ..rate_limit import limiter
from ..schemas.bean import BeanRead
from ..schemas.brew import BrewRead, ExportPayload, ImportPayload
from ..sync.google_drive import GoogleDriveSyncStub

router = APIRouter()


def _id_taken(db: Session, model, row_id: str | None) -> bool:
    """Whether a primary key is already in use by ANY user.

    Deliberately not tenant-scoped, unlike everything in `crud`: ids are
    globally unique, so this is the only way to tell "free to reuse" from
    "already belongs to someone else". It answers a yes/no question about an id
    the caller already holds and returns no row data, so it leaks nothing.
    """
    if not row_id:
        return False
    return (
        db.execute(select(model.id).where(model.id == row_id).limit(1)).first()
        is not None
    )


gdrive_stub = GoogleDriveSyncStub()


@router.get("/export", response_model=ExportPayload)
@limiter.limit("10/minute")
def export_data(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    beans = db.query(Bean).filter(Bean.user_id == current_user.id).all()
    brews = db.query(Brew).filter(Brew.user_id == current_user.id).all()
    bean_payload = [BeanRead.model_validate(bean) for bean in beans]
    brew_payload = []
    for brew in brews:
        db.refresh(brew, attribute_names=["bean"])
        brew_payload.append(
            BrewRead.model_validate(brew).model_copy(
                update={"bean_name": getattr(brew.bean, "name", None), "ratio": brew.ratio}
            )
        )
    return {"beans": bean_payload, "brews": brew_payload}


@router.post("/import", status_code=status.HTTP_202_ACCEPTED)
@limiter.limit("5/minute")
def import_data(
    request: Request,
    payload: ImportPayload,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    imported = {"beans": 0, "brews": 0}
    # Imported rows carry the ids they had in the source database, and the
    # lookups below are owner-scoped. An id that is not already ours may still
    # belong to ANOTHER user's row - ids are globally unique - so reusing it on
    # insert violates the primary key. That surfaced as a 500 when importing an
    # export into a second account.
    #
    # A free id is therefore kept (which is what makes re-importing the same
    # file into a fresh database idempotent rather than duplicating), and only a
    # genuinely taken one is replaced - remapping the brews that referenced it.
    bean_id_remap: dict[str, str] = {}

    for bean in payload.beans:
        data = bean.model_dump(exclude_unset=True)
        incoming_id = data.get("id")
        target = (
            crud.bean.get_bean(db, incoming_id, current_user.id)
            if incoming_id
            else None
        )
        # Remove read-only timestamps if present
        data.pop("created_at", None)
        data.pop("updated_at", None)
        data["user_id"] = current_user.id
        if target:
            crud.bean.update_bean(db, target, data)
        else:
            # Keep the incoming id when it is free, so importing the same file
            # twice into a fresh database updates in place instead of
            # duplicating. Only drop it when it is already someone else's.
            if _id_taken(db, Bean, incoming_id):
                data.pop("id", None)
            created = crud.bean.create_bean(db, data)
            if incoming_id and str(created.id) != str(incoming_id):
                bean_id_remap[str(incoming_id)] = str(created.id)
        imported["beans"] += 1

    for brew in payload.brews:
        data = brew.model_dump(exclude_unset=True)
        incoming_id = data.get("id")
        target = (
            crud.brew.get_brew(db, incoming_id, current_user.id)
            if incoming_id
            else None
        )
        bean_id = data.get("bean_id")
        if bean_id:
            # Follow the bean to its new id when it was re-created above.
            bean_id = bean_id_remap.get(str(bean_id), bean_id)
            data["bean_id"] = bean_id
            if not crud.bean.get_bean(db, bean_id, current_user.id):
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail=f"Bean {bean_id} missing for brew import",
                )
        data.pop("created_at", None)
        data.pop("updated_at", None)
        data["user_id"] = current_user.id
        if target:
            crud.brew.update_brew(db, target, data)
        else:
            if _id_taken(db, Brew, incoming_id):
                data.pop("id", None)
            crud.brew.create_brew(db, data)
        imported["brews"] += 1
    return {"status": "imported", "counts": imported}


@router.post("/sync/google-drive", status_code=status.HTTP_202_ACCEPTED)
def sync_with_google_drive(current_user: User = Depends(get_current_user)):
    """Placeholder endpoint for future OAuth based Google Drive sync."""
    gdrive_stub.enqueue_sync()
    return {"status": "queued", "provider": "google_drive"}
