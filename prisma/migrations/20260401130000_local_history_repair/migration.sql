-- Local repair migration for drifted local DB state.
-- Safe/idempotent: no reset, no data loss.

-- 1) Payment.lessonId must be nullable.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'Payment'
      AND column_name = 'lessonId'
      AND is_nullable = 'NO'
  ) THEN
    ALTER TABLE "Payment" ALTER COLUMN "lessonId" DROP NOT NULL;
  END IF;
END $$;

-- 2) Ensure index exists on PaymentEvent.teacherId.
CREATE INDEX IF NOT EXISTS "PaymentEvent_teacherId_idx"
  ON "PaymentEvent" ("teacherId");

-- 3) Ensure onboarding columns exist on User.
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "onboardingTeacherCompleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "onboardingStudentCompleted" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "onboardingTeacherStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "onboardingStudentStartedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastOnboardingNudgeAt" TIMESTAMP(3);

-- 4) Drop legacy FK on HomeworkAssignment.legacyHomeworkId if present.
ALTER TABLE "HomeworkAssignment"
  DROP CONSTRAINT IF EXISTS "HomeworkAssignment_legacyHomeworkId_fkey";
