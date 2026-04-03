"""init

Revision ID: 0001_init
Revises: 
Create Date: 2026-04-03
"""

from alembic import op
import sqlalchemy as sa

revision = "0001_init"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
        sa.Column("now_playing_song_id", sa.Integer(), nullable=True),
    )
    op.create_index("ix_users_name", "users", ["name"], unique=True)

    op.create_table(
        "songs",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("artist", sa.String(length=200), nullable=True),
        sa.Column("url", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
    )

    op.create_table(
        "friendships",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("friend_id", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()")),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["friend_id"], ["users.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "friend_id"),
    )

    op.create_foreign_key(
        "fk_users_now_playing_song_id",
        "users",
        "songs",
        ["now_playing_song_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_users_now_playing_song_id", "users", type_="foreignkey")
    op.drop_table("friendships")
    op.drop_table("songs")
    op.drop_index("ix_users_name", table_name="users")
    op.drop_table("users")
