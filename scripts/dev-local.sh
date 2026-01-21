#!/usr/bin/env bash
set -euo pipefail

export LOCAL_AUTH_BYPASS="${LOCAL_AUTH_BYPASS:-true}"
export VITE_LOCAL_AUTH_BYPASS="${VITE_LOCAL_AUTH_BYPASS:-true}"

npm run prisma:migrate
npm run prisma:generate

npm run api &
api_pid=$!

npm run dev &
dev_pid=$!

cleanup() {
  kill "$api_pid" "$dev_pid" 2>/dev/null || true
}

trap cleanup EXIT
wait "$api_pid" "$dev_pid"
