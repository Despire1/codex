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
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "studentId" INTEGER NOT NULL,
    "teacherId" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Homework_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Homework_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("chatId") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Lesson" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teacherId" BIGINT NOT NULL,
    "studentId" INTEGER NOT NULL,
    "startAt" DATETIME NOT NULL,
    "durationMinutes" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Lesson_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("chatId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Lesson_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
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
CREATE UNIQUE INDEX "TeacherAuth_email_key" ON "TeacherAuth"("email");

-- CreateIndex
CREATE UNIQUE INDEX "TeacherAuth_teacherId_key" ON "TeacherAuth"("teacherId");
