# bootcamp-match

<p align="center">
  <img src="web-app/public/logo.png" alt="MatchApp" width="140" />
</p>

<p align="center">
  MatchApp — социальное музыкальное приложение: друзья, эфиры, синхронное прослушивание, чат, подкасты и обмен треками.
</p>

<p align="center">
  <a href="https://matchapp.site">🌐 Production: matchapp.site</a>
</p>

---

## О проекте

`bootcamp-match` — монорепозиторий с фронтендом и backend API.

- Фронтенд: `Vite + React + TypeScript + Framer Motion`
- Бэкенд: `FastAPI + PostgreSQL + SQLAlchemy + Alembic`
- Инфраструктура: `Nginx + systemd`

## Структура

```text
.
├── web-app/               # веб-клиент (UI, player, realtime)
├── CU-weekend-2026/       # FastAPI API, модели, миграции
├── photos/                # локальные ассеты (в git не хранятся)
├── _env                   # локальный env (в git игнорируется)
└── README.md
```

Ключевые файлы:

- `web-app/src/App.tsx` — основная клиентская логика
- `web-app/src/index.css` — стили и анимации
- `web-app/src/mobile/` — deep links / android integrations
- `CU-weekend-2026/app/main.py` — REST + realtime API
- `CU-weekend-2026/app/models.py` — SQLAlchemy модели
- `CU-weekend-2026/app/schemas.py` — Pydantic схемы
- `CU-weekend-2026/alembic/versions/` — миграции БД

## Актуальные возможности

- Авторизация/регистрация по email + password
- OAuth вход через Google и Яндекс ID
- Демо-режим без входа
- Онбординг для новых пользователей
- Друзья и поиск пользователей по `@tag`
- Профиль пользователя:
  - смена аватара
  - редактирование `@tag`
  - лайкнутые и последние треки
- Лента друзей: кто онлайн и что сейчас слушает
- Discover:
  - поиск треков
  - поиск подкастов
  - выбор выпусков подкаста
  - кэширование результатов поиска
- Плеер:
  - очередь
  - shuffle/repeat
  - прогресс и seek
  - корректная обработка ошибок потока
- Совместное прослушивание:
  - invite/accept
  - синхронизация трека и позиции
  - чат внутри сессии
  - выход из эфира
- Личные чаты:
  - переписка
  - отправка треков в чат
- Голосовая связь (WebRTC signaling через backend websocket)

## Скриншоты

<p align="center">
  <img src="web-app/readme-photos/home-screen.png" alt="Home Screen" width="24%" />
  <img src="web-app/readme-photos/image.png" alt="Friends Feed" width="24%" />
  <img src="web-app/readme-photos/screen-opens.png" alt="Discover" width="24%" />
  <img src="web-app/readme-photos/profile.png" alt="Profile" width="24%" />
</p>

## Локальный запуск

### Frontend

```bash
cd web-app
npm install
npm run dev
```

Сборка:

```bash
npm run build
```

### Backend (venv)

```bash
cd CU-weekend-2026
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### Backend (docker)

```bash
cd CU-weekend-2026
docker compose up --build
```

## Переменные окружения

Backend читает `.env` (см. `CU-weekend-2026/app/db.py`).

Минимум для запуска:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_ALGORITHM`
- `JWT_EXPIRES_MINUTES`
- `UPLOAD_DIR`

Для OAuth:

- `SOCIAL_AUTH_DEFAULT_ORIGIN`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REDIRECT_URI`
- `YANDEX_CLIENT_ID`
- `YANDEX_CLIENT_SECRET`
- `YANDEX_REDIRECT_URI`

Важно:

- `_env`, `.env`, `.venv`, `node_modules`, `dist`, `uploads` не коммитятся
- все секреты хранить только на сервере/в секрет-хранилище

## Основные API endpoints

- Auth:
  - `POST /api/auth/register`
  - `POST /api/auth/login`
  - `GET /api/auth/google/start`
  - `GET /api/auth/google/callback`
  - `GET /api/auth/yandex/start`
  - `GET /api/auth/yandex/callback`
- Профиль:
  - `GET /api/me`
  - `PUT /api/me/tag`
  - `POST /api/me/avatar/upload`
  - `PUT /api/me/now-playing`
  - `POST /api/me/now-playing/heartbeat`
  - `DELETE /api/me/now-playing`
- Друзья/пользователи:
  - `GET /api/friends`
  - `POST /api/friends`
  - `GET /api/users/search`
  - `GET /api/friends/{id}/now-playing`
- Музыка/подкасты:
  - `GET /api/music/search`
  - `GET /api/music/stream/{video_id}`
  - `GET /api/podcasts/search`
  - `GET /api/podcasts/{podcast_id}/episodes`
  - `GET /api/podcasts/stream/{stream_id}`
- Совместное прослушивание:
  - `POST /api/listen/invite`
  - `GET /api/listen/incoming`
  - `GET /api/listen/active`
  - `POST /api/listen/{session_id}/accept`
  - `PUT /api/listen/{session_id}/state`
  - `GET /api/listen/{session_id}/messages`
  - `POST /api/listen/{session_id}/messages`
  - `POST /api/listen/{session_id}/end`
- Voice signaling:
  - `WS /api/listen/{session_id}/voice-signal/ws?token=<jwt>`

## Production инфраструктура (актуально)

- Домен: `https://matchapp.site`
- Frontend root: `/var/www/matchapp`
- Backend код: `/opt/cu-backend`
- API upstream: `127.0.0.1:8000`
- Service: `matchapp-api.service`
- Nginx site: `/etc/nginx/sites-available/matchapp`

Полезные команды на сервере:

```bash
systemctl status matchapp-api.service
journalctl -u matchapp-api.service -n 200 --no-pager
cd /opt/cu-backend && source .venv/bin/activate && alembic upgrade head
```

## Деплой (кратко)

Frontend:

```bash
cd web-app
npm run build
rsync -az --delete dist/ root@<server>:/var/www/matchapp/
```

Backend:

```bash
rsync -az --delete --exclude '.git' --exclude '.venv' --exclude '.env' --exclude 'uploads' CU-weekend-2026/ root@<server>:/opt/cu-backend/
ssh root@<server>
cd /opt/cu-backend
source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
systemctl restart matchapp-api.service
```
