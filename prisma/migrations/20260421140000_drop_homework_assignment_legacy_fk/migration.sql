-- Drop legacy FK for HomeworkAssignment.legacyHomeworkId.
-- This field is modeled as a scalar-only legacy reference in schema.prisma.
-- The migration is idempotent so it is safe on databases where the FK was
-- already removed by a local repair or manual correction.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'HomeworkAssignment_legacyHomeworkId_fkey'
  ) THEN
    ALTER TABLE "HomeworkAssignment"
      DROP CONSTRAINT "HomeworkAssignment_legacyHomeworkId_fkey";
  END IF;
END $$;
