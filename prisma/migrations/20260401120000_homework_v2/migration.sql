-- Homework V2 (additive + idempotent + safe for partially applied local DB)

ALTER TABLE "Teacher"
  ADD COLUMN IF NOT EXISTS "homeworkNotifyOnAssign" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "homeworkReminder24hEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "homeworkReminderMorningEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "homeworkReminderMorningTime" TEXT NOT NULL DEFAULT '10:00',
  ADD COLUMN IF NOT EXISTS "homeworkReminder3hEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "homeworkOverdueRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "homeworkOverdueReminderTime" TEXT NOT NULL DEFAULT '10:00',
  ADD COLUMN IF NOT EXISTS "homeworkOverdueReminderMaxCount" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "Student"
  ADD COLUMN IF NOT EXISTS "timezone" TEXT;

CREATE TABLE IF NOT EXISTS "HomeworkTemplate" (
  "id" SERIAL PRIMARY KEY
);

ALTER TABLE "HomeworkTemplate"
  ADD COLUMN IF NOT EXISTS "teacherId" BIGINT,
  ADD COLUMN IF NOT EXISTS "createdByTeacherId" BIGINT,
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "tags" TEXT,
  ADD COLUMN IF NOT EXISTS "subject" TEXT,
  ADD COLUMN IF NOT EXISTS "level" TEXT,
  ADD COLUMN IF NOT EXISTS "blocks" TEXT,
  ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

ALTER TABLE "HomeworkTemplate"
  ALTER COLUMN "tags" SET DEFAULT '[]',
  ALTER COLUMN "blocks" SET DEFAULT '[]',
  ALTER COLUMN "isArchived" SET DEFAULT false,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "HomeworkTemplate" WHERE "teacherId" IS NULL) THEN
    ALTER TABLE "HomeworkTemplate" ALTER COLUMN "teacherId" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkTemplate" WHERE "title" IS NULL) THEN
    ALTER TABLE "HomeworkTemplate" ALTER COLUMN "title" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkTemplate" WHERE "tags" IS NULL) THEN
    ALTER TABLE "HomeworkTemplate" ALTER COLUMN "tags" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkTemplate" WHERE "blocks" IS NULL) THEN
    ALTER TABLE "HomeworkTemplate" ALTER COLUMN "blocks" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkTemplate" WHERE "isArchived" IS NULL) THEN
    ALTER TABLE "HomeworkTemplate" ALTER COLUMN "isArchived" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkTemplate" WHERE "createdAt" IS NULL) THEN
    ALTER TABLE "HomeworkTemplate" ALTER COLUMN "createdAt" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkTemplate" WHERE "updatedAt" IS NULL) THEN
    ALTER TABLE "HomeworkTemplate" ALTER COLUMN "updatedAt" SET NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "HomeworkAssignment" (
  "id" SERIAL PRIMARY KEY
);

ALTER TABLE "HomeworkAssignment"
  ADD COLUMN IF NOT EXISTS "teacherId" BIGINT,
  ADD COLUMN IF NOT EXISTS "studentId" INTEGER,
  ADD COLUMN IF NOT EXISTS "lessonId" INTEGER,
  ADD COLUMN IF NOT EXISTS "templateId" INTEGER,
  ADD COLUMN IF NOT EXISTS "legacyHomeworkId" INTEGER,
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT,
  ADD COLUMN IF NOT EXISTS "sendMode" TEXT,
  ADD COLUMN IF NOT EXISTS "deadlineAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "sentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "contentSnapshot" TEXT,
  ADD COLUMN IF NOT EXISTS "autoScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "manualScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "finalScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "teacherComment" TEXT,
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reminder24hSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reminderMorningSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reminder3hSentAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "overdueReminderCount" INTEGER,
  ADD COLUMN IF NOT EXISTS "lastOverdueReminderAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

