# TeacherBot — карта проекта

Telegram Mini App + PWA для репетиторов: управление учениками, расписанием, домашними заданиями, платежами и уведомлениями. Дополнительно — Telegram-бот для регистрации, онбординга и оплаты подписки через YooKassa.

---

## 1. Стек и топология

- **Runtime:** Node.js 18+, TypeScript, ES modules.
- **Frontend:** React 18 + Redux Toolkit + кастомный React Router (`src/shared/lib/router.tsx`) + MUI + `@dnd-kit` + Vite 4. Архитектура — FSD-подобная (`app / entities / features / widgets / shared`).
- **Backend:** Чистый `http.createServer` (без Express), TypeScript запускается через `tsx`. Все эндпоинты в одном файле `src/backend/server.ts` (~5935 строк), часть отнесена в `server/routes/*.ts` и `server/modules/*.ts`.
- **DB:** Prisma ORM, PostgreSQL в проде, SQLite локально (переключается через `DATABASE_URL` + `provider` в `schema.prisma`).
- **Бот:** `src/backend/telegramBot.ts` — отдельный процесс, polling.
- **PWA:** `public/sw.js`, `public/manifest.webmanifest`, web-push через VAPID.
- **Платёжка:** YooKassa (ежемесячная подписка + 14-дневный trial).
- **Процессы в проде (PM2):** `api` (`src/backend/server.ts`) + `bot` (`src/backend/telegramBot.ts`). Конфиг — `ecosystem.config.cjs`.
- **Vite proxy:** `/api` и `/auth` → `http://localhost:4000`.

---

## 2. Структура корня

```
.env.example            # ~47 переменных, см. §11
ARCHITECTURE.md         # исходный (старый) дизайн-док
README.md               # инструкции запуска
ecosystem.config.cjs    # PM2: api + bot
index.html              # подгружает Telegram WebApp SDK, маунтит /src/app/index.tsx
vite.config.ts          # alias-ы react-router-dom и react-day-picker на внутренние
tsconfig.json           # ESNext, JSX react-jsx, alias @/* -> src/*
prisma/                 # schema.prisma + 41 миграция (см. §10)
public/                 # sw.js, manifest, иконки, onboarding-fullscreen.png
legacy/                 # статические HTML: offer.html, privacy.html, policy.html
scripts/                # dev/prod запуск, миграции, backfill (см. §12)
src/app + src/entities + src/features + src/widgets + src/shared + src/backend
```

---

## 3. Модель данных (Prisma)

Центр — `Teacher` (PK `chatId: BigInt`), связанный с `TeacherStudent` (link-таблица на пару учитель↔ученик). `Student` живёт отдельно с `telegramId`, активируется, когда ученик заходит в бота.

### Ключевые сущности

- **`Teacher`** — профиль репетитора и ~35 настроек уведомлений (`lessonReminderMinutes`, `dailySummaryTime`, `weekendWeekdays`, `homeworkReminderMorningTime`, шаблоны сообщений ученикам, пороги напоминаний об оплате, `autoConfirmLessons`, `activityFeedSeenAt` и т.п.).
- **`Student`** — `isActivated`, `timezone`, `pricePerLesson` (legacy — актуальная цена в `TeacherStudent`).
- **`TeacherStudent`** — связь с настройками ученика у конкретного учителя: `customName`, `email`, `phone`, `studentLevel`, `learningGoal`, `notes`, `balanceLessons` (предоплаченные уроки), `pricePerLesson`, `uiColor`, `isArchived`.
- **`Lesson`** — `startAt`, `durationMinutes`, `status` (`SCHEDULED|COMPLETED|CANCELED`), `paymentStatus` (enum `LessonPaymentStatus`), `paidSource` (`NONE|BALANCE|MANUAL`), `isSuppressed`, `meetingLink`, счётчик `paymentReminderCount`, связка `seriesId` + `seriesOriginalStartAt` для повторяющихся.
- **`LessonParticipant`** — многоучастниковый режим: `price`, `isPaid`, `attended`.
- **`LessonSeries` + `LessonSeriesParticipant` + `LessonSeriesException`** — повторяющиеся уроки: якорное время, recurrenceWeekdays, exceptions (override времени/участников/отмены для конкретного occurrence).
- **`Homework`** — legacy (v1). Остался как источник для бэкфилла.
- **`HomeworkTemplate`** — переиспользуемая библиотека: `blocks` (JSON), `tags`, `subject`, `level`.
- **`HomeworkGroup`** — пакеты заданий (цветная иконка, `sortOrder`).
- **`HomeworkAssignment`** — выданное задание (v2): `status` (`DRAFT|SCHEDULED|SENT|IN_REVIEW|REVIEWED|RETURNED|...`), `sendMode` (`MANUAL|AUTO_AFTER_LESSON_DONE|SCHEDULED`), `scheduledFor`, `deadlineAt`, `contentSnapshot`, `autoScore/manualScore/finalScore`, метки всех типов напоминаний (`reminder24hSentAt`, `reminderMorningSentAt`, `reminder3hSentAt`, `overdueReminderCount`). Может быть привязано к `lessonId`. `legacyHomeworkId` — связка с v1 (FK снят, остался scalar).
- **`HomeworkSubmission`** — попытки сдачи: `attemptNo`, `status` (`DRAFT|SUBMITTED|REVIEWED`), `answerText`, `attachments`, `voice`, `testAnswers`, `reviewDraft`, `reviewResult`, финальные оценки.
- **`Payment`** — фактические оплаты по уроку (`@@unique [teacherStudentId, lessonId]`).
- **`PaymentEvent`** — аудит операций с балансом (`lessonsDelta`, `priceSnapshot`, `moneyAmount`, `reason`, `comment`, `createdBy`).
- **`ScheduleNote`** — заметка на день (`dateKey`, `noteType='IMPORTANT'`).
- **`NotificationLog`** — журнал доставки с `channel` (`TELEGRAM|PWA_PUSH`), `status`, `dedupeKey` (UNIQUE — ключ идемпотентности).
- **`ActivityEvent`** — лента активности (категории `LESSON|STUDENT|HOMEWORK|SETTINGS|PAYMENT|NOTIFICATION`), `occurredAt`, `dedupeKey`.
- **`User`** — пользователь Telegram (PK `id`, `telegramUserId` unique, `role='TEACHER'|'STUDENT'`, подписка `subscriptionStartAt/EndAt`, `subscriptionTrialUsed`, `receiptEmail`, `termsAccepted`, флаги онбординга).
- **`Session`** — HTTP-сессия (`tokenHash`, `expiresAt`, `revokedAt`, IP/UA).
- **`TransferToken`** — одноразовый токен для перевода сессии с бота на WebApp.
- **`WebPushSubscription`** — VAPID-подписка: `endpoint` (unique), `p256dh`, `auth`, `routeMode` (`history|hash`), метки последних успехов/ошибок.
- **`TeacherAuth`** — e-mail+хеш пароля (заложено в схему, но в актуальных флоу не задействовано — всё идёт через Telegram).

