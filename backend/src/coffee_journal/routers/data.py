"""Import/export + sync stubs."""

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy.orm import Session

from .. import crud
from ..auth import get_current_user
from ..db import get_db
from ..rate_limit import limiter
from ..models import Bean, Brew
from ..models.user import User
from ..schemas.bean import BeanRead
from ..schemas.brew import BrewRead, ExportPayload, ImportPayload
from ..sync.google_drive import GoogleDriveSyncStub

router = APIRouter()

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
    for bean in payload.beans:
        data = bean.model_dump(exclude_unset=True)
        bean_id = data.get("id")
        target = crud.bean.get_bean(db, bean_id, current_user.id) if bean_id else None
        # Remove read-only timestamps if present
        data.pop("created_at", None)
        data.pop("updated_at", None)
        data["user_id"] = current_user.id
        if target:
            crud.bean.update_bean(db, target, data)
        else:
            crud.bean.create_bean(db, data)
        imported["beans"] += 1

    for brew in payload.brews:
        data = brew.model_dump(exclude_unset=True)
        brew_id = data.get("id")
        target = crud.brew.get_brew(db, brew_id, current_user.id) if brew_id else None
        bean_id = data.get("bean_id")
        if bean_id and not crud.bean.get_bean(db, bean_id, current_user.id):
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
            crud.brew.create_brew(db, data)
        imported["brews"] += 1
    return {"status": "imported", "counts": imported}


@router.post("/sync/google-drive", status_code=status.HTTP_202_ACCEPTED)
def sync_with_google_drive(current_user: User = Depends(get_current_user)):
    """Placeholder endpoint for future OAuth based Google Drive sync."""
    gdrive_stub.enqueue_sync()
    return {"status": "queued", "provider": "google_drive"}
