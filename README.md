# TeacherBot web (локальный запуск)

Инструкция описывает, как поднять локально фронтенд (Vite) и API (Node + Prisma, SQLite).

## Требования
- Node.js 18+
- Возможность скачать зависимости npm (для @prisma/client, prisma и tsx)

## Быстрый старт
1. Установите зависимости:
   ```bash
   npm install
   ```
2. Скопируйте пример переменных окружения и убедитесь, что путь БД устраивает:
   ```bash
   cp .env.example .env
   ```
   - Для локальной разработки оставьте `VITE_API_BASE` пустым — Vite будет проксировать `/api` и `/auth` на `http://localhost:4000`.
   - `APP_BASE_URL` и `TELEGRAM_WEBAPP_URL` по умолчанию в примере уже указывают на `http://localhost:5173`.
3. Примените миграции и сгенерируйте Prisma Client (создаст `prisma/teacherbot.db`):
   ```bash
   npm run prisma:migrate
   npm run prisma:generate
   ```
4. Запустите API (порт 4000 по умолчанию):
   ```bash
   npm run api
   ```
5. В отдельном окне поднимите фронтенд (Vite с прокси на API):
   ```bash
   npm run dev
   ```
6. Откройте http://localhost:5173. Все запросы `/api/*` уйдут на локальный сервер.

## Локальный dev на localhost (проверка настройки)
Чтобы убедиться, что всё ходит именно на localhost:
1. Убедитесь, что в `.env`:
   - `DATABASE_URL="file:./prisma/teacherbot.db"`
   - `APP_BASE_URL="http://localhost:5173"`
   - `VITE_API_BASE=""` (пусто)
2. Запустите API:
   ```bash
   npm run api
   ```
   В логах должно быть: `API server running on http://localhost:4000`.
3. Запустите фронтенд:
   ```bash
   npm run dev
   ```
   Откройте `http://localhost:5173` и проверьте, что запросы идут на `http://localhost:4000` (через Vite proxy).

## Локальный PostgreSQL для проверки миграций
Если хотите прогонять миграции не на SQLite, а на локальном PostgreSQL:

### 1. Поднимите PostgreSQL локально
Самый простой вариант — Docker:
```bash
docker run --name teacherbot-postgres \
  -e POSTGRES_DB=teacherbot \
  -e POSTGRES_USER=teacherbot_user \
  -e POSTGRES_PASSWORD=teacherbot_pass \
  -p 5432:5432 \
  -d postgres:16
```
Проверьте доступность:
```bash
psql "postgresql://teacherbot_user:teacherbot_pass@localhost:5432/teacherbot" -c "SELECT 1;"
```

### 2. Укажите PostgreSQL в локальном `.env`
В `.env` выставьте:
```
DATABASE_URL="postgresql://teacherbot_user:teacherbot_pass@localhost:5432/teacherbot?schema=public"
```

### 3. Прогоните миграции в PostgreSQL (без риска для SQLite)
```bash
npm run prisma:migrate
npm run prisma:generate
```
> Эти команды применяются к базе из `DATABASE_URL`, так что SQLite не пострадает, если вы укажете PostgreSQL в `.env`.

### 4. Вернитесь к SQLite при необходимости
Если нужно снова работать с SQLite, верните в `.env`:
```
DATABASE_URL="file:./prisma/teacherbot.db"
```

## Продакшен деплой на сервер (PostgreSQL + HTTPS)
Ниже — минимальный, но полный список шагов для деплоя на удалённый сервер, чтобы всё работало так же, как при локальном запуске.

### 1. Подготовьте сервер
- Установите Node.js 18+.
- Установите PostgreSQL.
- Настройте домен и HTTPS (обязательно для Telegram WebApp и Secure cookies).

### 2. Клонируйте репозиторий
```bash
git clone <YOUR_REPO_URL> teacherbot
cd teacherbot
npm install
```

### 3. Создайте PostgreSQL БД и пользователя
Пример (на сервере):
```bash
createdb teacherbot
createuser teacherbot_user --pwprompt
```
Назначьте права:
```bash
psql -d teacherbot -c "GRANT ALL PRIVILEGES ON DATABASE teacherbot TO teacherbot_user;"
```

### 4. Заполните .env на сервере
Скопируйте пример:
```bash
cp .env.example .env
```
И заполните минимум эти переменные:
- `DATABASE_URL="postgresql://teacherbot_user:password@localhost:5432/teacherbot?schema=public"`
- `TELEGRAM_BOT_TOKEN="..."`
- `TELEGRAM_WEBAPP_URL="https://your-domain.com"`
- `TELEGRAM_ONBOARDING_FULLSCREEN_PHOTO_URL="https://your-domain.com/assets/onboarding-fullscreen.png"`
- `APP_BASE_URL="https://your-domain.com"`
- `API_PORT=4000`

Если API будет на другом домене/поддомене, выставьте `VITE_API_BASE` (например, `https://api.your-domain.com`).

### 5. Переключите Prisma на PostgreSQL
Откройте `prisma/schema.prisma` и замените:
```prisma
provider = "sqlite"
```
на:
```prisma
provider = "postgresql"
```