### Enum-ы

`LessonPaymentStatus` (`UNPAID|PAID`), `LessonPaidSource` (`NONE|BALANCE|MANUAL`), `PaymentReminderSource` (`AUTO|MANUAL`), `NotificationChannel` (`TELEGRAM|PWA_PUSH`).

---

## 4. Backend

### 4.1 `src/backend/server.ts` — точка входа

- Сырой `http.createServer`, таймауты: `requestTimeout=60s`, `headersTimeout=65s`, `keepAliveTimeout=5s`, `maxHeadersCount=100`.
- На старте инстанцируются: `authService`, `sessionService`, `authSessionHandlers`, `activityFeedService`, `studentsService`, `homeworkV2Service`.
- Обрабатывает CORS/Security headers (см. `server/lib/security.ts`), потом: YooKassa webhook → session resolution → проверка подписки для не-STUDENT ролей → делегирование в конкретные `tryHandle*` из `server/routes/*`.
- Запускает 5 фоновых задач (см. §4.4).

### 4.2 HTTP API (все `/api/*` требуют сессию; не-STUDENT — активную подписку)

**Auth (`authRoutes.ts`):**
- `POST /auth/telegram/webapp` — верификация Telegram `initData`, создание `Session`.
- `GET /auth/telegram/browser-config`, `GET /auth/telegram/browser-login` — Telegram Login Widget для браузера.
- `GET /auth/session` — текущий пользователь.
- `POST /auth/logout` — revoke сессии.

**Sessions (`sessionRoutes.ts`):** `GET /api/sessions`, `POST /api/sessions/:id/revoke`, `POST /api/sessions/revoke-others`.

**Students v1 (`studentRoutes.ts`):** `GET/POST /api/students`, `GET /api/students/search`, `PATCH/PUT/DELETE /api/students/:id`, `/api/students/:id/{homeworks,lessons,unpaid-lessons,payment-reminders,auto-remind,price,balance,payments}`. Это основной API списка учеников, профиля, корректировки баланса, переключения автонапоминаний.

**Lessons (`lessonRoutes.ts`):** `GET /api/lessons?start=&end=`, `GET /api/lessons/unpaid`, `POST /api/lessons`, `POST /api/lessons/recurring`, `PATCH/DELETE /api/lessons/:id`, `POST /api/lessons/:id/{preview,cancel,restore,complete,toggle-paid,remind-payment}`, `PATCH /api/lessons/:id/status`, `POST /api/lessons/:id/participants/:sid/toggle-paid`, `POST /api/reminders/lesson`.

**Homework v1 (`homeworkRoutes.ts`, legacy):** `POST /api/homeworks`, `PATCH/DELETE /api/homeworks/:id`, `/api/homeworks/:id/{take-in-work,send,toggle,remind}`, `POST /api/reminders/homework`.

**Homework v2 (`homeworkRoutesV2.ts`):**
- Файлы: `POST /api/v2/files/presign-upload`, `PUT /api/v2/files/upload/:token`, `GET /api/v2/files/object/:key`.
- Группы: `GET/POST /api/v2/homework/groups`, `PATCH/DELETE /api/v2/homework/groups/:id`.
- Шаблоны: `GET/POST /api/v2/homework/templates`, `PATCH/DELETE /api/v2/homework/templates/:id`.
- Ассайнменты: `GET/POST /api/v2/homework/assignments`, `POST /api/v2/homework/assignments/bulk`, `GET /assignments/summary`, `GET/PATCH/DELETE /assignments/:id`, `POST /assignments/:id/{send,remind,cancel-issue,reissue}`.
- Сабмишены/ревью: `GET/POST /api/v2/homework/assignments/:id/submissions`, `POST /api/v2/homework/assignments/:id/{review-session,review-draft,review}`.