ALTER TABLE "HomeworkAssignment"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT',
  ALTER COLUMN "sendMode" SET DEFAULT 'MANUAL',
  ALTER COLUMN "contentSnapshot" SET DEFAULT '[]',
  ALTER COLUMN "overdueReminderCount" SET DEFAULT 0,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "HomeworkAssignment" WHERE "teacherId" IS NULL) THEN
    ALTER TABLE "HomeworkAssignment" ALTER COLUMN "teacherId" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkAssignment" WHERE "studentId" IS NULL) THEN
    ALTER TABLE "HomeworkAssignment" ALTER COLUMN "studentId" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkAssignment" WHERE "title" IS NULL) THEN
    ALTER TABLE "HomeworkAssignment" ALTER COLUMN "title" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkAssignment" WHERE "status" IS NULL) THEN
    ALTER TABLE "HomeworkAssignment" ALTER COLUMN "status" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkAssignment" WHERE "sendMode" IS NULL) THEN
    ALTER TABLE "HomeworkAssignment" ALTER COLUMN "sendMode" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkAssignment" WHERE "contentSnapshot" IS NULL) THEN
    ALTER TABLE "HomeworkAssignment" ALTER COLUMN "contentSnapshot" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkAssignment" WHERE "overdueReminderCount" IS NULL) THEN
    ALTER TABLE "HomeworkAssignment" ALTER COLUMN "overdueReminderCount" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkAssignment" WHERE "createdAt" IS NULL) THEN
    ALTER TABLE "HomeworkAssignment" ALTER COLUMN "createdAt" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkAssignment" WHERE "updatedAt" IS NULL) THEN
    ALTER TABLE "HomeworkAssignment" ALTER COLUMN "updatedAt" SET NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "HomeworkSubmission" (
  "id" SERIAL PRIMARY KEY
);

ALTER TABLE "HomeworkSubmission"
  ADD COLUMN IF NOT EXISTS "assignmentId" INTEGER,
  ADD COLUMN IF NOT EXISTS "studentId" INTEGER,
  ADD COLUMN IF NOT EXISTS "reviewerTeacherId" BIGINT,
  ADD COLUMN IF NOT EXISTS "attemptNo" INTEGER,
  ADD COLUMN IF NOT EXISTS "status" TEXT,
  ADD COLUMN IF NOT EXISTS "answerText" TEXT,
  ADD COLUMN IF NOT EXISTS "attachments" TEXT,
  ADD COLUMN IF NOT EXISTS "voice" TEXT,
  ADD COLUMN IF NOT EXISTS "testAnswers" TEXT,
  ADD COLUMN IF NOT EXISTS "autoScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "manualScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "finalScore" INTEGER,
  ADD COLUMN IF NOT EXISTS "teacherComment" TEXT,
  ADD COLUMN IF NOT EXISTS "submittedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "reviewedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

