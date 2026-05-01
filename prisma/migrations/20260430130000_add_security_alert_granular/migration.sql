-- AlterTable
ALTER TABLE "User"
  ADD COLUMN "securityAlertNewDevice" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "securityAlertLogout" BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN "securityAlertSessionRevoke" BOOLEAN NOT NULL DEFAULT true;
