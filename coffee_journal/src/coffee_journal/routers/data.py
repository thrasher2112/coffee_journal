"""Import/export + sync stubs."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import crud
from ..db import get_db
from ..models import Bean, Brew
from ..schemas.bean import BeanRead
from ..schemas.brew import BrewRead, ExportPayload, ImportPayload
from ..sync.google_drive import GoogleDriveSyncStub

router = APIRouter()

gdrive_stub = GoogleDriveSyncStub()


@router.get("/export", response_model=ExportPayload)
def export_data(db: Session = Depends(get_db)):
    beans = db.query(Bean).all()
    brews = db.query(Brew).all()
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
def import_data(payload: ImportPayload, db: Session = Depends(get_db)):
    imported = {"beans": 0, "brews": 0}
    for bean in payload.beans:
        data = bean.dict(exclude_unset=True)
        bean_id = data.get("id")
        target = crud.bean.get_bean(db, bean_id) if bean_id else None
        # Remove read-only timestamps if present
        data.pop("created_at", None)
        data.pop("updated_at", None)
        if target:
            crud.bean.update_bean(db, target, data)
        else:
            crud.bean.create_bean(db, data)
        imported["beans"] += 1

    for brew in payload.brews:
        data = brew.dict(exclude_unset=True)
        brew_id = data.get("id")
        target = crud.brew.get_brew(db, brew_id) if brew_id else None
        bean_id = data.get("bean_id")
        if bean_id and not crud.bean.get_bean(db, bean_id):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Bean {bean_id} missing for brew import",
            )
        data.pop("created_at", None)
        data.pop("updated_at", None)
        if target:
            crud.brew.update_brew(db, target, data)
        else:
            crud.brew.create_brew(db, data)
        imported["brews"] += 1
    return {"status": "imported", "counts": imported}


@router.post("/sync/google-drive", status_code=status.HTTP_202_ACCEPTED)
def sync_with_google_drive():
    """Placeholder endpoint for future OAuth based Google Drive sync."""
    gdrive_stub.enqueue_sync()
    return {"status": "queued", "provider": "google_drive"}
