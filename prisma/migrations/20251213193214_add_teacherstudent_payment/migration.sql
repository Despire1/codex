/*
  Warnings:

  - You are about to drop the column `studentId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `teacherId` on the `Payment` table. All the data in the column will be lost.
  - Added the required column `teacherStudentId` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
ALTER TABLE "Payment" ADD COLUMN "teacherStudentId" INTEGER;

UPDATE "Payment"
SET "teacherStudentId" = "TeacherStudent"."id"
FROM "TeacherStudent"
WHERE "TeacherStudent"."teacherId" = "Payment"."teacherId"
  AND "TeacherStudent"."studentId" = "Payment"."studentId";

ALTER TABLE "Payment" ALTER COLUMN "teacherStudentId" SET NOT NULL;

ALTER TABLE "Payment" DROP CONSTRAINT "Payment_studentId_fkey";
ALTER TABLE "Payment" DROP CONSTRAINT "Payment_teacherId_fkey";
DROP INDEX "Payment_studentId_idx";
DROP INDEX "Payment_teacherId_idx";
DROP INDEX "Payment_lessonId_studentId_key";

ALTER TABLE "Payment" DROP COLUMN "studentId";
ALTER TABLE "Payment" DROP COLUMN "teacherId";

ALTER TABLE "Payment"
ADD CONSTRAINT "Payment_teacherStudentId_fkey"
FOREIGN KEY ("teacherStudentId") REFERENCES "TeacherStudent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX "Payment_teacherStudentId_idx" ON "Payment"("teacherStudentId");
CREATE UNIQUE INDEX "Payment_teacherStudentId_lessonId_key" ON "Payment"("teacherStudentId", "lessonId");
