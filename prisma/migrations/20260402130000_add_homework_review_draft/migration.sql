-- Homework review draft storage (safe, additive)

ALTER TABLE "HomeworkSubmission"
  ADD COLUMN IF NOT EXISTS "reviewDraft" TEXT;
