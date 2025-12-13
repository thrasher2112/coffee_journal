"""Add brew_style column to brews

Revision ID: 20250220_02
Revises: 20241202_01
Create Date: 2025-02-20 00:00:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20250220_02"
down_revision = "20241202_01"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("brews", sa.Column("brew_style", sa.String(length=50), nullable=True))


def downgrade() -> None:
    op.drop_column("brews", "brew_style")

