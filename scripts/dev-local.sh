#!/usr/bin/env bash
set -euo pipefail

export LOCAL_AUTH_BYPASS="${LOCAL_AUTH_BYPASS:-true}"
export VITE_LOCAL_AUTH_BYPASS="${VITE_LOCAL_AUTH_BYPASS:-true}"
api_port="${API_PORT:-4000}"

npm run prisma:migrate
npm run prisma:generate

npm run api &
api_pid=$!

wait_for_port() {
  local host="$1"
  local port="$2"
  local retries="${3:-30}"
  local delay="${4:-1}"
  local attempt=1

  while ! (echo > "/dev/tcp/${host}/${port}") >/dev/null 2>&1; do
    if [[ "$attempt" -ge "$retries" ]]; then
      echo "API is not reachable on ${host}:${port} after ${retries} attempts." >&2
      return 1
    fi
    attempt=$((attempt + 1))
    sleep "$delay"
  done
}

wait_for_port "127.0.0.1" "$api_port"

npm run dev &
dev_pid=$!

cleanup() {
  kill "$api_pid" "$dev_pid" 2>/dev/null || true
}

trap cleanup EXIT
wait "$api_pid" "$dev_pid"
