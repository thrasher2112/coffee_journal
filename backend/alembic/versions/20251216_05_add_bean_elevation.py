"""Add elevation_m to beans

Revision ID: 20251216_05
Revises: 20250220_04
Create Date: 2025-12-16
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20251216_05"
down_revision = "20250220_04"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("beans", sa.Column("elevation_m", sa.Integer(), nullable=True))


def downgrade() -> None:
    op.drop_column("beans", "elevation_m")
