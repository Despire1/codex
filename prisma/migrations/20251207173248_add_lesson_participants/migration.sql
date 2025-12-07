/*
  # Add LessonParticipant table for group lessons support

  1. New Tables
    - `LessonParticipant`
      - `id` (integer, primary key, autoincrement)
      - `lessonId` (integer, foreign key to Lesson)
      - `studentId` (integer, foreign key to Student)
      - `price` (integer, price for this student for this lesson)
      - `isPaid` (boolean, payment status for this student)
      - `attended` (boolean nullable, attendance status - for future use)
      - `createdAt` (timestamp)

  2. Changes
    - Creates many-to-many relationship between Lesson and Student
    - Allows multiple students per lesson (group lessons)
    - Individual price and payment tracking per student per lesson

  3. Data Migration
    - Migrates existing lessons to new structure
    - Creates LessonParticipant records from existing Lesson.studentId and Lesson.isPaid
    - Sets price from Student.pricePerLesson for each migrated record

  4. Notes
    - Old fields (Lesson.studentId and Lesson.isPaid) are kept temporarily for backward compatibility
    - Will be removed in a future migration after testing
*/

-- CreateTable
CREATE TABLE "LessonParticipant" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "lessonId" INTEGER NOT NULL,
    "studentId" INTEGER NOT NULL,
    "price" INTEGER NOT NULL DEFAULT 0,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "attended" BOOLEAN,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "LessonParticipant_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "LessonParticipant_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "LessonParticipant_lessonId_idx" ON "LessonParticipant"("lessonId");

-- CreateIndex
CREATE INDEX "LessonParticipant_studentId_idx" ON "LessonParticipant"("studentId");

-- CreateIndex
CREATE UNIQUE INDEX "LessonParticipant_lessonId_studentId_key" ON "LessonParticipant"("lessonId", "studentId");

-- Migrate existing lesson data to LessonParticipant table
INSERT INTO "LessonParticipant" ("lessonId", "studentId", "price", "isPaid", "createdAt")
SELECT
    l.id as lessonId,
    l.studentId as studentId,
    COALESCE(s.pricePerLesson, 0) as price,
    l.isPaid as isPaid,
    l.createdAt as createdAt
FROM "Lesson" l
INNER JOIN "Student" s ON l.studentId = s.id;
