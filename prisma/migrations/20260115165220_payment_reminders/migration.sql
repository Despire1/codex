-- Create enums
DO $$ BEGIN
  CREATE TYPE "LessonPaymentStatus" AS ENUM ('UNPAID', 'PAID');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "LessonPaidSource" AS ENUM ('NONE', 'BALANCE', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PaymentReminderSource" AS ENUM ('AUTO', 'MANUAL');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "NotificationChannel" AS ENUM ('TELEGRAM');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

-- Teacher settings
ALTER TABLE "Teacher"
  ADD COLUMN IF NOT EXISTS "autoConfirmLessons" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "globalPaymentRemindersEnabled" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS "paymentReminderDelayHours" INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS "paymentReminderRepeatHours" INTEGER NOT NULL DEFAULT 48,
  ADD COLUMN IF NOT EXISTS "paymentReminderMaxCount" INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS "notifyTeacherOnAutoPaymentReminder" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "notifyTeacherOnManualPaymentReminder" BOOLEAN NOT NULL DEFAULT true;

-- Student settings
ALTER TABLE "Student"
  ADD COLUMN IF NOT EXISTS "paymentRemindersEnabled" BOOLEAN NOT NULL DEFAULT true;

-- Lesson payment tracking
ALTER TABLE "Lesson"
  ADD COLUMN IF NOT EXISTS "paymentStatus" "LessonPaymentStatus" NOT NULL DEFAULT 'UNPAID',
  ADD COLUMN IF NOT EXISTS "paidSource" "LessonPaidSource" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "lastPaymentReminderAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paymentReminderCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "lastPaymentReminderSource" "PaymentReminderSource";

-- Notification log extensions
ALTER TABLE "NotificationLog"
  ADD COLUMN IF NOT EXISTS "source" "PaymentReminderSource",
  ADD COLUMN IF NOT EXISTS "channel" "NotificationChannel" NOT NULL DEFAULT 'TELEGRAM';

-- Backfill lesson payment status for existing data
UPDATE "Lesson"
SET "paymentStatus" = 'PAID'
WHERE "isPaid" = true;

UPDATE "Lesson"
SET "paidSource" = 'BALANCE'
WHERE EXISTS (
  SELECT 1
  FROM "PaymentEvent"
  WHERE "PaymentEvent"."lessonId" = "Lesson"."id"
    AND "PaymentEvent"."type" = 'AUTO_CHARGE'
);

UPDATE "Lesson"
SET "paidSource" = 'MANUAL'
WHERE "paymentStatus" = 'PAID'
  AND "paidSource" = 'NONE';

-- Notification log indexes
CREATE INDEX IF NOT EXISTS "NotificationLog_teacherId_createdAt_idx" ON "NotificationLog" ("teacherId", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationLog_studentId_createdAt_idx" ON "NotificationLog" ("studentId", "createdAt");
CREATE INDEX IF NOT EXISTS "NotificationLog_lessonId_createdAt_idx" ON "NotificationLog" ("lessonId", "createdAt");
