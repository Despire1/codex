-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "studentId" INTEGER NOT NULL,
    "lessonId" INTEGER,
    "type" TEXT NOT NULL,
    "lessonsDelta" INTEGER NOT NULL,
    "priceSnapshot" INTEGER NOT NULL,
    "moneyAmount" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdBy" TEXT NOT NULL,
    "reason" TEXT,
    CONSTRAINT "PaymentEvent_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "Student" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "PaymentEvent_lessonId_fkey" FOREIGN KEY ("lessonId") REFERENCES "Lesson" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PaymentEvent_studentId_idx" ON "PaymentEvent"("studentId");

-- CreateIndex
CREATE INDEX "PaymentEvent_lessonId_idx" ON "PaymentEvent"("lessonId");

-- CreateIndex
CREATE INDEX "PaymentEvent_createdAt_idx" ON "PaymentEvent"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentEvent_studentId_lessonId_type_key" ON "PaymentEvent"("studentId", "lessonId", "type");
