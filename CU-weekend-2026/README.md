# MatchApp Backend

FastAPI backend для MatchApp: auth, профили, друзья, музыка, подкасты, чаты, совместное прослушивание и websocket signaling для голосовой связи.

## Быстрый Старт Через Docker

```bash
cd CU-weekend-2026
cp .env.example .env
docker compose up --build
```

API будет доступен на `http://localhost:8000`.

Проверка:

```bash
curl http://localhost:8000/health
```

## Быстрый Старт Без Docker

```bash
cd CU-weekend-2026
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

В `.env` поменяй `DATABASE_URL`, если PostgreSQL запущен не в Docker:

```env
DATABASE_URL=postgresql+psycopg2://cu_user:cu_password@localhost:5432/cu_weekend
```

Затем:

```bash
alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

## Переменные

Обязательные:

- `DATABASE_URL` — SQLAlchemy URL до PostgreSQL.
- `JWT_SECRET` — секрет подписи JWT.
- `JWT_ALGORITHM` — обычно `HS256`.
- `JWT_EXPIRES_MINUTES` — срок жизни токена.
- `UPLOAD_DIR` — папка для загруженных файлов.

Опциональные OAuth-переменные:

- `SOCIAL_AUTH_DEFAULT_ORIGIN`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `YANDEX_CLIENT_ID`
- `YANDEX_CLIENT_SECRET`
- `YANDEX_REDIRECT_URI`

## Docker Compose

`docker-compose.yml` поднимает:

- `api` — FastAPI на `8000`.
- `db` — PostgreSQL `16` на `5432`.
- volume `cu_weekend_pg` для данных PostgreSQL.
- локальную папку `uploads/` для пользовательских файлов.

`docker-compose.override.yml` нужен для dev autoreload:

- монтирует `app/`, `alembic/`, `alembic.ini` внутрь контейнера.
- включает `UVICORN_RELOAD=1`.

## Миграции

Применить миграции:

```bash
alembic upgrade head
```

Создать миграцию после изменения моделей:

```bash
alembic revision --autogenerate -m "describe change"
```

Откатить последнюю миграцию:

```bash
alembic downgrade -1
```

## Основные Endpoints

Сервисные:

- `GET /health`

Auth:

- `POST /auth/register`
- `POST /auth/login`
- `GET /auth/google/start`
- `GET /auth/google/callback`
- `GET /auth/yandex/start`
- `GET /auth/yandex/callback`

Профиль:

- `GET /me`
- `GET /me/stats`
- `PUT /me/avatar`
- `POST /me/avatar/upload`
- `PUT /me/tag`
- `GET /me/likes`
- `GET /me/songs`
- `POST /me/likes/toggle`
- `PUT /me/now-playing`
- `POST /me/now-playing/heartbeat`
- `DELETE /me/now-playing`

Друзья, музыка, чаты и listen sessions смотри в корневом `../README.md`, там список полный.

## Подсказки По Отладке

Если backend стартует, но frontend получает 404:

- Проверь, не добавил ли nginx или frontend лишний `/api`.
- В коде FastAPI routes объявлены без `/api`: `/auth/login`, `/me`, `/music/search`.
- Если внешний URL выглядит как `/api/auth/login`, nginx должен проксировать его внутрь backend как `/auth/login`.

Если база недоступна:

- В Docker используй `db` как hostname.
- В локальном запуске используй `localhost`.
- Проверь `docker compose ps` и `docker compose logs db`.

Если загрузки файлов не видны после перезапуска:

- Проверь `UPLOAD_DIR`.
- Проверь, что `uploads/` примонтирован или не удаляется при деплое.
