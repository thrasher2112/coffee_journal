"""Add brew_setups: named, reusable starting points for logging a brew

Revision ID: 20261007_12
Revises: 20260909_11
Create Date: 2026-10-07
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261007_12"
down_revision = "20260909_11"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "brew_setups",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("user_id", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("name", sa.String(80), nullable=False),
        sa.Column("brew_style", sa.String(50), nullable=False),
        sa.Column("ratio", sa.Float(), nullable=False),
        sa.Column("dose_g", sa.Float(), nullable=True),
        sa.Column("grinder_name", sa.String(120), nullable=True),
        sa.Column("grind_setting", sa.String(120), nullable=True),
        sa.Column("target_time_s", sa.Integer(), nullable=True),
        sa.Column("machine_profile", sa.String(120), nullable=True),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.func.now(),
        ),
    )
    op.create_index("ix_brew_setups_user_id", "brew_setups", ["user_id"])
    # Names are unique per user, case-insensitively. The same functional index
    # works on Postgres and SQLite.
    op.create_index(
        "uq_brew_setups_user_lower_name",
        "brew_setups",
        ["user_id", sa.text("lower(name)")],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("uq_brew_setups_user_lower_name", table_name="brew_setups")
    op.drop_index("ix_brew_setups_user_id", table_name="brew_setups")
    op.drop_table("brew_setups")
