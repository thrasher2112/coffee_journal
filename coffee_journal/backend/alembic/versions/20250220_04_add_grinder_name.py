"""Add grinder_name to brews

Revision ID: 20250220_04
Revises: 20250220_03
Create Date: 2025-02-20 00:40:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20250220_04"
down_revision = "20250220_03"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("brews", sa.Column("grinder_name", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("brews", "grinder_name")
