"""Add user_id to beans and brews

Revision ID: 20260325_07
Revises: 20260325_06
Create Date: 2026-03-25
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20260325_07"
down_revision = "20260325_06"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "beans",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
    )
    op.add_column(
        "brews",
        sa.Column(
            "user_id",
            sa.String(36),
            sa.ForeignKey("users.id"),
            nullable=True,
        ),
    )
    op.create_index("ix_beans_user_id", "beans", ["user_id"])
    op.create_index("ix_brews_user_id", "brews", ["user_id"])
    op.create_index("ix_brews_user_date", "brews", ["user_id", "date"])


def downgrade() -> None:
    op.drop_index("ix_brews_user_date")
    op.drop_index("ix_brews_user_id")
    op.drop_index("ix_beans_user_id")
    op.drop_column("brews", "user_id")
    op.drop_column("beans", "user_id")
