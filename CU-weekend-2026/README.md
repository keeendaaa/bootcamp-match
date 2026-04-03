# CU Weekend MVP API

Backend for the hackathon MVP (FastAPI + PostgreSQL + JWT).

## Where to run
All Docker commands should be run from `C:\SASHA\Projects\cu-weekend\Backend`.

## Quick start (local)
1. Create a `.env` from `.env.example` and set your PostgreSQL creds.
2. Install deps:
   ```bash
   pip install -r requirements.txt
   ```
3. Run migrations:
   ```bash
   alembic upgrade head
   ```
4. Run:
   ```bash
   uvicorn app.main:app --reload
   ```

## Quick start (Docker)
```bash
docker compose up --build
```
Migrations run automatically on container start.

API will be available at `http://localhost:8000`.

## Auto-reload in Docker (dev)
The repo includes `docker-compose.override.yml`, so code changes trigger reload automatically when you run:
```bash
docker compose up --build
```
Reload watches only `/app/app` and `/app/alembic` to avoid slowdowns on large files.
If you change Python dependencies, rebuild the image:
```bash
docker compose build
```

## Healthcheck
- `GET /health` returns `{ "status": "ok" }`
- Docker healthcheck pings `/health`

## Auth
- Register: `POST /auth/register` with `{ "name": "alice" }`
- Login: `POST /auth/login` with `{ "name": "alice" }`

Use `Authorization: Bearer <token>` for protected routes.

## MVP Endpoints
- `GET /me`
- `POST /friends` `{ "friend_name": "bob" }`
- `GET /friends`
- `POST /songs` `{ "url": "..." }`
- `POST /songs/upload` (multipart form-data with `file`)
- `GET /files/{filename}` (download/stream uploaded file)
- `GET /friends/{friend_id}/songs`
- `PUT /me/now-playing` `{ "song_id": 123 }`
- `GET /friends/{friend_id}/now-playing`
