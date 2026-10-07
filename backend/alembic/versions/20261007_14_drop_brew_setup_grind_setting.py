"""Drop brew_setups.grind_setting

Grind depends on the bean and the grinder (and drifts as a bag ages), so it is
prefilled from the last brew of that bean on that grinder instead of being
stored on a setup. Brews already carry grind_setting and grinder_name.

The column was added by migration 12, which is already applied on deployed
databases, so this is a new revision rather than an edit of that one. Any
grind values saved on setups are discarded; downgrade re-adds an empty column.

Revision ID: 20261007_14
Revises: 20261007_13
Create Date: 2026-10-07
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20261007_14"
down_revision = "20261007_13"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("brew_setups", "grind_setting")


def downgrade() -> None:
    op.add_column(
        "brew_setups", sa.Column("grind_setting", sa.String(120), nullable=True)
    )
