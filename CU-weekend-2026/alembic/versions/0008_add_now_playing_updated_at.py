"""add now_playing_updated_at to users

Revision ID: 0008_add_now_playing_updated_at
Revises: 0007_add_listen_sessions_and_messages
Create Date: 2026-04-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0008_add_now_playing_updated_at"
down_revision = "0007_add_listen_sessions_and_messages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("now_playing_updated_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "now_playing_updated_at")

