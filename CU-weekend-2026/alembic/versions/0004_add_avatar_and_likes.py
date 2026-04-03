"""add avatar and liked tracks

Revision ID: 0004_add_avatar_and_likes
Revises: 0003_add_song_filename
Create Date: 2026-04-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0004_add_avatar_and_likes"
down_revision = "0003_add_song_filename"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("avatar_url", sa.String(length=500), nullable=True))

    op.create_table(
        "liked_tracks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("track_key", sa.String(length=255), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("artist", sa.String(length=255), nullable=False, server_default=""),
        sa.Column("cover_url", sa.String(length=500), nullable=True),
        sa.Column("stream_url", sa.String(length=500), nullable=True),
        sa.Column("source_url", sa.String(length=500), nullable=True),
        sa.Column("duration", sa.String(length=32), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "track_key"),
    )
    op.alter_column("liked_tracks", "artist", server_default=None)


def downgrade() -> None:
    op.drop_table("liked_tracks")
    op.drop_column("users", "avatar_url")
