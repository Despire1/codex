-- AlterTable
ALTER TABLE "Teacher" ADD COLUMN "dailySummaryEnabled" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Teacher" ADD COLUMN "dailySummaryTime" TEXT NOT NULL DEFAULT '09:00';
ALTER TABLE "Teacher" ADD COLUMN "tomorrowSummaryEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Teacher" ADD COLUMN "tomorrowSummaryTime" TEXT NOT NULL DEFAULT '20:00';
