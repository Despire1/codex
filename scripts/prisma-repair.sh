#!/usr/bin/env bash
set -euo pipefail

# Remove stale local migrations from older branches (например add_student_price)
# and reset the local SQLite DB so Prisma can reapply the tracked migrations.
echo "[prisma-repair] Cleaning stale local migrations and DB file..."
find prisma/migrations -mindepth 1 -maxdepth 1 -type d -name '*add_student_price*' -print -exec rm -rf {} +
rm -f prisma/teacherbot.db

# Reapply migrations from the repository and regenerate the client.
echo "[prisma-repair] Reapplying migrations..."
npm run prisma:migrate

echo "[prisma-repair] Regenerating Prisma client..."
npm run prisma:generate

echo "[prisma-repair] Done. You can now rerun the API (npm run api)."
