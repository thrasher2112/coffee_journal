"""Add setup_name and machine_profile snapshot columns to brews

Plain text copies of the setup a brew was logged from; deliberately no foreign
key so editing or deleting a setup never changes brew history.

Revision ID: 20261007_13
Revises: 20261007_12
Create Date: 2026-10-07
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261007_13"
down_revision = "20261007_12"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("brews", sa.Column("setup_name", sa.String(80), nullable=True))
    op.add_column("brews", sa.Column("machine_profile", sa.String(120), nullable=True))


def downgrade() -> None:
    op.drop_column("brews", "machine_profile")
    op.drop_column("brews", "setup_name")