**Студенческий API v2 (`studentRoutesV2.ts`, только role=STUDENT):** `GET /api/v2/student/context`, `PATCH /api/v2/student/preferences`, `GET /api/v2/student/homework/{summary,assignments,assignments/:id}`.

**Активити-фид:** `GET /api/activity-feed`, `GET /api/activity-feed/unread-status`, `POST /api/activity-feed/mark-seen` (фильтры: categories, studentId, from/to, cursor).

**Уведомления:** `GET /api/notifications/channel-status`, `GET /api/notifications/test-recipients?type=`, `POST /api/notifications/send-test`.

**Schedule notes (`scheduleNoteRoutes.ts`):** CRUD заметок на день.

**PWA Push (`pwaPushRoutes.ts`):** `GET /api/pwa-push/config` (отдаёт VAPID publicKey), `POST/DELETE /api/pwa-push/subscriptions`, `POST /api/pwa-push/test`.

**Bootstrap:** `GET /api/bootstrap?lessonsStart=&lessonsEnd=&includeHomeworks=&includeStudents=&includeLinks=` — единая загрузка данных для SPA.

**Webhook:** `POST /api/yookassa/webhook` — Basic Auth, проверяется `event=payment.succeeded`, дедупликация в памяти по `payment.id`, продлевает `subscriptionEndAt` на 30 дней, отправляет квитанционное сообщение.

### 4.3 Утилиты (`server/lib/`)

- `http.ts` — `readBody` (лимит по умолчанию 1 МБ, max 20), `sendJson`, работа с куками (`session_id`, SameSite/Secure в зависимости от `isSecureRequest`), `serializeBigInt`, `getRequestIp`.
- `security.ts` — CORS + security headers (HSTS, X-Frame-Options, nosniff), `isMutationOriginValid` с bypass для webhook/upload, проверка авторизации YooKassa.
- `requestValidationError.ts` — кастомный класс `RequestValidationError` (status 400, `issues[]`).
- `runtimeLimits.ts` — in-memory rate limiter, `clampNumber`, `isValidTimeString`.

### 4.4 Фоновые задачи (cron-like setInterval в server.ts)

1. **`runLessonAutomationTick`** (`AUTOMATION_TICK_MS`) — сканирует `UPCOMING` уроки, автоподтверждение, списание с баланса (`settleLessonPayments`), логирование `ActivityEvent`.
2. **`runNotificationTick`** (60 с) — отправляет напоминания уроков и оплат через `notificationService`.
3. **`runOnboardingNudgeTick`** (15 мин) — пушит учителю напоминание об онбординге, если прошло 24ч после старта и нет учеников; cooldown 7 дней.
4. **`cleanupSessions`** — удаляет истекшие/отозванные.
5. **`cleanupNotificationLogs`** — retention 7–30 дней (`NOTIFICATION_LOG_RETENTION_DAYS`).
6. **`scheduleDailySessionCleanup`** — ежедневно в 03:00 UTC запускает 4–5.

### 4.5 Бизнес-модули (`server/modules/`)

- `auth.ts` (~330 стр.) — верификация `initData` и Telegram Login, `createSession/resolveSessionUser` (TTL 7–90 дней, default 30, renew-порог 7 дней), `LOCAL_AUTH_BYPASS` для локальной разработки.
- `sessions.ts` — listSessions / revokeSession / revokeOtherSessions.
- `activityFeed.ts` — `listActivityFeed`, `getActivityFeedUnreadStatus`, `markActivityFeedSeen`.
- `students.ts` (~1260 стр.) — CRUD учеников, `adjustBalance` (с `type` и `comment` → `PaymentEvent`), `updatePricePerLesson`, `toggleAutoReminder`, `normalizeTelegramUsername`, фильтрации (query/filter/overdue/debt), пагинация.
- `homeworkV2/` — `service.ts` (CRUD групп/шаблонов/ассайнментов, bulk, send, remind, review-session, review), `shared.ts` (нормализация статусов, workflow resolver, сериализация), `notifications.ts` (текст сообщения ученику).
- `homeworkTemplateValidation.ts` — валидация структуры шаблона.

### 4.6 Домашние сервисы

