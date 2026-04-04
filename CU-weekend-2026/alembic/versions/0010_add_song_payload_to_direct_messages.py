"""add song payload fields to direct messages

Revision ID: 0010_add_song_payload_to_direct_messages
Revises: 0009_add_direct_messages
Create Date: 2026-04-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0010_add_song_payload_to_direct_messages"
down_revision = "0009_add_direct_messages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("direct_messages", sa.Column("song_title", sa.String(length=255), nullable=True))
    op.add_column("direct_messages", sa.Column("song_artist", sa.String(length=255), nullable=True))
    op.add_column("direct_messages", sa.Column("song_cover_url", sa.String(length=500), nullable=True))
    op.add_column("direct_messages", sa.Column("song_stream_url", sa.String(length=500), nullable=True))
    op.add_column("direct_messages", sa.Column("song_duration", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("direct_messages", "song_duration")
    op.drop_column("direct_messages", "song_stream_url")
    op.drop_column("direct_messages", "song_cover_url")
    op.drop_column("direct_messages", "song_artist")
    op.drop_column("direct_messages", "song_title")

