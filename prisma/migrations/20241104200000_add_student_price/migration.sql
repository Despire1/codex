-- Add price per lesson to student
ALTER TABLE "Student" ADD COLUMN "pricePerLesson" INTEGER NOT NULL DEFAULT 0;