- **`notificationService.ts` (~824 стр.)** — 8 типов уведомлений (`TEACHER_LESSON_REMINDER`, `TEACHER_DAILY_SUMMARY`, `TEACHER_TOMORROW_SUMMARY`, `TEACHER_ONBOARDING_NUDGE`, `PAYMENT_REMINDER_TEACHER`, `STUDENT_LESSON_REMINDER`, `PAYMENT_REMINDER_STUDENT`, `HOMEWORK_*`). Для каждого — параллельная отправка в Telegram и PWA Push через `deliverNotificationChannel`. Дедупликация через `NotificationLog.dedupeKey`. Ошибки типа "chat not found" / "blocked" → `student.isActivated=false`.
- **`notificationLogService.ts`** — `createNotificationLogEntry` (возвращает null если дубль), `finalizeNotificationLogEntry`, `resolveNotificationChannelDedupeKey` (для TELEGRAM ключ как есть, для PWA_PUSH суффикс `:PWA_PUSH`), `summarizeNotificationChannelDelivery` (sent если хотя бы один канал — успех).
- **`activityFeedService.ts` (~589 стр.)** — `logActivityEvent`, `listActivityFeedForTeacher`, категоризация событий.
- **`webPushService.ts` (~371 стр.)** — ленивая инициализация `web-push` с VAPID (`WEB_PUSH_PUBLIC_KEY`/`WEB_PUSH_PRIVATE_KEY`/`WEB_PUSH_SUBJECT`), `upsertWebPushSubscription`, `sendWebPushToStudent/Teacher/User`, авто-удаление подписок при 404/410.
- **`studentContacts.ts`** — `resolveStudentTelegramId`: если нет `telegramId`, ищет `User` по нормализованному username и связывает.
- **`telegramOnboardingMessages.ts` (~172 стр.)** — фабрика сообщений онбординга: `sendTeacherIntro`, `sendTeacherStep1..3`, `sendTeacherFinal`, с поддержкой редактирования ранее отправленного сообщения (messageId).
- **`prismaClient.ts`** — singleton `PrismaClient`.

### 4.7 Шаблоны уведомлений (`src/shared/lib/notificationTemplates.ts`)

Переменные `{{student_name}}`, `{{lesson_date}}`, `{{lesson_time}}`, `{{lesson_datetime}}`, `{{lesson_link}}` (для урока); `{{lesson_price}}` для оплаты. Учитель может переопределить текст в настройках (`studentUpcomingLessonTemplate`, `studentPaymentDueTemplate`). Рендер через `fillTemplateVariables` (безопасный — только whitelisted переменные).

---

## 5. Telegram-бот (`src/backend/telegramBot.ts`)

- **Polling** с `allowed_updates=['message','callback_query']`, offset-based, retry 1с.
- **Команды:** `/start` (терms → выбор роли), `/app` / "открыть" (ссылка на WebApp).
- **Кнопки главного меню:** 🧑‍🏫 Я учитель / 🧑‍🎓 Я ученик / 🛟 Поддержка / 💎 Моя подписка.
- **Сценарии:**
  - Принятие условий (`terms_accept`) → `user.termsAccepted=true`.
  - Учитель: проверка подписки → если нет, `subscription_trial` (14 дней, один раз) или `subscription_monthly` (790 ₽). Далее 3 шага онбординга (`onboarding_teacher_*`), кнопка меню переключается на "Открыть приложение".
  - Ученик: поиск по `username` в `Student`, установка `telegramId` и `isActivated=true`.
- **Email для квитанции (ФЗ-54):** до создания платежа бот требует e-mail, хранится в `User.receiptEmail`.
- **YooKassa:** `POST https://api.yookassa.ru/v3/payments` с `Idempotence-Key`, receipt с `vat_code=1`, `metadata.telegramUserId`. Inline-кнопка "Подтвердить покупку" → `confirmation_url`. После вебхука `payment.succeeded` — продление `subscriptionEndAt` на 30 дней.
- **Меню-кнопка WebApp** (`setMenuButton`) настраивается автоматически для активных учителей.

---

## 6. Frontend

### 6.1 `src/app/`

- `index.tsx` → маунтит React.
- `App.tsx` — инициализация Telegram WebApp (fullscreen, layout insets), `SelectedStudentProvider`.
- `AppPage.tsx` (~65 КБ) — корневой shell: `StoreProvider`, `useTelegramWebAppAuth`, `useSessionStatus`, цепочка провайдеров (`ScheduleStateProvider`, `DashboardStateProvider`, `LessonActionsProvider`, `OnboardingStateProvider`, `UnsavedChangesProvider`). Определяет роль и рендерит мобильную/десктопную верстку.
- `components/AppRoutes.tsx` — маршрутизация по ролям:
  - **TEACHER:** `/dashboard`, `/students`, `/students/:id`, `/schedule`, `/homeworks`, `/homeworks/new`, `/homeworks/:templateId/{edit,}`, `/homeworks/review/:assignmentId`, `/analytics`, `/settings`.
  - **STUDENT:** `/dashboard`, `/homeworks`, `/homeworks/:assignmentId`, `/settings`.
- `components/AppModals.tsx` — централизованная регистрация всех модалей.
- `model/useAppDialogs.ts` — `openConfirmDialog`, `openRecurringDeleteDialog`, `openPaymentCancelDialog`, `openPaymentBalanceDialog`, `openLessonEditPaymentResetDialog`.
- `model/useLinkedStudents.ts` — мердж `Student` + `TeacherStudent` + `Homework` в `LinkedStudent[]`.
- `providers/StoreProvider/config/store.ts` — Redux store (`tasks`, `account`), persisted в localStorage.
- `pwa/registerServiceWorker.ts` — регистрация `/sw.js`.
- `tabs.ts` — определения табов (TEACHER_TABS vs STUDENT_TABS).

### 6.2 `src/entities/`

