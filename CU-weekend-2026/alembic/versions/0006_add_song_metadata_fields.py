"""add song metadata fields

Revision ID: 0006_add_song_metadata_fields
Revises: 0005_add_auth_fields_and_tag
Create Date: 2026-04-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0006_add_song_metadata_fields"
down_revision = "0005_add_auth_fields_and_tag"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("songs", sa.Column("title", sa.String(length=255), nullable=True))
    op.add_column("songs", sa.Column("artist", sa.String(length=255), nullable=True))
    op.add_column("songs", sa.Column("cover_url", sa.String(length=500), nullable=True))
    op.add_column("songs", sa.Column("stream_url", sa.String(length=500), nullable=True))
    op.add_column("songs", sa.Column("duration", sa.String(length=32), nullable=True))


def downgrade() -> None:
    op.drop_column("songs", "duration")
    op.drop_column("songs", "stream_url")
    op.drop_column("songs", "cover_url")
    op.drop_column("songs", "artist")
    op.drop_column("songs", "title")
