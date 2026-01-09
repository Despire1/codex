#!/usr/bin/env bash
set -euo pipefail

cleanup() {
  local status=$?
  if [[ -n "${pids:-}" ]]; then
    kill ${pids} 2>/dev/null || true
  fi
  exit "$status"
}

trap cleanup INT TERM EXIT

npm install

npm run api &
api_pid=$!

npm run bot &
bot_pid=$!

npm run dev &
dev_pid=$!

pids="${api_pid} ${bot_pid} ${dev_pid}"

wait ${pids}
