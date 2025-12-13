-- CreateTable
CREATE TABLE "Teacher" (
    "chatId" BIGINT NOT NULL PRIMARY KEY,
    "username" TEXT,
    "name" TEXT,
    "defaultLessonDuration" INTEGER NOT NULL DEFAULT 60,
    "reminderMinutesBefore" INTEGER NOT NULL DEFAULT 30,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Student" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "username" TEXT,
    "telegramId" BIGINT,
    "pricePerLesson" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TeacherStudent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teacherId" BIGINT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "customName" TEXT NOT NULL,
    "autoRemindHomework" BOOLEAN NOT NULL DEFAULT false,
    "balanceLessons" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "TeacherStudent_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("chatId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TeacherStudent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Homework" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "text" TEXT NOT NULL,
    "deadline" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "attachments" TEXT NOT NULL DEFAULT '[]',
    "timeSpentMinutes" INTEGER,
    "completedAt" DATETIME,
    "takenAt" DATETIME,
    "takenByStudentId" INTEGER,
    "studentId" INTEGER NOT NULL,
    "teacherId" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReminderAt" DATETIME,
    CONSTRAINT "Homework_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Homework_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("chatId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Homework_takenByStudentId_fkey" FOREIGN KEY ("takenByStudentId") REFERENCES "Student" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teacherId" BIGINT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "startAt" DATETIME NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "isRecurring" BOOLEAN NOT NULL DEFAULT false,
    "recurrenceUntil" DATETIME,
    "recurrenceGroupId" TEXT,
    "recurrenceWeekdays" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lesson_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("chatId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lesson_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lessonId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "teacherId" BIGINT NOT NULL,
    "comment" TEXT,
    CONSTRAINT "Payment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Payment_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("chatId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "LessonParticipant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lessonId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "attended" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LessonParticipant_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LessonParticipant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TeacherAuth" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "teacherId" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeacherAuth_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("chatId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "TeacherStudent_teacherId_studentId_key" ON "TeacherStudent"("teacherId", "studentId");

-- CreateIndex
CREATE INDEX "Lesson_recurrenceGroupId_idx" ON "Lesson"("recurrenceGroupId");

-- CreateIndex
CREATE INDEX "Payment_lessonId_idx" ON "Payment"("lessonId");

-- CreateIndex
CREATE INDEX "Payment_studentId_idx" ON "Payment"("studentId");

-- CreateIndex
CREATE INDEX "Payment_teacherId_idx" ON "Payment"("teacherId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_lessonId_studentId_key" ON "Payment"("lessonId", "studentId");

-- CreateIndex
CREATE INDEX "LessonParticipant_lessonId_idx" ON "LessonParticipant"("lessonId");

-- CreateIndex
CREATE INDEX "LessonParticipant_studentId_idx" ON "LessonParticipant"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonParticipant_lessonId_studentId_key" ON "LessonParticipant"("lessonId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAuth_email_key" ON "TeacherAuth"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAuth_teacherId_key" ON "TeacherAuth"("teacherId");
