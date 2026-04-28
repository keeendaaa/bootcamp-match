# bootcamp-match

<p align="center">
  <img src="web-app/public/logo.png" alt="MatchApp" width="140" />
</p>

<p align="center">
  MatchApp — социальное музыкальное приложение: друзья, эфиры, синхронное прослушивание, чат, подкасты и обмен треками.
</p>

<p align="center">
  <a href="https://matchapp.site">Production: matchapp.site</a>
</p>

## Ребята, я вас безумно сильно люблю! ❤️

<p align="center">
  <img src="telegram-cloud-photo-size-2-5373307900857620481-w.jpg" alt="Команда Win-Win+ на буткемпе Центрального университета" width="86%" />
</p>

Для меня буткемп навсегда останется частью меня, это был уникальный опыт, который стал частью меня, я вас безумно сильно люблю и мечтаю провести с вами хотя бы еще один день в Ареале.

5 апреля команда Win-Win+ стала победителем буткемпа Центрального университета, заняв номинацию за лучшее техническое решение.

## Быстрый Старт

Самый простой путь поднять проект с нуля локально:

```bash
git clone https://github.com/keeendaaa/bootcamp-match.git
cd bootcamp-match
```

Запусти backend с PostgreSQL через Docker:

```bash
cd CU-weekend-2026
cp .env.example .env
docker compose up --build
```

В новом терминале запусти frontend:

```bash
cd web-app
cp .env.example .env
npm ci
npm run dev
```

Открой `http://localhost:5173`. API будет доступен на `http://localhost:8000`, healthcheck — `http://localhost:8000/health`.

## Скриншоты

<p align="center">
  <img src="web-app/readme-photos/home-screen.png" alt="Home Screen" width="24%" />
  <img src="web-app/readme-photos/image.png" alt="Friends Feed" width="24%" />
  <img src="web-app/readme-photos/screen-opens.png" alt="Discover" width="24%" />
  <img src="web-app/readme-photos/profile.png" alt="Profile" width="24%" />
</p>

## Что Нужно Установить

Минимальный набор:

- Git
- Node.js `20+`
- npm `10+`
- Docker Desktop или Docker Engine с Docker Compose

Если backend запускается без Docker, дополнительно нужны:

- Python `3.11+`
- PostgreSQL `16+`

## Структура Проекта

```text
.
├── web-app/               # Vite + React + TypeScript frontend
├── CU-weekend-2026/       # FastAPI backend, SQLAlchemy модели, Alembic миграции
├── photos/                # локальные ассеты, не коммитятся
├── _env                   # локальные секреты, не коммитятся
├── .idea/                 # настройки JetBrains IDE для быстрого запуска
└── README.md              # этот файл
```

Ключевые файлы:

- `web-app/src/App.tsx` — основной UI, API-клиент, player, social flows, realtime polling.
- `web-app/src/mobile/` — Capacitor bridge, deep links, интеграции с мобильной оболочкой.
- `web-app/MOBILE.md` — заметки по iOS/Android WebView-shell и виджетам.
- `web-app/package.json` — команды frontend-сборки.
- `CU-weekend-2026/app/main.py` — FastAPI routes, websocket voice signaling, music/podcast proxy.
- `CU-weekend-2026/app/models.py` — SQLAlchemy модели.
- `CU-weekend-2026/app/schemas.py` — Pydantic схемы API.
- `CU-weekend-2026/app/db.py` — настройки окружения и подключение к базе.
- `CU-weekend-2026/alembic/versions/` — миграции базы данных.
- `CU-weekend-2026/docker-compose.yml` — локальный backend + PostgreSQL.

## Архитектура

Frontend:

- Vite собирает SPA в `web-app/dist`.
- React-приложение ходит в API по `VITE_API_BASE_URL`.
- Если переменная не задана, frontend использует production API `https://matchapp.site/api`.
- Для локальной разработки нужен `VITE_API_BASE_URL=http://localhost:8000` или `http://localhost:8000/api`, если API проксируется с префиксом.
- Для Vercel можно включить `VITE_AUTO_DEMO=true`, тогда при открытии сайта приложение сразу запустит существующий демо-режим без экрана входа и без backend.

Backend:

- FastAPI слушает `8000`.
- PostgreSQL хранит пользователей, друзей, треки, лайки, direct messages и listen sessions.
- Alembic применяет миграции схемы.
- Uploaded files лежат в `uploads/`.
- YouTube Music и podcast endpoints проксируются через backend.
- Voice signaling работает через websocket `WS /listen/{session_id}/voice-signal/ws?token=<jwt>`.

Production сейчас обычно выглядит так:

- `nginx` принимает `80/443`.
- Static frontend лежит в `/var/www/matchapp`.
- Backend работает локально на `127.0.0.1:8000` через `uvicorn`/`systemd`.
- PostgreSQL доступен только локально на сервере.
- `nginx` проксирует `/api/*` в backend.

## Переменные Окружения

### Frontend

Файл: `web-app/.env`.

```env
VITE_API_BASE_URL=http://localhost:8000
VITE_AUTO_DEMO=false
```

Для production на Vercel чаще всего нужно:

```env
VITE_API_BASE_URL=https://api.example.com
VITE_AUTO_DEMO=false
```

Если VPS удаляется и нужен только публичный демо-показ на Vercel:

```env
VITE_AUTO_DEMO=true
```

Подсказки:

- Переменные Vite должны начинаться с `VITE_`, иначе они не попадут в браузерный bundle.
- Не клади секреты во frontend `.env`: всё, что начинается с `VITE_`, увидит пользователь в браузере.
- После изменения `.env` перезапусти `npm run dev`.

### Backend

Файл: `CU-weekend-2026/.env`.

Минимальный локальный вариант для Docker уже лежит в `.env.example`:

```env
DATABASE_URL=postgresql+psycopg2://cu_user:cu_password@db:5432/cu_weekend
JWT_SECRET=change-me-in-local-dev
JWT_ALGORITHM=HS256
JWT_EXPIRES_MINUTES=10080
UPLOAD_DIR=uploads
```

Для запуска без Docker поменяй `db` на `localhost`:

```env
DATABASE_URL=postgresql+psycopg2://cu_user:cu_password@localhost:5432/cu_weekend
```

OAuth-переменные нужны только если включаешь вход через Google/Yandex:

```env
SOCIAL_AUTH_DEFAULT_ORIGIN=http://localhost:5173
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:8000/auth/google/callback
YANDEX_CLIENT_ID=
YANDEX_CLIENT_SECRET=
YANDEX_REDIRECT_URI=http://localhost:8000/auth/yandex/callback
```

Важно:

- `.env`, `_env`, `.venv`, `node_modules`, `dist`, `uploads` не коммитятся.
- `JWT_SECRET` в production должен быть длинным случайным значением.
- `DATABASE_URL` для Docker должен указывать на хост `db`, потому что это имя compose-сервиса.
- `DATABASE_URL` для systemd/VPS обычно указывает на `localhost` или `127.0.0.1`.

## Локальный Запуск Через Docker

Backend + база:

```bash
cd CU-weekend-2026
cp .env.example .env
docker compose up --build
```

Что произойдёт:

- Поднимется PostgreSQL `16` на `localhost:5432`.
- Поднимется FastAPI на `localhost:8000`.
- Миграции применятся при старте контейнера через `entrypoint.sh`.
- `uploads/` будет примонтирован как локальная папка.
- `docker-compose.override.yml` включит autoreload для `app/` и `alembic/`.

Проверка:

```bash
curl http://localhost:8000/health
```

Остановить контейнеры:

```bash
docker compose down
```

Сбросить базу полностью:

```bash
docker compose down -v
```

## Локальный Запуск Без Docker

