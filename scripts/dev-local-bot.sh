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

pids=("$api_pid" "$dev_pid")

if [[ -n "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  npm run bot &
  bot_pid=$!
  pids+=("$bot_pid")
else
  echo "TELEGRAM_BOT_TOKEN is empty; skipping bot startup." >&2
fi

cleanup() {
  kill "${pids[@]}" 2>/dev/null || true
}

trap cleanup EXIT
wait "${pids[@]}"