### 6. Примените миграции в PostgreSQL
```bash
npx prisma migrate deploy
npx prisma generate
```
> Важно: это не затрагивает вашу локальную SQLite БД, пока вы используете отдельный `.env` для локальной разработки.

### 7. Соберите фронтенд
```bash
npm run build
```

### 8. Запуск API и бота
Варианты:

**Через pm2 (рекомендуется):**
```bash
npx pm2 start ecosystem.config.cjs
npx pm2 save
```

**Локально/вручную:**
```bash
npm run api
npm run bot
```

### 9. Настройте reverse-proxy (Nginx)
Пример для одного домена (SPA + API):
```nginx
server {
  listen 443 ssl;
  server_name your-domain.com;

  # SSL конфиг здесь (certbot и т.д.)

  location / {
    root /path/to/teacherbot/dist;
    try_files $uri /index.html;
  }

  location /api/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }

  location /auth/ {
    proxy_pass http://127.0.0.1:4000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
  }
}
```

### 10. Telegram Webhook (опционально)
Сейчас бот работает через polling. Для webhook нужно добавить отдельный HTTP endpoint в API и вызывать `setWebhook`.
Если хотите — скажите, я добавлю поддержку webhook в код.

## Запуск Telegram Mini App
Ниже — полный сценарий, чтобы открыть приложение внутри Telegram Mini App.

### 1. Подготовьте переменные окружения
1. Скопируйте `.env.example` в `.env`, если ещё не сделали:
   ```bash
   cp .env.example .env
   ```
2. Откройте `.env` и заполните:
   - `TELEGRAM_BOT_TOKEN` — токен из BotFather.
   - `TELEGRAM_WEBAPP_URL` — публичный HTTPS URL вашего фронтенда.

### 2. Запустите API и фронтенд
В отдельных терминалах:
```bash
npm run api
```
```bash
npm run dev
```

### 3. Укажите публичный HTTPS URL фронтенда
Убедитесь, что фронтенд доступен по HTTPS, и укажите этот URL в `.env` как `TELEGRAM_WEBAPP_URL`.

> Если меняете `TELEGRAM_WEBAPP_URL` — перезапустите `npm run bot`.

### 4. Запустите Telegram-бота
В отдельном терминале:
```bash
npm run bot
```
Скрипт читает переменные окружения из `.env`. Перед запуском бот автоматически сбрасывает webhook, чтобы корректно работать через polling.
Бот автоматически:
- установит кнопку меню “Открыть приложение”;
- будет отвечать на `/start` или `/app` кнопкой открытия мини-приложения.

### 5. Настройте домен Mini App в BotFather
В BotFather выполните:
1. `/setdomain` → выберите бота → укажите домен вашего HTTPS URL (без пути).
2. (Опционально) `/setmenubutton` → выбрать “Web App” → указать `TELEGRAM_WEBAPP_URL`.

После этого откройте бота в Telegram и нажмите кнопку меню — откроется ваше приложение.

### Примечания
- Telegram Mini App требует HTTPS URL.
- Авторизация внутри Mini App работает через `/auth/telegram/webapp`.
- Если URL меняется, обновите `TELEGRAM_WEBAPP_URL` и перезапустите `npm run bot`.

## Диагностика ошибки 500 при `/api/bootstrap`
- Убедитесь, что API запущен (`npm run api`), а консоль показывает `API server running on http://localhost:4000`.
- Проверьте, что Prisma клиент сгенерирован и база создана (`npm run prisma:migrate && npm run prisma:generate`).
- Убедитесь, что `.env` содержит корректный `DATABASE_URL` (по умолчанию `file:./prisma/teacherbot.db`).

Если при обновлении цены или запуске API видите ошибки миграций/схемы, значит локальный Prisma Client или база не обновились после последней схемы:
- выполните `npm run prisma:migrate` (чтобы накатить актуальные миграции на SQLite)
- выполните `npm run prisma:generate` (чтобы клиент знал о новых полях вроде `pricePerLesson`)

### Если миграция падает с P3006 (no such table: Student)
Сейчас в репозитории одна базовая миграция `20251204194311_init`, которая сразу создаёт таблицу `Student` с полем `pricePerLesson`.

Если у вас остались локальные миграции старых версий (например, `20241104200000_add_student_price`), они могут идти *до* базовой и ломать запуск. Уберите их и пересоздайте SQLite:

**Быстрый фикс:**

```bash
npm run prisma:repair
```

Скрипт удалит устаревшие миграции, сбросит `prisma/teacherbot.db`, заново применит актуальную миграцию из репозитория и перегенерирует клиент.

**Ручной вариант:**

```bash
rm -rf prisma/migrations/20241104200000_add_student_price prisma/teacherbot.db
npm run prisma:migrate
npm run prisma:generate
```

Если локальные миграции расходятся сильнее, выполните `git clean -xfd` (удалит незакоммиченные файлы) и повторите шаги установки.

## Полезные команды
- `npm run prisma:studio` — визуальный просмотр базы в браузере.
- `npm run prisma:reset` — полная переинициализация базы (drop + повторное применение миграций) для устранения проблем с локальными миграциями.
- `npm run lint` — типовой линт (tsc --noEmit).

> Приложение использует демо-преподавателя с chatId из `DEMO_TEACHER_ID` (по умолчанию `111222333`) и автоматически создаст его при первом запросе к API.