- **`account`** — XP (`addExperience`).
- **`task`** — личный календарь задач (не ДЗ).
- **`student`** — `SelectedStudentProvider`, парсинг заметок.
- **`lesson`** — `lessonDetails`, `lessonMutationGuards` (`resolveLessonAllowsLimitedMetadataEdit`, `resolveLessonHistoryLocked`), `lessonStatusPresentation`, UI `LessonChip`.
- **`homework-template`** — `workflow.ts` (автомат состояний шаблона), `quizSettings` (auto-check, passingScore, attempts 1|2|null, timer 1–720 мин, shuffle), `describeTemplateBlocks`.
- **`homework-assignment`** — `workflow.ts` (главный state machine: `status`, `isOverdue`, `needsStudentAction`, `needsTeacherAction`, `canReissue`), `assignmentBuckets` (группировка по корзинам), `assignmentIssuance`, `assignmentResponse`.
- **`homework-submission`** — `submissionState` (`getLatestSubmission`, `canStudentEditSubmission`, `canStudentSubmitNow`), `reviewResult`.
- **`types.ts`** — домен TS: `Teacher` (все ~35 настроек), `Student`, `TeacherStudent`, `Lesson` (`status`, `color`, `participants`, `seriesGroupId`), `Homework`, `HomeworkTemplate` + блоки, `HomeworkAssignment` (`status`, `sendMode`), `HomeworkSubmission`, `HomeworkTestQuestion` (типы `SINGLE_CHOICE|MULTIPLE_CHOICE|SHORT_ANSWER|MATCHING` и kind `CHOICE|SHORT_TEXT|LONG_TEXT|AUDIO|FILE|FILL_WORD|MATCHING|ORDERING|TABLE`).

### 6.3 `src/features/`

- **`auth/telegram`** — `useTelegramWebAppAuth` (initData → `api.telegramWebappAuth` → session), `TelegramBrowserLogin`.
- **`auth/session`** — `useSessionStatus` (role, hasSubscription), `SessionFallback`.
- **`homework-assign`** — `HomeworkAssignModal`, `assignmentStarter`.
- **`homework-submit`** — `StudentHomeworkDetailView` (ядро сдачи ДЗ: рендер блоков, таймер, сохранение черновика в localStorage), `StudentOrderingQuestion` (dnd-kit), `upload.ts`, `submissionDraftStorage`.
- **`homework-review`** — `HomeworkReviewScreen`, `HomeworkReviewModal`, `questionReview`.
- **`homework-template-editor`** — `HomeworkTemplateCreateScreen` (двойной режим `template` / `assignment`: блоки, материалы, quiz-настройки, планирование отправки), `model/lib/{blocks,quizSettings,templateValidation,createTemplateDraftStorage,templateFlow,createTemplateTopbarBridge,previewAssignment}`.
- **`homework-template-view`** — просмотр шаблона read-only.
- **`lessons`** — `useLessonActions` (открытие модалок, сохранение, удаление, перенос), диалоги: `LessonCancelDialog`, `LessonRestoreDialog`, `SeriesScopeDialog` (SINGLE/FOLLOWING/ALL для повторяющихся), `LessonPopover` (контекстное меню в календаре).
- **`modals`** — `StudentModal`, `LessonModal`, `RescheduleLessonModal`, `PaymentCancelModal`, `PaymentBalanceModal`, `ScheduleNoteModal`, `LessonEditPaymentResetModal`.
- **`notifications/sendTest`** — модалка отправки теста + хуки статуса каналов и получателей.
- **`onboarding`** — `useOnboardingState` (createdStudent, createdLesson, reminderSent, localStorage по teacherId).
- **`taskForm`** — `AddTaskModal`, `TaskForm` (личные задачи).

### 6.4 `src/widgets/`

- **`layout/`** — `Topbar` (+ `TopbarCreateMenu`), `Sidebar`, `Tabbar`, `mobile/{MobileBottomTabs, MobileTopbar, MobileSidebarDrawer}`, `model/navigation.ts`.
- **`dashboard/`** — `DashboardHome`, `DashboardSection`, `components/{WeeklyCalendar, WeeklyCalendarReference, ActivityFeedCard, ActivityFeedFullscreen, UnpaidLessonsPopoverContent, AttentionCard, DayOverflowPopover}`, `mobile/{MobileDashboard, MobileDashboardStats, Schedule, NextLessonCard, QuickActions, CloseLessonCard, Header}`, `model/useDashboardState`, `useDashboardSummary`.
- **`schedule/`** — `ScheduleSection`, `MonthDayLessonCard`, `MonthSidebarLessonItem`, `ScheduleDayNotesPanel`, `useScheduleState`, `useScheduleLessonsLoader`, `useScheduleLessonsRange`.
- **`students/`** — `StudentsSection`, `StudentsSidebar`, `StudentHero`, вкладки `Overview/Lessons/Homework/Payments`, `StudentDebtPopoverContent`, `LessonQuickActionsPopover`, `LessonActionsSheet` (mobile), `BalanceTopupModal`, `PaymentList`, `PaymentRemindersPopoverContent`, модели `useStudentsData`, `useStudentsActions`, `useStudentsHomework`, `useStudentCardFilters`.
- **`homeworks/teacher/`** — `TeacherHomeworksView`, `HomeworkLibraryWorkspace` (карточки шаблонов, фильтры), `HomeworkAssignmentsWorkspace` (выданные), `TeacherHomeworksHeader`, `TeacherHomeworksKpiSection`, `GroupEditorModal` + `GroupStylePickerModal`, мобильные экраны (`TeacherHomeworksMobileScreen` и карточки для библиотеки/ассайнментов/драфтов).
- **`homeworks/student/`** — `StudentHomeworksView`, `StudentHomeworkCard`, `StudentHomeworkRecentCard`, `StudentHomeworkTableSection`, `StudentHomeworkFiltersSection`, `StudentHomeworkStatsSection`.
- **`student-dashboard`**, **`student-settings`**, **`student-role`** — вариант UI для роли STUDENT.
- **`settings/`** — настройки учителя (таймзона, шаблоны, управление сессиями).
- **`subscription/SubscriptionGate`** — ограничение функционала без активной подписки.
- **`analytics/AnalyticsSection`** — статистика по заработкам/ученикам.
- **`onboarding/`**, **`Calendar/`**, **`MonthView/`**, **`WeekView/`**, **`Gamification/`** — вспомогательные.

