-- Add recurrence grouping and weekday tracking to lessons
ALTER TABLE "Lesson" ADD COLUMN "recurrenceGroupId" TEXT;
ALTER TABLE "Lesson" ADD COLUMN "recurrenceWeekdays" TEXT;
