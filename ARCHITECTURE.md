# TeacherBot Web (SPA) Architecture

This document captures the proposed web migration of the existing TeacherBot Telegram experience. It outlines the monorepo layout, Prisma data models, API surface, background jobs, and shared service boundaries so that the Telegram bot and the web SPA reuse the same business logic.

## High-level architecture

- **Runtime**: TypeScript, Node.js. A single Next.js (App Router) project hosts the SPA and API routes.
- **Persistence**: Prisma ORM with a default SQLite database. The schema is fully PostgreSQL-ready; migration scripts avoid SQLite-only constructs.
- **Service layer**: Framework-agnostic service modules (e.g., `services/studentsService.ts`) encapsulate business rules. Both Telegram bot handlers and HTTP API routes call these services.
- **Transport**: REST-ish API under `/api/**`, secured with JWT sessions bound to the authenticated teacher. API routes validate `teacherId` to guarantee tenant isolation.
- **Notification channel**: `notifications/telegramNotifier.ts` exposes `sendHomeworkReminder(studentId, teacherId)` and `sendLessonReminder(lessonId)` so reminders are reusable from cron jobs, bot commands, and UI actions.
- **Background jobs**: A lightweight scheduler (cron or `setInterval` worker) scans lessons starting within 30 minutes and dispatches reminders for `SCHEDULED` lessons with known `telegramId`.

```
apps/
  web/ (Next.js App Router)
    app/ (routes & SPA)
    pages/api or app/api (HTTP routes)
packages/
  core/ (Prisma schema, services, notification adapters, validation)
  telegram-bot/ (bot entrypoint consuming core services)
```

## Prisma data models

```prisma
model Teacher {
  chatId    BigInt   @id
  username  String?
  name      String?
  students  TeacherStudent[]
  homeworks Homework[]
  lessons   Lesson[]
  createdAt DateTime @default(now())
  authUser  TeacherAuth?
}

model Student {
  id            Int              @id @default(autoincrement())
  username      String?
  telegramId    BigInt?
  teacherLinks  TeacherStudent[]
  homeworks     Homework[]
  lessons       Lesson[]
  createdAt     DateTime @default(now())
}

model TeacherStudent {
  id                 Int      @id @default(autoincrement())
  teacherId          BigInt
  studentId          Int
  customName         String
  autoRemindHomework Boolean @default(false)
  balanceLessons     Int     @default(0)

  teacher Teacher @relation(fields: [teacherId], references: [chatId])
  student Student @relation(fields: [studentId], references: [id])

  @@unique([teacherId, studentId])
}

model Homework {
  id        Int      @id @default(autoincrement())
  text      String
  deadline  DateTime?
  isDone    Boolean @default(false)
  studentId Int
  teacherId BigInt
  student   Student @relation(fields: [studentId], references: [id])
  teacher   Teacher @relation(fields: [teacherId], references: [chatId])
  createdAt DateTime @default(now())
}

enum LessonStatus {
  SCHEDULED
  COMPLETED
  CANCELED
}

model Lesson {
  id              Int          @id @default(autoincrement())
  teacherId       BigInt
  studentId       Int
  startAt         DateTime
  durationMinutes Int
  status          LessonStatus
  isPaid          Boolean @default(false)
  teacher         Teacher @relation(fields: [teacherId], references: [chatId])
  student         Student @relation(fields: [studentId], references: [id])
  createdAt       DateTime @default(now())
}

model TeacherAuth {
  id           Int     @id @default(autoincrement())
  email        String  @unique
  passwordHash String
  teacherId    BigInt  @unique
  teacher      Teacher @relation(fields: [teacherId], references: [chatId])
  createdAt    DateTime @default(now())
}
```

## Local database (SQLite)

- The repo ships with `.env.example` pointing `DATABASE_URL` at `file:./prisma/teacherbot.db`. Copy it to `.env` (or edit) to keep the DB co-located with the codebase for offline-friendly development.
- Run `npm install` (needs Prisma CLI + client), then `npm run prisma:db-push` to materialize the SQLite file from `prisma/schema.prisma`. Use `npm run prisma:generate` if you need to regenerate the client after schema tweaks.
- Inspect data with `npm run prisma:studio`. The same file can be mounted by the Telegram bot and the web server so they share state without extra configuration.
- To pivot to PostgreSQL later, only swap `DATABASE_URL` and rerun `npm run prisma:db-push`; no schema changes rely on SQLite-specific features.

