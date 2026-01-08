-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN "timezone" TEXT;
ALTER TABLE "Teacher" ADD COLUMN "lessonReminderEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Teacher" ADD COLUMN "lessonReminderMinutes" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "Teacher" ADD COLUMN "unpaidReminderEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Teacher" ADD COLUMN "unpaidReminderFrequency" TEXT NOT NULL DEFAULT 'daily';
ALTER TABLE "Teacher" ADD COLUMN "unpaidReminderTime" TEXT NOT NULL DEFAULT '10:00';
ALTER TABLE "Teacher" ADD COLUMN "studentNotificationsEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Teacher" ADD COLUMN "studentPaymentRemindersEnabled" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Teacher"
SET "lessonReminderMinutes" = "reminderMinutesBefore"
WHERE "lessonReminderMinutes" IS NULL OR "lessonReminderMinutes" = 30;
