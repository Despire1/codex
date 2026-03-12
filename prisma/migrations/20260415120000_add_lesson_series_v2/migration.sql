-- Lesson series v2 (additive + idempotent, no destructive backfill)

CREATE TABLE IF NOT EXISTS "LessonSeries" (
  "id" SERIAL PRIMARY KEY
);

ALTER TABLE "LessonSeries"
  ADD COLUMN IF NOT EXISTS "teacherId" BIGINT,
  ADD COLUMN IF NOT EXISTS "groupKey" TEXT,
  ADD COLUMN IF NOT EXISTS "timeZone" TEXT,
  ADD COLUMN IF NOT EXISTS "anchorStartAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "durationMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "recurrenceWeekdays" TEXT,
  ADD COLUMN IF NOT EXISTS "recurrenceUntil" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "color" TEXT,
  ADD COLUMN IF NOT EXISTS "meetingLink" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

ALTER TABLE "LessonSeries"
  ALTER COLUMN "color" SET DEFAULT 'blue',
  ALTER COLUMN "status" SET DEFAULT 'ACTIVE',
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "LessonSeries" WHERE "teacherId" IS NULL) THEN
    ALTER TABLE "LessonSeries" ALTER COLUMN "teacherId" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "LessonSeries" WHERE "groupKey" IS NULL) THEN
    ALTER TABLE "LessonSeries" ALTER COLUMN "groupKey" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "LessonSeries" WHERE "timeZone" IS NULL) THEN
    ALTER TABLE "LessonSeries" ALTER COLUMN "timeZone" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "LessonSeries" WHERE "anchorStartAt" IS NULL) THEN
    ALTER TABLE "LessonSeries" ALTER COLUMN "anchorStartAt" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "LessonSeries" WHERE "durationMinutes" IS NULL) THEN
    ALTER TABLE "LessonSeries" ALTER COLUMN "durationMinutes" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "LessonSeries" WHERE "recurrenceWeekdays" IS NULL) THEN
    ALTER TABLE "LessonSeries" ALTER COLUMN "recurrenceWeekdays" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "LessonSeries" WHERE "color" IS NULL) THEN
    ALTER TABLE "LessonSeries" ALTER COLUMN "color" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "LessonSeries" WHERE "status" IS NULL) THEN
    ALTER TABLE "LessonSeries" ALTER COLUMN "status" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "LessonSeries" WHERE "createdAt" IS NULL) THEN
    ALTER TABLE "LessonSeries" ALTER COLUMN "createdAt" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "LessonSeries" WHERE "updatedAt" IS NULL) THEN
    ALTER TABLE "LessonSeries" ALTER COLUMN "updatedAt" SET NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "LessonSeriesParticipant" (
  "id" SERIAL PRIMARY KEY
);

ALTER TABLE "LessonSeriesParticipant"
  ADD COLUMN IF NOT EXISTS "seriesId" INTEGER,
  ADD COLUMN IF NOT EXISTS "studentId" INTEGER,
  ADD COLUMN IF NOT EXISTS "price" INTEGER,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3);

ALTER TABLE "LessonSeriesParticipant"
  ALTER COLUMN "price" SET DEFAULT 0,
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "LessonSeriesParticipant" WHERE "seriesId" IS NULL) THEN
    ALTER TABLE "LessonSeriesParticipant" ALTER COLUMN "seriesId" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "LessonSeriesParticipant" WHERE "studentId" IS NULL) THEN
    ALTER TABLE "LessonSeriesParticipant" ALTER COLUMN "studentId" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "LessonSeriesParticipant" WHERE "price" IS NULL) THEN
    ALTER TABLE "LessonSeriesParticipant" ALTER COLUMN "price" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "LessonSeriesParticipant" WHERE "createdAt" IS NULL) THEN
    ALTER TABLE "LessonSeriesParticipant" ALTER COLUMN "createdAt" SET NOT NULL;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "LessonSeriesException" (
  "id" SERIAL PRIMARY KEY
);

ALTER TABLE "LessonSeriesException"
  ADD COLUMN IF NOT EXISTS "seriesId" INTEGER,
  ADD COLUMN IF NOT EXISTS "lessonId" INTEGER,
  ADD COLUMN IF NOT EXISTS "originalStartAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "kind" TEXT,
  ADD COLUMN IF NOT EXISTS "status" TEXT,
  ADD COLUMN IF NOT EXISTS "overrideStartAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "overrideDurationMinutes" INTEGER,
  ADD COLUMN IF NOT EXISTS "color" TEXT,
  ADD COLUMN IF NOT EXISTS "meetingLink" TEXT,
  ADD COLUMN IF NOT EXISTS "participantStudentIds" TEXT,
  ADD COLUMN IF NOT EXISTS "createdAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3);

