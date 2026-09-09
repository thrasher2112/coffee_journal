"""Move brewing preferences from browser localStorage onto the user

Revision ID: 20260909_11
Revises: 20260906_10
Create Date: 2026-09-09
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260909_11"
down_revision = "20260906_10"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # All three are nullable on purpose: NULL means "never set on the server",
    # which the client treats as "keep using my local defaults". Backfilling a
    # default here would instead overwrite whatever each browser already holds
    # the first time it syncs.
    op.add_column("users", sa.Column("temperature_unit", sa.String(16), nullable=True))
    op.add_column("users", sa.Column("grinders", sa.JSON(), nullable=True))
    op.add_column("users", sa.Column("preferred_grinder", sa.String(255), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "preferred_grinder")
    op.drop_column("users", "grinders")
    op.drop_column("users", "temperature_unit")