### 6.5 `src/shared/`

- **`api/client.ts`** — единый API-клиент: `api.telegramWebappAuth`, `getSession`, `logout`, `listStudents`, `listLessons/createLesson/updateLesson/deleteLesson`, `listHomeworkAssignments/createAssignment/submitAssignment`, `createHomeworkTemplate`, `submitHomeworkReview` и 50+ других методов.
- **`ui/`** — Button, Modal + DialogModal, BottomSheet, Input, NumberInput, Select, StudentSelect, DatePickerField, Checkbox, Card, Badge, Avatar, Toast, Tooltip, Ellipsis, WeekdayToggleGroup, AnchoredPopover, AdaptivePopover (модалит на мобиле), icons.
- **`lib/`** — `toast/ToastProvider`, `timezoneContext`, `unsavedChanges`, `timeFields`, `timezoneDates` (date-fns + `formatInTimeZone`), `timezones`, `weekdays`, `lessonColors`, `pluralizeRu`, `humanizeDurationRu`, `normalizers`, `meetingLink`, `email`, `studentUiColors`, `notificationTemplates`, `form-validation/{types,path,useValidationSession}`, `pwa`, `pwaNotifications`, `pwaPush`, `localDatabase`, `router.tsx` (кастомный router — vite alias перенаправляет `react-router-dom` сюда), `useIsMobile`, `useIsDesktop`, `useFocusTrap`, `analytics`, `onboardingReminder`.
- **`day-picker/`** — кастомный календарь (alias для `react-day-picker`).
- **`telegram/`** — `fullscreen`, `layoutInsets`, `platform`, `types`.

---

## 7. PWA и Service Worker

- `public/manifest.webmanifest` — name=TeacherBot, start_url=`/dashboard`, display=standalone, theme `#5b8def`.
- `public/sw.js`:
  - `install`: кэширует app shell (`/`, `/index.html`, manifest, иконки), `skipWaiting`.
  - `activate`: чистит старые кэши, `clients.claim`.
  - `fetch`: **network-first** для навигации (fallback — кэш `/index.html`), **cache-first** для статики (`/assets/`, `.js`, `.css`, `.png`, `.svg`, `.ico`, `.webmanifest`). API/auth/transfer — network only.
  - `push`: парсит JSON, рендерит `showNotification` с `tag` (замена дубликатов), `icon`, `badge`, `data.url` (`resolveTargetUrl` учитывает `routeMode`).
  - `notificationclick`: ищет открытое окно (`clients.matchAll`) → `navigate + focus`, иначе `openWindow`.
- Клиент подписывается через `pwaPush.ts` + `pwaNotifications.ts`: чек `isSecureContext` + `serviceWorker/PushManager`, prompt только в standalone-режиме, флаг показа в localStorage (`teacherbot_pwa_notifications_prompt_seen_v1`).

---

## 8. Ключевые пользовательские флоу

### 8.1 Регистрация и авторизация

1. Пользователь открывает бота → `/start` → принимает условия.
2. Выбирает роль:
   - **Учитель**: если нет подписки — trial 14 дней или оплата 790 ₽. После — 3 шага онбординга в чате, финальный экран с кнопкой "Открыть приложение".
   - **Ученик**: бот ищет `Student.username == telegram username`, связывает `telegramId`, ставит `isActivated=true`. Если не находит — просит открыть ссылку от учителя.
3. В WebApp `useTelegramWebAppAuth` шлёт `initData` → сервер верифицирует HMAC-SHA256(`botToken`), создаёт `Session`, выставляет cookie `session_id`.
4. `useSessionStatus` читает роль и подписку. Роль определяет навигацию.

### 8.2 Расписание и уроки

- **Создание:** `LessonModal` (выбор учеников/группы, даты, длительности, повторения, цвета, ссылки на встречу, цены). Для повторяющихся создаётся `LessonSeries`.
- **Редактирование:** если урок проведён/оплачен — `resolveLessonAllowsLimitedMetadataEdit` ограничивает поля. Изменение цены оплаченного урока → `LessonEditPaymentResetDialog`. Для серии → `SeriesScopeDialog`.
- **Отмена:** `LessonCancelDialog`. Если оплачен — `PaymentCancelModal` (возврат на баланс vs списание). Фон: `LessonSeriesException` для повторяющихся.
- **Перенос:** `RescheduleLessonModal`.
- **Списание с баланса:** при `markLessonCompleted`/`toggleLessonPaid` сервис уменьшает `balanceLessons` и ставит `paidSource=BALANCE`.

