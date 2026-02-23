-- Homework review draft storage.
-- Safe/idempotent + local drift repair for environments where HomeworkSubmission is missing.

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
  ADD COLUMN IF NOT EXISTS "reviewDraft" TEXT,
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
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'HomeworkAssignment'
  ) AND NOT EXISTS (
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
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'Student'
  ) AND NOT EXISTS (
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
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'Teacher'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'HomeworkSubmission_reviewerTeacherId_fkey'
  ) THEN
    ALTER TABLE "HomeworkSubmission"
      ADD CONSTRAINT "HomeworkSubmission_reviewerTeacherId_fkey"
      FOREIGN KEY ("reviewerTeacherId") REFERENCES "Teacher"("chatId")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "HomeworkSubmission_assignmentId_attemptNo_key"
  ON "HomeworkSubmission" ("assignmentId", "attemptNo");

CREATE INDEX IF NOT EXISTS "HomeworkSubmission_assignmentId_status_idx"
  ON "HomeworkSubmission" ("assignmentId", "status");

CREATE INDEX IF NOT EXISTS "HomeworkSubmission_studentId_submittedAt_idx"
  ON "HomeworkSubmission" ("studentId", "submittedAt");
