-- AlterTable
ALTER TABLE "PaymentEvent" ADD COLUMN "teacherId" BIGINT;

-- Backfill teacherId from lessons
UPDATE "PaymentEvent"
SET "teacherId" = (
  SELECT "teacherId"
  FROM "Lesson"
  WHERE "Lesson"."id" = "PaymentEvent"."lessonId"
)
WHERE "lessonId" IS NOT NULL;

-- Backfill teacherId from teacher-student link when unambiguous
UPDATE "PaymentEvent"
SET "teacherId" = (
  SELECT "teacherId"
  FROM "TeacherStudent"
  WHERE "TeacherStudent"."studentId" = "PaymentEvent"."studentId"
    AND "TeacherStudent"."isArchived" = false
  LIMIT 1
)
WHERE "lessonId" IS NULL
  AND "teacherId" IS NULL
  AND (
    SELECT COUNT(*)
    FROM "TeacherStudent"
    WHERE "TeacherStudent"."studentId" = "PaymentEvent"."studentId"
      AND "TeacherStudent"."isArchived" = false
  ) = 1;