### 8.3 Домашние задания (v2)

- **Создание шаблона:** `/homeworks/new` → `HomeworkTemplateCreateScreen` (блоки: текст, медиа, вопросы, место ответа; настройки теста; теги/предмет/уровень). Сохраняется в `HomeworkTemplate`.
- **Выдача:** из библиотеки → `HomeworkAssignModal` (ученик/группа, режим отправки `MANUAL|AUTO_AFTER_LESSON_DONE|SCHEDULED`, `deadlineAt`). Создаётся `HomeworkAssignment` со снапшотом контента.
- **Сдача (ученик):** `StudentHomeworkDetailView` → `HomeworkSubmission` (attemptNo, answers, files, voice, testAnswers). Черновик в localStorage. Автопроверка, если `quizSettings.autoCheckEnabled`.
- **Проверка (учитель):** `HomeworkReviewScreen` → `review-session` (черновик оценок/комментариев) → `review` (финал: `REVIEWED` или `RETURNED`). Если `RETURNED` — ученик делает новую попытку.
- **Напоминания:** метки в `HomeworkAssignment.reminder{24h|Morning|3h}SentAt`, `overdueReminderCount` (max из настроек учителя). Пуши уходят через `notificationService`.

### 8.4 Платежи и баланс

- **Баланс:** `TeacherStudent.balanceLessons`. Пополнение — `BalanceTopupModal` → `POST /api/students/:id/balance` с `delta`, `type`, `comment` → пишется `PaymentEvent`.
- **Напоминания об оплате:** порог (`paymentReminderDelayHours`), частота (`paymentReminderRepeatHours`), максимум (`paymentReminderMaxCount`). Ручное — `POST /api/lessons/:id/remind-payment`. Автоматическое — в `runNotificationTick`.
- **Подписка:** YooKassa webhook → `user.subscriptionEndAt += 30d`. Middleware не пускает не-STUDENT без активной подписки.

### 8.5 Уведомления

- **Каналы:** Telegram (приоритет) + PWA Push параллельно через `deliverNotificationChannel`.
- **Дедупликация:** `NotificationLog.dedupeKey` UNIQUE.
- **Шаблоны:** редактируются учителем, whitelisted переменные, fallback на дефолт.
- **Таймзоны:** `formatInTimeZone` с `resolveTimeZone(teacher|student).timezone`.
- **Activity Feed:** `ActivityEvent` с `dedupeKey` + `activityFeedSeenAt` у учителя → значок непрочитанного.

---

## 9. Авторизация и сессии

- **Cookie:** `session_id` (Secure+SameSite в HTTPS). Хранится только `tokenHash = sha256(token)`. TTL 30 дней (`SESSION_TTL_MINUTES`), renew при < 7 дней до истечения.
- **Проверка origin** для мутаций (bypass для webhook и файлов).
- **Rate limits:** 30/min для WebApp auth, 20/min для браузерного логина, отдельные для `transfer`.
- **`LOCAL_AUTH_BYPASS`:** только на localhost, автоматический логин под `LOCAL_DEV_USERNAME`.
- **`TransferToken`:** одноразовый токен, через который бот передаёт сессию в WebApp.

---

## 10. Prisma миграции (41 штука, хронология)

Эволюция:

1. **2025-03** onboarding fields на User.
2. **2025-12** — Teacher/Student/Payment/PaymentEvent (старт доменной модели), TeacherAuth, User+Session, enum-ы платежа, Lesson.color/completedAt/paidAt, NotificationLog, настройки уроков и таймзон, TeacherStudent.isArchived/pricePerLesson.
3. **2026-01** — настройки уведомлений (`LessonPaymentStatus`, `LessonPaidSource`, `PaymentReminderSource`), subscription fields, termsAccepted.
4. **2026-02–03** — receiptEmail, trial flag, ActivityEvent, daily/tomorrow summary, шаблоны сообщений ученикам, `meetingLink`, `activityFeedSeenAt`.
5. **2026-04** — **большой v2-блок**: `HomeworkSubmission`, `HomeworkGroup`, `TeacherStudent` профильные поля + `uiColor`, repair-миграция homework-настроек учителя, `LessonSeries`, `ScheduleNote` (+ noteType), `Lesson.isSuppressed`, снятие FK `HomeworkAssignment.legacyHomeworkId`, `weekendWeekdays`, **`WebPushSubscription` + `NotificationChannel.PWA_PUSH`**, `HomeworkSubmission.reviewResult`, `HomeworkAssignment.scheduledFor` (+ идемпотентный fix).

Миграции идемпотентны в критичных местах (`IF NOT EXISTS`, repair-миграции).

---

## 11. Переменные окружения (основные)

