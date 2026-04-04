"""add read_at to direct messages

Revision ID: 0011_add_read_at_to_direct_messages
Revises: 0010_add_song_payload_to_direct_messages
Create Date: 2026-04-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0011_add_read_at_to_direct_messages"
down_revision = "0010_add_song_payload_to_direct_messages"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("direct_messages", sa.Column("read_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    op.drop_column("direct_messages", "read_at")
