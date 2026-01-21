ALTER TABLE IF EXISTS "User"
ADD COLUMN "onboardingTeacherCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "onboardingStudentCompleted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "onboardingTeacherStartedAt" TIMESTAMP(3),
ADD COLUMN "onboardingStudentStartedAt" TIMESTAMP(3),
ADD COLUMN "lastOnboardingNudgeAt" TIMESTAMP(3);
