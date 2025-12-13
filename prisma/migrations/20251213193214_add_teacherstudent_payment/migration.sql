/*
  Warnings:

  - You are about to drop the column `studentId` on the `Payment` table. All the data in the column will be lost.
  - You are about to drop the column `teacherId` on the `Payment` table. All the data in the column will be lost.
  - Added the required column `teacherStudentId` to the `Payment` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Payment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "teacherStudentId" INTEGER NOT NULL,
    "lessonId" INTEGER,
    "amount" INTEGER NOT NULL,
    "paidAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "comment" TEXT,
    CONSTRAINT "Payment_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_teacherStudentId_fkey" FOREIGN KEY ("teacherStudentId") REFERENCES "TeacherStudent" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Payment" ("id", "teacherStudentId", "lessonId", "amount", "paidAt", "comment")
SELECT p."id", ts."id", p."lessonId", p."amount", p."paidAt", p."comment"
FROM "Payment" p
LEFT JOIN "TeacherStudent" ts ON ts."teacherId" = p."teacherId" AND ts."studentId" = p."studentId";
DROP TABLE "Payment";
ALTER TABLE "new_Payment" RENAME TO "Payment";
CREATE INDEX "Payment_teacherStudentId_idx" ON "Payment"("teacherStudentId");
CREATE INDEX "Payment_lessonId_idx" ON "Payment"("lessonId");
CREATE UNIQUE INDEX "Payment_teacherStudentId_lessonId_key" ON "Payment"("teacherStudentId", "lessonId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
