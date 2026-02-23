-- Repair migration for environments where homework settings columns
-- were not applied to Teacher due to partial/failed migration history.
-- Safe/idempotent: only additive changes and null-safe normalization.

ALTER TABLE "Teacher"
  ADD COLUMN IF NOT EXISTS "homeworkNotifyOnAssign" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "homeworkReminder24hEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "homeworkReminderMorningEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "homeworkReminderMorningTime" TEXT NOT NULL DEFAULT '10:00',
  ADD COLUMN IF NOT EXISTS "homeworkReminder3hEnabled" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "homeworkOverdueRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "homeworkOverdueReminderTime" TEXT NOT NULL DEFAULT '10:00',
  ADD COLUMN IF NOT EXISTS "homeworkOverdueReminderMaxCount" INTEGER NOT NULL DEFAULT 3;

ALTER TABLE "Teacher"
  ALTER COLUMN "homeworkNotifyOnAssign" SET DEFAULT true,
  ALTER COLUMN "homeworkReminder24hEnabled" SET DEFAULT true,
  ALTER COLUMN "homeworkReminderMorningEnabled" SET DEFAULT true,
  ALTER COLUMN "homeworkReminderMorningTime" SET DEFAULT '10:00',
  ALTER COLUMN "homeworkReminder3hEnabled" SET DEFAULT false,
  ALTER COLUMN "homeworkOverdueRemindersEnabled" SET DEFAULT true,
  ALTER COLUMN "homeworkOverdueReminderTime" SET DEFAULT '10:00',
  ALTER COLUMN "homeworkOverdueReminderMaxCount" SET DEFAULT 3;

UPDATE "Teacher"
SET
  "homeworkNotifyOnAssign" = COALESCE("homeworkNotifyOnAssign", true),
  "homeworkReminder24hEnabled" = COALESCE("homeworkReminder24hEnabled", true),
  "homeworkReminderMorningEnabled" = COALESCE("homeworkReminderMorningEnabled", true),
  "homeworkReminderMorningTime" = COALESCE("homeworkReminderMorningTime", '10:00'),
  "homeworkReminder3hEnabled" = COALESCE("homeworkReminder3hEnabled", false),
  "homeworkOverdueRemindersEnabled" = COALESCE("homeworkOverdueRemindersEnabled", true),
  "homeworkOverdueReminderTime" = COALESCE("homeworkOverdueReminderTime", '10:00'),
  "homeworkOverdueReminderMaxCount" = COALESCE("homeworkOverdueReminderMaxCount", 3)
WHERE
  "homeworkNotifyOnAssign" IS NULL
  OR "homeworkReminder24hEnabled" IS NULL
  OR "homeworkReminderMorningEnabled" IS NULL
  OR "homeworkReminderMorningTime" IS NULL
  OR "homeworkReminder3hEnabled" IS NULL
  OR "homeworkOverdueRemindersEnabled" IS NULL
  OR "homeworkOverdueReminderTime" IS NULL
  OR "homeworkOverdueReminderMaxCount" IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Teacher" WHERE "homeworkNotifyOnAssign" IS NULL) THEN
    ALTER TABLE "Teacher" ALTER COLUMN "homeworkNotifyOnAssign" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Teacher" WHERE "homeworkReminder24hEnabled" IS NULL) THEN
    ALTER TABLE "Teacher" ALTER COLUMN "homeworkReminder24hEnabled" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Teacher" WHERE "homeworkReminderMorningEnabled" IS NULL) THEN
    ALTER TABLE "Teacher" ALTER COLUMN "homeworkReminderMorningEnabled" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Teacher" WHERE "homeworkReminderMorningTime" IS NULL) THEN
    ALTER TABLE "Teacher" ALTER COLUMN "homeworkReminderMorningTime" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Teacher" WHERE "homeworkReminder3hEnabled" IS NULL) THEN
    ALTER TABLE "Teacher" ALTER COLUMN "homeworkReminder3hEnabled" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Teacher" WHERE "homeworkOverdueRemindersEnabled" IS NULL) THEN
    ALTER TABLE "Teacher" ALTER COLUMN "homeworkOverdueRemindersEnabled" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Teacher" WHERE "homeworkOverdueReminderTime" IS NULL) THEN
    ALTER TABLE "Teacher" ALTER COLUMN "homeworkOverdueReminderTime" SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM "Teacher" WHERE "homeworkOverdueReminderMaxCount" IS NULL) THEN
    ALTER TABLE "Teacher" ALTER COLUMN "homeworkOverdueReminderMaxCount" SET NOT NULL;
  END IF;
END $$;

-- Keep Student schema aligned with Homework V2 expectations.
ALTER TABLE "Student"
  ADD COLUMN IF NOT EXISTS "timezone" TEXT;
