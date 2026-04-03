# bootcamp-match

Монорепозиторий проекта MatchApp: фронтенд (Vite + React + TypeScript) и бэкенд (FastAPI + PostgreSQL).

## Что где находится

- `web-app/` — клиентское приложение.
- `CU-weekend-2026/` — API, авторизация, музыка, совместное прослушивание и чат.
- `photos/` — локальные пользовательские фото (в репозиторий не заливаются).
- `Frame 1597880375.png` — локальный ассет логотипа/макета (в репозиторий не заливается).

## Фронтенд (`web-app/`)

- Точка входа UI: `web-app/src/App.tsx`
- Основные стили: `web-app/src/index.css`, `web-app/src/App.css`
- Демо-данные: `web-app/src/data/mockData.ts`
- Прод-сборка: `web-app/dist/`

### Локальный запуск

```bash
cd web-app
npm install
npm run dev
```

### Сборка

```bash
cd web-app
npm run build
```

## Бэкенд (`CU-weekend-2026/`)

- API: `CU-weekend-2026/app/main.py`
- Модели БД: `CU-weekend-2026/app/models.py`
- Схемы: `CU-weekend-2026/app/schemas.py`
- Миграции: `CU-weekend-2026/alembic/versions/`

### Локальный запуск (Docker)

```bash
cd CU-weekend-2026
docker compose up --build
```

### Локальный запуск (venv)

```bash
cd CU-weekend-2026
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

## Прод (текущая схема)

- Домен: `https://matchapp.site`
- Nginx раздает фронт из: `/var/www/matchapp`
- API за nginx: `http://127.0.0.1:8000`
- systemd сервис API: `matchapp-api.service`
- Код API на сервере: `/opt/cu-backend`

## Что уже реализовано

- Регистрация/вход по email и паролю.
- Поиск пользователей, друзья, лайки.
- Загрузка аватара и изменение тега `@tag`.
- Музыкальный плеер с потоками (`/music/stream/{video_id}`).
- Совместное прослушивание:
  - инвайт/принятие сессии,
  - синхронизация позиции трека,
  - чат внутри сессии.

## Важные API эндпоинты

- Auth: `/api/auth/register`, `/api/auth/login`
- Профиль: `/api/me`, `/api/me/tag`, `/api/me/avatar/upload`
- Музыка: `/api/music/search`, `/api/music/stream/{video_id}`
- Друзья: `/api/friends`, `/api/users/search`
- Совместное прослушивание:
  - `/api/listen/invite`
  - `/api/listen/incoming`
  - `/api/listen/active`
  - `/api/listen/{session_id}/accept`
  - `/api/listen/{session_id}/state`
  - `/api/listen/{session_id}/messages`

## Примечания

- Секреты и локальные окружения (`.env`, `.venv`, `node_modules`, `dist`) в git не коммитятся.
- Для корректной работы фронта нужен `VITE_API_BASE_URL` (по умолчанию используется `https://matchapp.site/api`).
