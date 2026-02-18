ALTER TABLE "Teacher"
  ADD COLUMN IF NOT EXISTS "activityFeedSeenAt" TIMESTAMP(3);

UPDATE "Teacher"
SET "activityFeedSeenAt" = NOW()
WHERE "activityFeedSeenAt" IS NULL;
