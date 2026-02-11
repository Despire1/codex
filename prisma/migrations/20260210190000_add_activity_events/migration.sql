CREATE TABLE IF NOT EXISTS "ActivityEvent" (
  "id" SERIAL PRIMARY KEY,
  "teacherId" BIGINT NOT NULL,
  "studentId" INTEGER,
  "lessonId" INTEGER,
  "homeworkId" INTEGER,
  "category" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "details" TEXT,
  "payload" TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "dedupeKey" TEXT,
  CONSTRAINT "ActivityEvent_teacherId_fkey"
    FOREIGN KEY ("teacherId") REFERENCES "Teacher" ("chatId") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ActivityEvent_studentId_fkey"
    FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ActivityEvent_lessonId_fkey"
    FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ActivityEvent_homeworkId_fkey"
    FOREIGN KEY ("homeworkId") REFERENCES "Homework" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ActivityEvent_dedupeKey_key" ON "ActivityEvent" ("dedupeKey");
CREATE INDEX IF NOT EXISTS "ActivityEvent_teacherId_occurredAt_idx" ON "ActivityEvent" ("teacherId", "occurredAt");
CREATE INDEX IF NOT EXISTS "ActivityEvent_teacherId_category_occurredAt_idx" ON "ActivityEvent" ("teacherId", "category", "occurredAt");
CREATE INDEX IF NOT EXISTS "ActivityEvent_teacherId_studentId_occurredAt_idx" ON "ActivityEvent" ("teacherId", "studentId", "occurredAt");
