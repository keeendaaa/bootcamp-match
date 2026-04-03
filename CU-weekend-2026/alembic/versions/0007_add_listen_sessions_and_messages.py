"""add listen sessions and messages

Revision ID: 0007_add_listen_sessions_and_messages
Revises: 0006_add_song_metadata_fields
Create Date: 2026-04-04
"""

from alembic import op
import sqlalchemy as sa

revision = "0007_add_listen_sessions_and_messages"
down_revision = "0006_add_song_metadata_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "listen_sessions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("host_id", sa.Integer(), nullable=False),
        sa.Column("guest_id", sa.Integer(), nullable=False),
        sa.Column("song_id", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="pending"),
        sa.Column("position_sec", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_playing", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["host_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["guest_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["song_id"], ["songs.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.alter_column("listen_sessions", "status", server_default=None)
    op.alter_column("listen_sessions", "position_sec", server_default=None)
    op.alter_column("listen_sessions", "is_playing", server_default=None)

    op.create_table(
        "listen_messages",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("session_id", sa.Integer(), nullable=False),
        sa.Column("sender_id", sa.Integer(), nullable=False),
        sa.Column("text", sa.String(length=1000), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["session_id"], ["listen_sessions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["sender_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("listen_messages")
    op.drop_table("listen_sessions")
