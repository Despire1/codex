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