## API surface (Next.js App Router)

- `POST /api/auth/register` — register `TeacherAuth` + bootstrap `Teacher` by `chatId` or deferred linking.
- `POST /api/auth/login` — issue JWT; payload includes `teacherId`.
- `GET /api/teacher/me` — profile + defaults (lesson duration, reminder window).
- `GET/POST /api/students` — list or add (creates `Student` if absent; always creates `TeacherStudent`).
- `GET/PATCH/DELETE /api/students/[id]` — update `customName`, `autoRemindHomework`, balances; delete = unlink.
- `GET/POST /api/students/[id]/homeworks` — CRUD homework for a teacher-owned student.
- `PATCH/DELETE /api/homeworks/[id]` — mark done or remove.
- `GET/POST /api/lessons` — list (filter by date range) or create.
- `PATCH/DELETE /api/lessons/[id]` — reschedule, set status, toggle payment.
- `POST /api/reminders/homework` — trigger manual reminder for a student or homework ID.
- `POST /api/reminders/lessons` — internal/cron endpoint to send lesson reminders due in ≤30 minutes.

All endpoints verify the JWT-derived `teacherId` before accessing any resource; `TeacherStudent` links enforce ownership of nested `Student`, `Homework`, and `Lesson` records.

## Service layer contract (shared between bot & API)

- `teachersService.createTeacherIfNotExists(chatId, username?, name?)`
- `teachersService.getTeacherDefaults(teacherId)`
- `studentsService.addStudentForTeacher(teacherId, { customName, username? })`
- `studentsService.renameStudentForTeacher(teacherId, studentId, newName)`
- `studentsService.unlinkStudentFromTeacher(teacherId, studentId)`
- `studentsService.toggleAutoReminder(teacherId, studentId, enabled)`
- `studentsService.adjustBalance(teacherId, studentId, delta)`
- `lessonsService.createLesson(teacherId, payload)`
- `lessonsService.markLessonCompleted(teacherId, lessonId, { isPaid?, autoDebitPrepaid = true })`
- `homeworkService.createHomework(teacherId, studentId, payload)`
- `homeworkService.toggleHomeworkDone(teacherId, homeworkId, isDone)`
- `homeworkService.remindHomework(teacherId, studentId)`

Services raise access errors when a `TeacherStudent` record is missing for the current teacher.

## Notification flow

1. **Manual homework reminder**: Web UI calls `/api/reminders/homework` → `homeworkService.remindHomework` → `notifications/telegramNotifier.sendHomeworkReminder`.
2. **Scheduled lesson reminder**: Cron worker queries `Lesson` with `status=SCHEDULED` and `startAt` within 30 minutes → sends Telegram message if the student has `telegramId`.
3. **Auto debit**: When `markLessonCompleted` runs, if `balanceLessons > 0` the service decrements it and optionally marks `isPaid=true` for prepaid usage.

## Frontend (mobile-first SPA)

- Built as a single-page dashboard with a bottom tab bar: **Dashboard, Students, Schedule, Settings**.
- Uses responsive cards, large tap targets, and sticky action bars for “Add student”, “Create lesson”, and “Remind about homework”.
- Data-fetching hooks (future): `useTeacher`, `useStudents`, `useLessons`, `useHomeworks` consume the API routes; today the UI uses in-memory state to mirror the expected domain objects.

## Security & secrets

- `.env` holds `DATABASE_URL` and `JWT_SECRET`; server-only files import via `process.env`.
- API routes check ownership through `TeacherStudent` relations; no cross-teacher data leakage.
- Prisma client is a singleton (`lib/prisma.ts`) reused by API handlers and bot code.

## Extensibility notes

- Payments can be introduced via a `Payment` model referencing `Lesson` and `TeacherStudent` while keeping `Lesson.isPaid` for quick flags.
- Telegram Login widget can replace password auth by exchanging Telegram auth data for JWT and linking to `Teacher` by `chatId`.
- A future student-facing portal can reuse the same API with a role-based policy layer.