- **DB:** `DATABASE_URL` (switch sqlite ↔ postgres в `schema.prisma`).
- **Telegram:** `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_TEST_BOT_TOKEN`, `TELEGRAM_WEBAPP_URL`, `TELEGRAM_INITDATA_TTL_SEC` (300), `TELEGRAM_REPLAY_SKEW_SEC` (60), `TELEGRAM_BROWSER_REDIRECT_URL`.
- **YooKassa:** `YOOKASSA_SHOP_ID`, `YOOKASSA_SECRET_KEY`, `YOOKASSA_RETURN_URL`, `YOOKASSA_WEBHOOK_REQUIRE_AUTH`.
- **API:** `APP_BASE_URL`, `API_PORT=4000`, `API_JSON_BODY_LIMIT_BYTES`, таймауты (`REQUEST/HEADERS/KEEP_ALIVE`).
- **Security:** `CORS_ALLOWED_ORIGINS`, `CORS_ALLOW_METHODS`, `CORS_ALLOW_HEADERS`, `CORS_MAX_AGE_SEC`, `SECURITY_ENFORCE_ORIGIN_CHECK`, `SECURITY_ALLOW_MISSING_ORIGIN`, `SECURITY_HSTS_MAX_AGE_SEC`.
- **Session/Auth:** `SESSION_TTL_MINUTES`, `TRANSFER_TOKEN_TTL_SEC`, `TRANSFER_REDIRECT_URL`, `LOCAL_AUTH_BYPASS`, `VITE_LOCAL_AUTH_BYPASS`, `LOCAL_DEV_{TELEGRAM_ID,USERNAME,FIRST_NAME,LAST_NAME}`.
- **Docker Postgres:** `DB_CONTAINER_NAME`, `POSTGRES_DB/USER/PASSWORD/PORT`.
- **Rate limits:** `RATE_LIMIT_WEBAPP_PER_MIN`, `RATE_LIMIT_BROWSER_LOGIN_PER_MIN`, `RATE_LIMIT_TRANSFER_*`.
- **Notifications:** `NOTIFICATION_LOG_RETENTION_DAYS` (30), `NOTIFICATION_TICK_MS`, `ONBOARDING_NUDGE_*`.
- **Web Push:** `WEB_PUSH_PUBLIC_KEY`, `WEB_PUSH_PRIVATE_KEY`, `WEB_PUSH_SUBJECT`.
- **Frontend:** `VITE_API_BASE` (если API на другом origin).

---

## 12. Скрипты (`scripts/`)

- **`dev-local.sh`** — `LOCAL_AUTH_BYPASS=true`, `prisma:generate`, api+vite в фоне, ждёт порт 4000.
- **`dev-local-bot.sh`** — то же плюс бот, если есть `TELEGRAM_BOT_TOKEN`.
- **`db-local.sh`** — docker-контейнер PostgreSQL 15 (`teacherbot-db`), volume, порт 5432.
- **`prisma-migrate-local.sh`** — идемпотентный `prisma migrate` с проверкой статуса.
- **`prisma-repair.sh`** — удаляет стейл-миграции (`add_student_price`), сбрасывает SQLite, переапплаит.
- **`start-local-dev.sh`** — полный дев с ngrok (публичный HTTPS URL + переменные для бота и вебхука).
- **`start-all.sh`** — прод: `npm install` + `npm run build` + `pm2-runtime ecosystem.config.cjs`.
- **`backfill-homework-v2.ts`** — конвертирует legacy `Homework` → `HomeworkAssignment` (v2): парсит `text`+`attachments` в JSON-блоки (TEXT/MEDIA), мапит статусы, генерирует UUIDs для вложений, пропускает уже обработанные по `legacyHomeworkId`. Батч 200.

---

## 13. Команды

```bash
npm run dev              # vite на 5173
npm run api              # API на 4000 (prisma generate + tsx server)
npm run bot              # Telegram bot (polling)
npm run dev:local        # api + vite + LOCAL_AUTH_BYPASS
npm run dev:local:bot    # dev:local + бот
npm run db:local         # docker postgres
npm run build            # vite build
npm run prisma:migrate   # dev миграция
npm run prisma:repair    # чистка стейл-миграций
npm run prisma:studio    # UI Prisma
npm run start:prod       # build + pm2 start + pm2 save
npm run backfill:homework:v2   # миграция v1→v2
npm run lint             # tsc --noEmit
```

---

## 14. Критичные инварианты

1. Все мутации проверяют принадлежность данных учителю через `TeacherStudent` (cross-tenant изоляция).
2. Для полностью оплаченных/проведённых уроков редактирование ограничено (`lessonMutationGuards`).
3. Платёж по уроку уникален (`Payment @@unique [teacherStudentId, lessonId]`) — нельзя оплатить дважды.
4. Уведомления идемпотентны по `NotificationLog.dedupeKey` (UNIQUE).
5. YooKassa webhook дедуплицирует по `payment.id` (in-memory) и перед продлением валидирует статус `succeeded`.
6. `initData` проверяется на TTL (`TELEGRAM_INITDATA_TTL_SEC=300`) и replay skew (60с).
7. При 404/410 от push-эндпоинта подписка автоматически удаляется.
8. "Chat not found"/"blocked by user" → `student.isActivated=false`.
9. Kаскады: `HomeworkAssignment → submissions` Cascade; `Lesson → participants/payments/payment-events/notification-logs/activity-events` Cascade; `Teacher → scheduleNotes` Cascade.
10. Подписка обязательна для всех ролей кроме STUDENT (middleware в server.ts).
