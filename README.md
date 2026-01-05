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

## Запуск Telegram Mini App (локально через ngrok)
Ниже — полный сценарий, чтобы открыть приложение внутри Telegram Mini App, сохранив локальный запуск.

### 1. Подготовьте переменные окружения
1. Скопируйте `.env.example` в `.env`, если ещё не сделали:
   ```bash
   cp .env.example .env
   ```
2. Откройте `.env` и заполните:
   - `TELEGRAM_BOT_TOKEN` — токен из BotFather.
   - `TELEGRAM_WEBAPP_URL` — публичный HTTPS URL вашего фронтенда (будет от ngrok).

### 2. Запустите API и фронтенд
В отдельных терминалах:
```bash
npm run api
```
```bash
npm run dev
```

### 3. Поднимите ngrok для фронтенда
В отдельном терминале:
```bash
ngrok http 5173
```
Скопируйте выданный HTTPS-адрес и вставьте его в `.env` как `TELEGRAM_WEBAPP_URL`.

> Если меняете `TELEGRAM_WEBAPP_URL` — перезапустите `npm run bot`.

### 4. Запустите Telegram-бота
В отдельном терминале:
```bash
npm run bot
```
Скрипт читает переменные окружения из `.env`.
Бот автоматически:
- установит кнопку меню “Открыть приложение”;
- будет отвечать на `/start` или `/app` кнопкой открытия мини-приложения.

### 5. Настройте домен Mini App в BotFather
В BotFather выполните:
1. `/setdomain` → выберите бота → укажите домен из ngrok (без пути).
2. (Опционально) `/setmenubutton` → выбрать “Web App” → указать `TELEGRAM_WEBAPP_URL`.

После этого откройте бота в Telegram и нажмите кнопку меню — откроется ваше приложение.

### Примечания
- Telegram Mini App требует HTTPS URL. Локально это решается через ngrok.
- Авторизация внутри Mini App работает через `/auth/telegram/webapp`.
- Если ngrok URL меняется, обновите `TELEGRAM_WEBAPP_URL` и перезапустите `npm run bot`.

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
