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
3. Подготовьте SQLite-схему (создаст `prisma/teacherbot.db` и сгенерирует Prisma Client; `npm run api` теперь сам вызывает `prisma generate` на старте, но первый прогон лучше сделать вручную):
   ```bash
   npm run prisma:generate
   npm run prisma:db-push
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

## Диагностика ошибки 500 при `/api/bootstrap`
- Убедитесь, что API запущен (`npm run api`), а консоль показывает `API server running on http://localhost:4000`.
- Проверьте, что Prisma клиент сгенерирован и база создана (`npm run prisma:generate && npm run prisma:db-push`).
- Убедитесь, что `.env` содержит корректный `DATABASE_URL` (по умолчанию `file:./prisma/teacherbot.db`).

Если при обновлении цены видите сообщение вида `Unknown argument pricePerLesson`, значит локальный Prisma Client или база не обновились после последней схемы:
- выполните `npm run prisma:generate` (чтобы клиент знал о поле цены)
- выполните `npm run prisma:db-push` (чтобы добавить колонку `pricePerLesson` в SQLite)

## Полезные команды
- `npm run prisma:studio` — визуальный просмотр базы в браузере.
- `npm run lint` — типовой линт (tsc --noEmit).

> Приложение использует демо-преподавателя с chatId из `DEMO_TEACHER_ID` (по умолчанию `111222333`) и автоматически создаст его при первом запросе к API.
