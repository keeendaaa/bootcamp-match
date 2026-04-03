#!/usr/bin/env sh
set -e

echo "Waiting for database..."
python - <<'PY'
import os
import time
from sqlalchemy import create_engine, text
from sqlalchemy.exc import OperationalError

url = os.environ.get("DATABASE_URL")
if not url:
    raise SystemExit("DATABASE_URL not set")

engine = create_engine(url, pool_pre_ping=True)

for _ in range(30):
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        break
    except OperationalError:
        time.sleep(1)
else:
    raise SystemExit("Database not ready after 30s")
PY

echo "Running migrations..."
alembic upgrade head

echo "Starting API..."
if [ "${UVICORN_RELOAD}" = "1" ]; then
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
else
  exec uvicorn app.main:app --host 0.0.0.0 --port 8000
fi