Backend:

```bash
cd CU-weekend-2026
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
```

В `.env` поставь `DATABASE_URL` на свою локальную PostgreSQL базу, затем:

```bash
alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Frontend:

```bash
cd web-app
cp .env.example .env
npm ci
npm run dev
```

Открой `http://localhost:5173`.

## Основные Команды

Frontend из `web-app/`:

```bash
npm ci              # установить зависимости по package-lock.json
npm run dev         # dev server
npm run build       # TypeScript build + production Vite build
npm run preview     # локально посмотреть production build
npm run lint        # ESLint
```

Mobile/WebView из `web-app/`:

```bash
npm run mobile:webview:copy
npm run mobile:webview:sync
npm run cap:open:ios
npm run cap:open:android
```

Backend из `CU-weekend-2026/`:

```bash
docker compose up --build
alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

## API Шпаргалка

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
- `POST /me/likes/toggle`
- `GET /me/songs`
- `PUT /me/now-playing`
- `POST /me/now-playing/heartbeat`
- `DELETE /me/now-playing`

Друзья и пользователи:

- `GET /friends`
- `POST /friends`
- `GET /users/search`
- `GET /users/by-tag/{tag}`
- `GET /friends/{friend_id}/songs`
- `GET /friends/{friend_id}/now-playing`

Музыка и подкасты:

- `GET /music/search`
- `GET /music/stream/{video_id}`
- `GET /podcasts/search`
- `GET /podcasts/{podcast_id}/episodes`
- `GET /podcasts/stream/{stream_id}`
- `POST /songs`
- `POST /songs/upload`
- `GET /files/{filename}`

Чаты:

- `GET /chats/threads`
- `GET /chats/{friend_id}/messages`
- `POST /chats/{friend_id}/messages`
- `POST /chats/{friend_id}/read`

Совместное прослушивание:

- `POST /listen/invite`
- `GET /listen/incoming`
- `GET /listen/active`
- `POST /listen/{session_id}/accept`
- `POST /listen/{session_id}/end`
- `PUT /listen/{session_id}/state`
- `GET /listen/{session_id}/messages`
- `POST /listen/{session_id}/messages`
- `WS /listen/{session_id}/voice-signal/ws?token=<jwt>`

Подсказка: если frontend работает через nginx с префиксом `/api`, nginx должен срезать этот префикс или backend должен получать route без `/api`, потому что FastAPI routes объявлены как `/auth/login`, `/me`, `/music/search` и так далее.

## Проверка Перед Коммитом

Минимальная проверка frontend:

```bash
cd web-app
npm run build
```

Минимальная проверка backend:

```bash
cd CU-weekend-2026
docker compose up --build
curl http://localhost:8000/health
```

Если менялись модели или схемы базы:

```bash
cd CU-weekend-2026
alembic revision --autogenerate -m "describe change"
alembic upgrade head
```

## Деплой На VPS

Текущая production-схема:

- Домен: `https://matchapp.site`
- Frontend root: `/var/www/matchapp`
- Backend код: `/opt/cu-backend`
- API upstream: `127.0.0.1:8000`
- systemd service: `matchapp-api.service`
- nginx site: `/etc/nginx/sites-available/matchapp`

Frontend:

```bash
cd web-app
npm ci
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

Полезные команды на сервере:

```bash
systemctl status matchapp-api.service
journalctl -u matchapp-api.service -n 200 --no-pager
nginx -t
systemctl reload nginx
ss -tulpn
```

## Деплой Frontend На Vercel

Можно вынести только frontend на Vercel, а backend оставить на VPS.

Для безопасного демо без VPS используй отдельную ветку `vercel-demo`. В ней лежит `web-app/.env.production` с `VITE_AUTO_DEMO=true`, поэтому Vercel-сборка сразу откроет встроенный демо-режим без экрана входа, backend и PostgreSQL.

Рекомендуемый вариант для этого репозитория:

- Branch: `vercel-demo`
- Root Directory: `web-app`
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: `dist`
- Дополнительные Environment Variables не обязательны для демо

Настройки Vercel:

- Root Directory: `web-app`
- Install Command: `npm ci`
- Build Command: `npm run build`
- Output Directory: `dist`
- Environment Variable: `VITE_API_BASE_URL=https://api.example.com`
- Для демо без VPS поставь Environment Variable: `VITE_AUTO_DEMO=true`

