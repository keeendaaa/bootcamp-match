"""add auth fields and tag

Revision ID: 0005_add_auth_fields_and_tag
Revises: 0004_add_avatar_and_likes
Create Date: 2026-04-04
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql import text

revision = "0005_add_auth_fields_and_tag"
down_revision = "0004_add_avatar_and_likes"
branch_labels = None
depends_on = None


def _normalize_tag(value: str) -> str:
    value = value.strip().lower()
    out = []
    last_us = False
    for ch in value:
        ok = ("a" <= ch <= "z") or ("0" <= ch <= "9") or ch == "_"
        c = ch if ok else "_"
        if c == "_":
            if last_us:
                continue
            last_us = True
        else:
            last_us = False
        out.append(c)
    normalized = "".join(out).strip("_")
    return normalized or "user"


def upgrade() -> None:
    op.add_column("users", sa.Column("email", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("password_hash", sa.String(length=255), nullable=True))
    op.add_column("users", sa.Column("tag", sa.String(length=64), nullable=True))
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_tag", "users", ["tag"], unique=True)

    conn = op.get_bind()
    rows = conn.execute(text("SELECT id, name FROM users ORDER BY id")).fetchall()
    used: set[str] = set()
    for row in rows:
        base = _normalize_tag(row.name or f"user{row.id}")
        candidate = base
        i = 1
        while candidate in used:
            i += 1
            candidate = f"{base}{i}"
        used.add(candidate)
        conn.execute(
            text("UPDATE users SET tag = :tag WHERE id = :id"),
            {"tag": candidate, "id": row.id},
        )


def downgrade() -> None:
    op.drop_index("ix_users_tag", table_name="users")
    op.drop_index("ix_users_email", table_name="users")
    op.drop_column("users", "tag")
    op.drop_column("users", "password_hash")
    op.drop_column("users", "email")