ALTER TABLE "HomeworkSubmission"
  ALTER COLUMN "status" SET DEFAULT 'DRAFT',
  ALTER COLUMN "attachments" SET DEFAULT '[]',
  ALTER COLUMN "voice" SET DEFAULT '[]',
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "HomeworkSubmission" WHERE "assignmentId" IS NULL) THEN
    ALTER TABLE "HomeworkSubmission" ALTER COLUMN "assignmentId" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkSubmission" WHERE "studentId" IS NULL) THEN
    ALTER TABLE "HomeworkSubmission" ALTER COLUMN "studentId" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkSubmission" WHERE "attemptNo" IS NULL) THEN
    ALTER TABLE "HomeworkSubmission" ALTER COLUMN "attemptNo" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkSubmission" WHERE "status" IS NULL) THEN
    ALTER TABLE "HomeworkSubmission" ALTER COLUMN "status" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkSubmission" WHERE "attachments" IS NULL) THEN
    ALTER TABLE "HomeworkSubmission" ALTER COLUMN "attachments" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkSubmission" WHERE "voice" IS NULL) THEN
    ALTER TABLE "HomeworkSubmission" ALTER COLUMN "voice" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkSubmission" WHERE "createdAt" IS NULL) THEN
    ALTER TABLE "HomeworkSubmission" ALTER COLUMN "createdAt" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkSubmission" WHERE "updatedAt" IS NULL) THEN
    ALTER TABLE "HomeworkSubmission" ALTER COLUMN "updatedAt" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkTemplate_teacherId_fkey'
  ) THEN
    ALTER TABLE "HomeworkTemplate"
      ADD CONSTRAINT "HomeworkTemplate_teacherId_fkey"
      FOREIGN KEY ("teacherId") REFERENCES "Teacher"("chatId")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkTemplate_createdByTeacherId_fkey'
  ) THEN
    ALTER TABLE "HomeworkTemplate"
      ADD CONSTRAINT "HomeworkTemplate_createdByTeacherId_fkey"
      FOREIGN KEY ("createdByTeacherId") REFERENCES "Teacher"("chatId")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkAssignment_teacherId_fkey'
  ) THEN
    ALTER TABLE "HomeworkAssignment"
      ADD CONSTRAINT "HomeworkAssignment_teacherId_fkey"
      FOREIGN KEY ("teacherId") REFERENCES "Teacher"("chatId")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkAssignment_studentId_fkey'
  ) THEN
    ALTER TABLE "HomeworkAssignment"
      ADD CONSTRAINT "HomeworkAssignment_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkAssignment_lessonId_fkey'
  ) THEN
    ALTER TABLE "HomeworkAssignment"
      ADD CONSTRAINT "HomeworkAssignment_lessonId_fkey"
      FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkAssignment_templateId_fkey'
  ) THEN
    ALTER TABLE "HomeworkAssignment"
      ADD CONSTRAINT "HomeworkAssignment_templateId_fkey"
      FOREIGN KEY ("templateId") REFERENCES "HomeworkTemplate"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkAssignment_legacyHomeworkId_fkey'
  ) THEN
    ALTER TABLE "HomeworkAssignment"
      ADD CONSTRAINT "HomeworkAssignment_legacyHomeworkId_fkey"
      FOREIGN KEY ("legacyHomeworkId") REFERENCES "Homework"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkSubmission_assignmentId_fkey'
  ) THEN
    ALTER TABLE "HomeworkSubmission"
      ADD CONSTRAINT "HomeworkSubmission_assignmentId_fkey"
      FOREIGN KEY ("assignmentId") REFERENCES "HomeworkAssignment"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkSubmission_studentId_fkey'
  ) THEN
    ALTER TABLE "HomeworkSubmission"
      ADD CONSTRAINT "HomeworkSubmission_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkSubmission_reviewerTeacherId_fkey'
  ) THEN
    ALTER TABLE "HomeworkSubmission"
      ADD CONSTRAINT "HomeworkSubmission_reviewerTeacherId_fkey"
      FOREIGN KEY ("reviewerTeacherId") REFERENCES "Teacher"("chatId")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "HomeworkTemplate_teacherId_isArchived_updatedAt_idx"
  ON "HomeworkTemplate" ("teacherId", "isArchived", "updatedAt");

CREATE UNIQUE INDEX IF NOT EXISTS "HomeworkAssignment_legacyHomeworkId_key"
  ON "HomeworkAssignment" ("legacyHomeworkId");

CREATE INDEX IF NOT EXISTS "HomeworkAssignment_teacherId_studentId_status_idx"
  ON "HomeworkAssignment" ("teacherId", "studentId", "status");

CREATE INDEX IF NOT EXISTS "HomeworkAssignment_teacherId_lessonId_idx"
  ON "HomeworkAssignment" ("teacherId", "lessonId");

CREATE INDEX IF NOT EXISTS "HomeworkAssignment_studentId_deadlineAt_idx"
  ON "HomeworkAssignment" ("studentId", "deadlineAt");

CREATE INDEX IF NOT EXISTS "HomeworkAssignment_teacherId_deadlineAt_idx"
  ON "HomeworkAssignment" ("teacherId", "deadlineAt");

CREATE UNIQUE INDEX IF NOT EXISTS "HomeworkSubmission_assignmentId_attemptNo_key"
  ON "HomeworkSubmission" ("assignmentId", "attemptNo");

CREATE INDEX IF NOT EXISTS "HomeworkSubmission_assignmentId_status_idx"
  ON "HomeworkSubmission" ("assignmentId", "status");

CREATE INDEX IF NOT EXISTS "HomeworkSubmission_studentId_submittedAt_idx"
  ON "HomeworkSubmission" ("studentId", "submittedAt");
