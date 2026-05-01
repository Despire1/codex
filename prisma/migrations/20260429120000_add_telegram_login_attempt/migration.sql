-- CreateTable
CREATE TABLE "TelegramLoginAttempt" (
    "id" SERIAL NOT NULL,
    "nonce" TEXT NOT NULL,
    "secretHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "telegramUserId" BIGINT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "consumedAt" TIMESTAMP(3),

    CONSTRAINT "TelegramLoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramLoginAttempt_nonce_key" ON "TelegramLoginAttempt"("nonce");

-- CreateIndex
CREATE INDEX "TelegramLoginAttempt_expiresAt_idx" ON "TelegramLoginAttempt"("expiresAt");

-- CreateIndex
CREATE INDEX "TelegramLoginAttempt_status_idx" ON "TelegramLoginAttempt"("status");
