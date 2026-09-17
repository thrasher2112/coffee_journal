"""Store a hash of magic link tokens instead of the token itself

Revision ID: 20260906_10
Revises: 20260325_09
Create Date: 2026-09-06
"""
from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "20260906_10"
down_revision = "20260325_09"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Existing rows hold raw tokens, which no longer match the hashed lookup.
    # They are single-use and expire within minutes, so dropping them costs at
    # most one unclicked sign-in link and leaves no stale credentials behind.
    op.execute(sa.text("DELETE FROM magic_link_tokens"))
    op.alter_column("magic_link_tokens", "token", new_column_name="token_hash")


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM magic_link_tokens"))
    op.alter_column("magic_link_tokens", "token_hash", new_column_name="token")
