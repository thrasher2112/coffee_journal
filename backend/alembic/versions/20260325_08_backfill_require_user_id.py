"""Backfill user_id and set NOT NULL

Revision ID: 20260325_08
Revises: 20260325_07
Create Date: 2026-03-25
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260325_08"
down_revision = "20260325_07"
branch_labels = None
depends_on = None

LEGACY_USER_ID = "00000000-0000-0000-0000-000000000001"
LEGACY_EMAIL = "legacy@coffee-journal.local"


def upgrade() -> None:
    # Create a seed user for any existing data
    op.execute(
        sa.text(
            "INSERT INTO users (id, email, display_name, created_at, updated_at) "
            "VALUES (:id, :email, 'Legacy User', NOW(), NOW()) "
            "ON CONFLICT (email) DO NOTHING"
        ).bindparams(id=LEGACY_USER_ID, email=LEGACY_EMAIL)
    )

    # Backfill NULL user_id rows
    op.execute(
        sa.text(
            "UPDATE beans SET user_id = :uid WHERE user_id IS NULL"
        ).bindparams(uid=LEGACY_USER_ID)
    )
    op.execute(
        sa.text(
            "UPDATE brews SET user_id = :uid WHERE user_id IS NULL"
        ).bindparams(uid=LEGACY_USER_ID)
    )

    # Make columns NOT NULL
    op.alter_column("beans", "user_id", nullable=False)
    op.alter_column("brews", "user_id", nullable=False)


def downgrade() -> None:
    op.alter_column("brews", "user_id", nullable=True)
    op.alter_column("beans", "user_id", nullable=True)