ALTER TABLE "LessonSeriesException"
  ALTER COLUMN "createdAt" SET DEFAULT CURRENT_TIMESTAMP,
  ALTER COLUMN "updatedAt" SET DEFAULT CURRENT_TIMESTAMP;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "LessonSeriesException" WHERE "seriesId" IS NULL) THEN
    ALTER TABLE "LessonSeriesException" ALTER COLUMN "seriesId" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "LessonSeriesException" WHERE "originalStartAt" IS NULL) THEN
    ALTER TABLE "LessonSeriesException" ALTER COLUMN "originalStartAt" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "LessonSeriesException" WHERE "kind" IS NULL) THEN
    ALTER TABLE "LessonSeriesException" ALTER COLUMN "kind" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "LessonSeriesException" WHERE "createdAt" IS NULL) THEN
    ALTER TABLE "LessonSeriesException" ALTER COLUMN "createdAt" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "LessonSeriesException" WHERE "updatedAt" IS NULL) THEN
    ALTER TABLE "LessonSeriesException" ALTER COLUMN "updatedAt" SET NOT NULL;
  END IF;
END $$;

ALTER TABLE "Lesson"
  ADD COLUMN IF NOT EXISTS "seriesId" INTEGER,
  ADD COLUMN IF NOT EXISTS "seriesOriginalStartAt" TIMESTAMP(3);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'Lesson_seriesId_fkey'
  ) THEN
    ALTER TABLE "Lesson"
      ADD CONSTRAINT "Lesson_seriesId_fkey"
      FOREIGN KEY ("seriesId") REFERENCES "LessonSeries"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'LessonSeries_teacherId_fkey'
  ) THEN
    ALTER TABLE "LessonSeries"
      ADD CONSTRAINT "LessonSeries_teacherId_fkey"
      FOREIGN KEY ("teacherId") REFERENCES "Teacher"("chatId")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'LessonSeriesParticipant_seriesId_fkey'
  ) THEN
    ALTER TABLE "LessonSeriesParticipant"
      ADD CONSTRAINT "LessonSeriesParticipant_seriesId_fkey"
      FOREIGN KEY ("seriesId") REFERENCES "LessonSeries"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'LessonSeriesParticipant_studentId_fkey'
  ) THEN
    ALTER TABLE "LessonSeriesParticipant"
      ADD CONSTRAINT "LessonSeriesParticipant_studentId_fkey"
      FOREIGN KEY ("studentId") REFERENCES "Student"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'LessonSeriesException_seriesId_fkey'
  ) THEN
    ALTER TABLE "LessonSeriesException"
      ADD CONSTRAINT "LessonSeriesException_seriesId_fkey"
      FOREIGN KEY ("seriesId") REFERENCES "LessonSeries"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'LessonSeriesException_lessonId_fkey'
  ) THEN
    ALTER TABLE "LessonSeriesException"
      ADD CONSTRAINT "LessonSeriesException_lessonId_fkey"
      FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "LessonSeries_groupKey_key" ON "LessonSeries"("groupKey");
CREATE INDEX IF NOT EXISTS "LessonSeries_teacherId_status_idx" ON "LessonSeries"("teacherId", "status");
CREATE INDEX IF NOT EXISTS "LessonSeries_teacherId_anchorStartAt_idx" ON "LessonSeries"("teacherId", "anchorStartAt");
CREATE UNIQUE INDEX IF NOT EXISTS "LessonSeriesParticipant_seriesId_studentId_key"
  ON "LessonSeriesParticipant"("seriesId", "studentId");
CREATE INDEX IF NOT EXISTS "LessonSeriesParticipant_seriesId_idx" ON "LessonSeriesParticipant"("seriesId");
CREATE INDEX IF NOT EXISTS "LessonSeriesParticipant_studentId_idx" ON "LessonSeriesParticipant"("studentId");
CREATE UNIQUE INDEX IF NOT EXISTS "LessonSeriesException_seriesId_originalStartAt_key"
  ON "LessonSeriesException"("seriesId", "originalStartAt");
CREATE INDEX IF NOT EXISTS "LessonSeriesException_seriesId_idx" ON "LessonSeriesException"("seriesId");
CREATE INDEX IF NOT EXISTS "LessonSeriesException_lessonId_idx" ON "LessonSeriesException"("lessonId");
CREATE INDEX IF NOT EXISTS "LessonSeriesException_kind_idx" ON "LessonSeriesException"("kind");
CREATE INDEX IF NOT EXISTS "Lesson_seriesId_idx" ON "Lesson"("seriesId");
CREATE INDEX IF NOT EXISTS "Lesson_seriesId_seriesOriginalStartAt_idx"
  ON "Lesson"("seriesId", "seriesOriginalStartAt");
