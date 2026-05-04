-- AlterTable: Lesson — новые поля для расписания v2
ALTER TABLE "Lesson"
  ADD COLUMN "topic" TEXT,
  ADD COLUMN "format" TEXT,
  ADD COLUMN "notes" TEXT,
  ADD COLUMN "planItemsOverride" TEXT;

-- AlterTable: LessonSeries — план серии (наследуется уроками по умолчанию)
ALTER TABLE "LessonSeries"
  ADD COLUMN "planItems" TEXT NOT NULL DEFAULT '[]';

-- CreateTable: LessonAttachment — материалы прикреплённые к конкретному уроку
CREATE TABLE "LessonAttachment" (
  "id"        TEXT NOT NULL,
  "lessonId"  INTEGER NOT NULL,
  "fileName"  TEXT NOT NULL,
  "url"       TEXT NOT NULL,
  "size"      INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "LessonAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "LessonAttachment_lessonId_idx" ON "LessonAttachment"("lessonId");

ALTER TABLE "LessonAttachment"
  ADD CONSTRAINT "LessonAttachment_lessonId_fkey"
  FOREIGN KEY ("lessonId") REFERENCES "Lesson"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- Index: для автокомплита тем по студенту
CREATE INDEX "Lesson_teacherId_studentId_startAt_idx"
  ON "Lesson"("teacherId", "studentId", "startAt");
