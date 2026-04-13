#!/usr/bin/env bash
set -euo pipefail

echo "[prisma-migrate-local] Checking migration status..."
if npx prisma migrate status >/dev/null 2>&1; then
  echo "[prisma-migrate-local] Database schema is up to date."
  exit 0
fi

echo "[prisma-migrate-local] Status check reported unapplied or broken migrations. Trying deploy..."
if npx prisma migrate deploy; then
  echo "[prisma-migrate-local] Migrations applied successfully."
  exit 0
fi

echo "[prisma-migrate-local] migrate deploy failed. Current status:" >&2
npx prisma migrate status
