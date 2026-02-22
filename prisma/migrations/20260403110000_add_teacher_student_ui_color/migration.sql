-- AlterTable
ALTER TABLE "TeacherStudent" ADD COLUMN "uiColor" TEXT NOT NULL DEFAULT '#5A8DFF';

-- Backfill existing links with a distributed palette based on primary key.
UPDATE "TeacherStudent"
SET "uiColor" = CASE (("id" - 1) % 6)
  WHEN 0 THEN '#5A8DFF'
  WHEN 1 THEN '#3BAAFF'
  WHEN 2 THEN '#8B5CF6'
  WHEN 3 THEN '#F59E0B'
  WHEN 4 THEN '#22C55E'
  ELSE '#EF4444'
END;
