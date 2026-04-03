"""drop song fields

Revision ID: 0002_drop_song_fields
Revises: 0001_init
Create Date: 2026-04-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0002_drop_song_fields"
down_revision = "0001_init"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_column("songs", "title")
    op.drop_column("songs", "artist")
    op.drop_column("songs", "created_at")


def downgrade() -> None:
    op.add_column(
        "songs",
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=True),
    )
    op.add_column(
        "songs",
        sa.Column("artist", sa.String(length=200), nullable=True),
    )
    op.add_column(
        "songs",
        sa.Column("title", sa.String(length=200), nullable=True),
    )
