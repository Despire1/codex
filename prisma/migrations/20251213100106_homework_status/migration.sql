/*
  Warnings:

  - Added the required column `updatedAt` to the `Homework` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Homework" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "text" TEXT NOT NULL,
    "deadline" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "studentId" INTEGER NOT NULL,
    "teacherId" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReminderAt" DATETIME,
    CONSTRAINT "Homework_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Homework_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("chatId") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Homework" ("createdAt", "deadline", "id", "isDone", "studentId", "teacherId", "text", "updatedAt")
SELECT "createdAt", "deadline", "id", "isDone", "studentId", "teacherId", "text", COALESCE("updatedAt", "createdAt", CURRENT_TIMESTAMP) FROM "Homework";
DROP TABLE "Homework";
ALTER TABLE "new_Homework" RENAME TO "Homework";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
