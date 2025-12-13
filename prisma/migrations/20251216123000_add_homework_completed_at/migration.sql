-- Add completion timestamp for homework and backfill existing completed rows
ALTER TABLE "Homework" ADD COLUMN "completedAt" DATETIME;

UPDATE "Homework"
SET "completedAt" = COALESCE("updatedAt", CURRENT_TIMESTAMP)
WHERE ("status" = 'DONE' OR "isDone" = 1) AND "completedAt" IS NULL;