Что важно:

- Backend должен быть доступен по HTTPS.
- Для API лучше использовать отдельный поддомен: `api.example.com`.
- Если backend остаётся за nginx на VPS, настрой CORS или отдавай API с того же домена через proxy.
- Не размещай PostgreSQL на Vercel: для базы используй VPS, Supabase, Neon, Railway или другой managed Postgres.
- Если включён `VITE_AUTO_DEMO=true`, backend не нужен: сайт сразу откроет встроенный демо-режим на моковых данных.

## Частые Проблемы

`Frontend открывается, но login/search не работает`:

- Проверь `web-app/.env`.
- Проверь, что `VITE_API_BASE_URL` указывает на backend.
- Перезапусти `npm run dev` после изменения `.env`.
- Открой DevTools Network и посмотри фактический URL запроса.

`Backend не подключается к базе`:

- Для Docker используй host `db` в `DATABASE_URL`.
- Для локального Python используй `localhost` или `127.0.0.1`.
- Проверь, что PostgreSQL запущен и база создана.

`alembic upgrade head` падает:

- Проверь `DATABASE_URL`.
- Убедись, что находишься в `CU-weekend-2026/`.
- Если база локальная тестовая и её можно удалить, проще сделать `docker compose down -v` и поднять заново.

`npm run build` падает на TypeScript:

- Сначала запусти `npm ci`.
- Проверь, что Node.js версии `20+`.
- Исправляй TypeScript errors до Vite build: команда `build:web` сначала запускает `tsc -b`.

`Vercel показывает старый API`:

- Проверь Environment Variables в Vercel Project Settings.
- После изменения env сделай redeploy.
- Убедись, что переменная называется именно `VITE_API_BASE_URL`.

## Git И Безопасность

В репозиторий не должны попадать:

- `.env` и `_env`
- `node_modules/`
- `web-app/dist/`
- `CU-weekend-2026/.venv/`
- `CU-weekend-2026/uploads/`
- реальные пароли, токены, OAuth secrets, приватные ключи

Перед публикацией изменений полезно проверить:

```bash
git status --short
git diff --stat
```

## IDE Подсказки

Для JetBrains IDE в `.idea/` добавлены project-level настройки и run configurations:

- `Frontend - Vite dev` запускает `npm run dev` из `web-app`.
- `Frontend - build` запускает `npm run build` из `web-app`.
- `Backend - Docker Compose` запускает `docker compose up --build` из `CU-weekend-2026`.
- `Backend - uvicorn dev` запускает FastAPI локально через Python module `uvicorn`.

После клона открой корень репозитория в WebStorm/PyCharm/IntelliJ. IDE должна увидеть Git mapping, исключить `node_modules`, `dist`, `.venv`, `uploads` и предложить удобные команды запуска.

## Vercel MCP

В проект добавлен Cursor MCP-конфиг `.cursor/mcp.json` для официального Vercel MCP:

```json
{
  "mcpServers": {
    "vercel": {
      "url": "https://mcp.vercel.com"
    }
  }
}
```

Как подключить:

- Открой проект в Cursor.
- Cursor увидит сервер `vercel` и покажет `Needs login`.
- Нажми login и пройди OAuth-авторизацию Vercel.
- После этого AI-клиент сможет смотреть проекты, деплои и логи Vercel через MCP.

Для других клиентов можно подключить тот же endpoint вручную: `https://mcp.vercel.com`.
