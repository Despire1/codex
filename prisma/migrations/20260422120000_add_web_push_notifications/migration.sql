DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_enum e ON t.oid = e.enumtypid
    WHERE t.typname = 'NotificationChannel'
      AND e.enumlabel = 'PWA_PUSH'
  ) THEN
    ALTER TYPE "NotificationChannel" ADD VALUE 'PWA_PUSH';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "WebPushSubscription" (
  "id" SERIAL PRIMARY KEY,
  "userId" INTEGER NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "routeMode" TEXT NOT NULL DEFAULT 'history',
  "userAgent" TEXT,
  "lastSuccessAt" TIMESTAMP(3),
  "lastErrorAt" TIMESTAMP(3),
  "lastErrorText" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WebPushSubscription_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "WebPushSubscription_endpoint_key"
  ON "WebPushSubscription"("endpoint");

CREATE INDEX IF NOT EXISTS "WebPushSubscription_userId_idx"
  ON "WebPushSubscription"("userId");
