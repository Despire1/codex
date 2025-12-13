-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Homework" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "text" TEXT NOT NULL,
    "deadline" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'DRAFT' CHECK ("status" IN ('DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'DONE')),
    "isDone" BOOLEAN NOT NULL DEFAULT false,
    "attachments" TEXT NOT NULL DEFAULT '[]',
    "timeSpentMinutes" INTEGER,
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
INSERT INTO "new_Homework" (
    "id", "text", "deadline", "status", "isDone", "attachments", "timeSpentMinutes", "takenAt", "takenByStudentId", "studentId", "teacherId", "createdAt", "updatedAt", "lastReminderAt"
)
SELECT
    "id",
    "text",
    "deadline",
    CASE
        WHEN upper(coalesce("status", '')) IN ('DRAFT', 'ASSIGNED', 'IN_PROGRESS', 'DONE') THEN upper(coalesce("status", 'DRAFT'))
        ELSE 'DRAFT'
    END,
    "isDone",
    "attachments",
    NULL AS "timeSpentMinutes",
    "takenAt",
    "takenByStudentId",
    "studentId",
    "teacherId",
    "createdAt",
    "updatedAt",
    "lastReminderAt"
FROM "Homework";
DROP TABLE "Homework";
ALTER TABLE "new_Homework" RENAME TO "Homework";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
