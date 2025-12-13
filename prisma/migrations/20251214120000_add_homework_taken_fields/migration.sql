-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Homework" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "text" TEXT NOT NULL,
    "deadline" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "attachments" TEXT NOT NULL DEFAULT '[]',
    "takenAt" DATETIME,
    "takenByStudentId" INTEGER,
    "studentId" INTEGER NOT NULL,
    "teacherId" BIGINT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReminderAt" DATETIME,
    CONSTRAINT "Homework_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Homework_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("chatId") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Homework_takenByStudentId_fkey" FOREIGN KEY ("takenByStudentId") REFERENCES "Student" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Homework" ("attachments", "createdAt", "deadline", "id", "isDone", "lastReminderAt", "status", "studentId", "teacherId", "text", "updatedAt", "takenAt", "takenByStudentId")
SELECT "attachments", "createdAt", "deadline", "id", "isDone", "lastReminderAt", "status", "studentId", "teacherId", "text", "updatedAt", NULL AS "takenAt", NULL AS "takenByStudentId"
FROM "Homework";
DROP TABLE "Homework";
ALTER TABLE "new_Homework" RENAME TO "Homework";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
