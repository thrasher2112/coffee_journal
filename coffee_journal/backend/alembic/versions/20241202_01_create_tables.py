"""Create beans and brews tables

Revision ID: 20241202_01
Revises: 
Create Date: 2024-12-02 00:00:00
"""
from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "20241202_01"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "beans",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("roaster", sa.String(length=255)),
        sa.Column("origin", sa.String(length=255)),
        sa.Column("process", sa.String(length=120)),
        sa.Column("roast_level", sa.String(length=120)),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_beans_name", "beans", ["name"])
    op.create_index("ix_beans_created", "beans", ["created_at"])

    op.create_table(
        "brews",
        sa.Column("id", sa.String(length=36), primary_key=True),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("bean_id", sa.String(length=36), sa.ForeignKey("beans.id", ondelete="CASCADE"), nullable=False),
        sa.Column("bean_weight_g", sa.Float(), nullable=False),
        sa.Column("water_weight_g", sa.Float(), nullable=False),
        sa.Column("grind_setting", sa.String(length=120)),
        sa.Column("grind_setting_notes", sa.Text()),
        sa.Column("water_temp_c", sa.Integer()),
        sa.Column("bloom_time_s", sa.Integer()),
        sa.Column("total_brew_time_s", sa.Integer()),
        sa.Column("agitation_events", sa.JSON()),
        sa.Column("tasting_notes", sa.Text()),
        sa.Column("flavor_tags", sa.JSON()),
        sa.Column("rating", sa.Integer()),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_brews_date", "brews", ["date"])
    op.create_index("ix_brews_created", "brews", ["created_at"])


def downgrade() -> None:
    op.drop_index("ix_brews_created", table_name="brews")
    op.drop_index("ix_brews_date", table_name="brews")
    op.drop_table("brews")
    op.drop_index("ix_beans_created", table_name="beans")
    op.drop_index("ix_beans_name", table_name="beans")
    op.drop_table("beans")
