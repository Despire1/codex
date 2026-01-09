-- AlterTable
ALTER TABLE "Lesson" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "Lesson" ADD COLUMN "paidAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "NotificationLog" (
    "id" SERIAL PRIMARY KEY,
    "teacherId" BIGINT NOT NULL,
    "studentId" INTEGER,
    "lessonId" INTEGER,
    "type" TEXT NOT NULL,
    "scheduledFor" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "status" TEXT NOT NULL,
    "errorText" TEXT,
    "dedupeKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotificationLog_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("chatId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "NotificationLog_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "NotificationLog_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- AlterTable
ALTER TABLE "Student" ADD COLUMN "isActivated" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Student" ADD COLUMN "activatedAt" TIMESTAMP(3);

ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'TEACHER';

-- CreateIndex
CREATE UNIQUE INDEX "NotificationLog_dedupeKey_key" ON "NotificationLog"("dedupeKey");

-- CreateIndex
CREATE INDEX "NotificationLog_teacherId_idx" ON "NotificationLog"("teacherId");

-- CreateIndex
CREATE INDEX "NotificationLog_studentId_idx" ON "NotificationLog"("studentId");

-- CreateIndex
CREATE INDEX "NotificationLog_lessonId_idx" ON "NotificationLog"("lessonId");

-- CreateIndex
CREATE INDEX "NotificationLog_type_idx" ON "NotificationLog"("type");
