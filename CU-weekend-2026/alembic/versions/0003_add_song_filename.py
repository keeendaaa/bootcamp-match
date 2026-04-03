"""add song filename

Revision ID: 0003_add_song_filename
Revises: 0002_drop_song_fields
Create Date: 2026-04-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0003_add_song_filename"
down_revision = "0002_drop_song_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("songs", sa.Column("filename", sa.String(length=255), nullable=False, server_default=""))
    op.alter_column("songs", "filename", server_default=None)


def downgrade() -> None:
    op.drop_column("songs", "filename")
