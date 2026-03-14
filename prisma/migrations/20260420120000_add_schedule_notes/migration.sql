-- CreateTable
CREATE TABLE "ScheduleNote" (
  "id" SERIAL NOT NULL,
  "teacherId" BIGINT NOT NULL,
  "dateKey" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "ScheduleNote_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ScheduleNote"
ADD CONSTRAINT "ScheduleNote_teacherId_fkey"
FOREIGN KEY ("teacherId") REFERENCES "Teacher"("chatId")
ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "ScheduleNote_teacherId_dateKey_idx" ON "ScheduleNote"("teacherId", "dateKey");

-- CreateIndex
CREATE INDEX "ScheduleNote_teacherId_updatedAt_idx" ON "ScheduleNote"("teacherId", "updatedAt");
