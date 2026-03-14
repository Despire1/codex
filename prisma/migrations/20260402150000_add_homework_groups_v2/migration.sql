-- Homework groups V2 (safe, additive, idempotent)

CREATE TABLE IF NOT EXISTS "HomeworkGroup" (
  "id" SERIAL PRIMARY KEY
);

ALTER TABLE "HomeworkGroup"
  ADD COLUMN IF NOT EXISTS "teacherId" BIGINT,
  ADD COLUMN IF NOT EXISTS "title" TEXT,
  ADD COLUMN IF NOT EXISTS "description" TEXT,
  ADD COLUMN IF NOT EXISTS "iconKey" TEXT,
  ADD COLUMN IF NOT EXISTS "bgColor" TEXT,
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER,
  ADD COLUMN IF NOT EXISTS "isArchived" BOOLEAN,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

ALTER TABLE "HomeworkGroup"
  ALTER COLUMN "iconKey" SET DEFAULT 'layer-group',
  ALTER COLUMN "bgColor" SET DEFAULT '#F3F4F6',
  ALTER COLUMN "sortOrder" SET DEFAULT 0,
  ALTER COLUMN "isArchived" SET DEFAULT false,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "HomeworkGroup" WHERE "teacherId" IS NULL) THEN
    ALTER TABLE "HomeworkGroup" ALTER COLUMN "teacherId" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkGroup" WHERE "title" IS NULL) THEN
    ALTER TABLE "HomeworkGroup" ALTER COLUMN "title" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkGroup" WHERE "iconKey" IS NULL) THEN
    ALTER TABLE "HomeworkGroup" ALTER COLUMN "iconKey" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkGroup" WHERE "bgColor" IS NULL) THEN
    ALTER TABLE "HomeworkGroup" ALTER COLUMN "bgColor" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkGroup" WHERE "sortOrder" IS NULL) THEN
    ALTER TABLE "HomeworkGroup" ALTER COLUMN "sortOrder" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkGroup" WHERE "isArchived" IS NULL) THEN
    ALTER TABLE "HomeworkGroup" ALTER COLUMN "isArchived" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkGroup" WHERE "createdAt" IS NULL) THEN
    ALTER TABLE "HomeworkGroup" ALTER COLUMN "createdAt" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "HomeworkGroup" WHERE "updatedAt" IS NULL) THEN
    ALTER TABLE "HomeworkGroup" ALTER COLUMN "updatedAt" SET NOT NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkGroup_teacherId_fkey'
  ) THEN
    ALTER TABLE "HomeworkGroup"
      ADD CONSTRAINT "HomeworkGroup_teacherId_fkey"
      FOREIGN KEY ("teacherId") REFERENCES "Teacher"("chatId")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END $$;

-- Local drift repair: ensure HomeworkAssignment exists before extending it with groupId.
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

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'Teacher'
  ) AND NOT EXISTS (
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
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'Student'
  ) AND NOT EXISTS (
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
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'Lesson'
  ) AND NOT EXISTS (
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
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'HomeworkTemplate'
  ) AND NOT EXISTS (
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
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'Homework'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkAssignment_legacyHomeworkId_fkey'
  ) THEN
    ALTER TABLE "HomeworkAssignment"
      ADD CONSTRAINT "HomeworkAssignment_legacyHomeworkId_fkey"
      FOREIGN KEY ("legacyHomeworkId") REFERENCES "Homework"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "HomeworkAssignment_teacherId_studentId_status_idx"
  ON "HomeworkAssignment" ("teacherId", "studentId", "status");

CREATE INDEX IF NOT EXISTS "HomeworkAssignment_teacherId_lessonId_idx"
  ON "HomeworkAssignment" ("teacherId", "lessonId");

CREATE INDEX IF NOT EXISTS "HomeworkAssignment_studentId_deadlineAt_idx"
  ON "HomeworkAssignment" ("studentId", "deadlineAt");

CREATE INDEX IF NOT EXISTS "HomeworkAssignment_teacherId_deadlineAt_idx"
  ON "HomeworkAssignment" ("teacherId", "deadlineAt");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes WHERE indexname = 'HomeworkAssignment_legacyHomeworkId_key'
  ) AND NOT EXISTS (
    SELECT "legacyHomeworkId"
    FROM "HomeworkAssignment"
    WHERE "legacyHomeworkId" IS NOT NULL
    GROUP BY "legacyHomeworkId"
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX "HomeworkAssignment_legacyHomeworkId_key"
      ON "HomeworkAssignment" ("legacyHomeworkId");
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'HomeworkSubmission'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkSubmission_assignmentId_fkey'
  ) THEN
    ALTER TABLE "HomeworkSubmission"
      ADD CONSTRAINT "HomeworkSubmission_assignmentId_fkey"
      FOREIGN KEY ("assignmentId") REFERENCES "HomeworkAssignment"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

ALTER TABLE "HomeworkAssignment"
  ADD COLUMN IF NOT EXISTS "groupId" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkAssignment_groupId_fkey'
  ) THEN
    ALTER TABLE "HomeworkAssignment"
      ADD CONSTRAINT "HomeworkAssignment_groupId_fkey"
      FOREIGN KEY ("groupId") REFERENCES "HomeworkGroup"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "HomeworkGroup_teacherId_isArchived_sortOrder_updatedAt_idx"
  ON "HomeworkGroup" ("teacherId", "isArchived", "sortOrder", "updatedAt");

CREATE INDEX IF NOT EXISTS "HomeworkAssignment_teacherId_groupId_idx"
  ON "HomeworkAssignment" ("teacherId", "groupId");
