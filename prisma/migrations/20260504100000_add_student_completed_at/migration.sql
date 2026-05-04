-- Manual lifecycle status: COMPLETED is now driven by an explicit timestamp set by the teacher.
ALTER TABLE "TeacherStudent"
  ADD COLUMN "completedAt" TIMESTAMP(3);
