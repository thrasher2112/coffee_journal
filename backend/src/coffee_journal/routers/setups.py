"""Brew setup endpoints."""

from fastapi import APIRouter, Depends, HTTPException, Request, Response, status
from sqlalchemy.orm import Session

from .. import crud
from ..auth import get_current_user
from ..db import get_db
from ..models.user import User
from ..rate_limit import limiter
from ..schemas.setup import SetupCreate, SetupRead, SetupUpdate

router = APIRouter()

_DUPLICATE_NAME = "A setup with this name already exists"


def _get_or_404(db: Session, setup_id: str, user: User):
    setup = crud.setup.get_setup(db, setup_id, user.id)
    if not setup:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Setup not found")
    return setup


@router.get("", response_model=list[SetupRead])
def list_setups(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return crud.setup.list_setups(db, current_user.id)


@router.post("", response_model=SetupRead, status_code=status.HTTP_201_CREATED)
@limiter.limit("30/minute")
def create_setup(
    request: Request,
    payload: SetupCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    data = payload.model_dump()
    data["user_id"] = current_user.id
    try:
        return crud.setup.create_setup(db, data)
    except crud.setup.DuplicateSetupName:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_DUPLICATE_NAME) from None


@router.get("/{setup_id}", response_model=SetupRead)
def get_setup(
    setup_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_or_404(db, setup_id, current_user)


@router.patch("/{setup_id}", response_model=SetupRead)
@limiter.limit("30/minute")
def update_setup(
    request: Request,
    setup_id: str,
    payload: SetupUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    setup = _get_or_404(db, setup_id, current_user)
    try:
        return crud.setup.update_setup(db, setup, payload.model_dump(exclude_unset=True))
    except crud.setup.DuplicateSetupName:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=_DUPLICATE_NAME) from None


@router.delete("/{setup_id}", status_code=status.HTTP_204_NO_CONTENT)
@limiter.limit("30/minute")
def delete_setup(
    request: Request,
    setup_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    setup = _get_or_404(db, setup_id, current_user)
    crud.setup.delete_setup(db, setup)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
