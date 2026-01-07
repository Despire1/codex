-- AlterTable
ALTER TABLE "TeacherStudent" ADD COLUMN "pricePerLesson" INTEGER NOT NULL DEFAULT 0;

-- Backfill link-specific price from student profile price
UPDATE "TeacherStudent"
SET "pricePerLesson" = (
  SELECT "pricePerLesson"
  FROM "Student"
  WHERE "Student"."id" = "TeacherStudent"."studentId"
)
WHERE "pricePerLesson" = 0;
