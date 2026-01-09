-- AlterTable
ALTER TABLE "User" ADD COLUMN "termsAccepted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN "termsAcceptedAt" TIMESTAMP(3);
