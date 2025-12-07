"""Add aroma/flavor ratings and tags to brews

Revision ID: 20250220_03
Revises: 20250220_02
Create Date: 2025-02-20 00:05:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20250220_03"
down_revision = "20250220_02"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("brews", sa.Column("aroma_rating", sa.Integer(), nullable=True))
    op.add_column("brews", sa.Column("flavor_rating", sa.Integer(), nullable=True))
    op.add_column("brews", sa.Column("aroma_tags", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("brews", "aroma_tags")
    op.drop_column("brews", "flavor_rating")
    op.drop_column("brews", "aroma_rating")
