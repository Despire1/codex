#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! -f "${ROOT_DIR}/.env" ]]; then
  echo "Не найден .env. Скопируйте .env.example: cp .env.example .env" >&2
  exit 1
fi

set -a
# shellcheck source=/dev/null
source "${ROOT_DIR}/.env"
set +a

if [[ -z "${TELEGRAM_TEST_BOT_TOKEN:-}" ]]; then
  echo "В .env не задан TELEGRAM_TEST_BOT_TOKEN (токен тестового бота)." >&2
  exit 1
fi

if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok не установлен. Установите ngrok и авторизуйте его: https://ngrok.com/download" >&2
  exit 1
fi

NGROK_LOG="${ROOT_DIR}/.ngrok.log"

cleanup() {
  if [[ -n "${NGROK_PID:-}" ]]; then
    kill "${NGROK_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${API_PID:-}" ]]; then
    kill "${API_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${DEV_PID:-}" ]]; then
    kill "${DEV_PID}" >/dev/null 2>&1 || true
  fi
  if [[ -n "${BOT_PID:-}" ]]; then
    kill "${BOT_PID}" >/dev/null 2>&1 || true
  fi
}
trap cleanup EXIT INT TERM

ngrok http 5173 --log=stdout >"${NGROK_LOG}" 2>&1 &
NGROK_PID=$!

get_ngrok_url() {
  curl -s http://127.0.0.1:4040/api/tunnels | node -e '
    const fs = require("fs");
    const data = JSON.parse(fs.readFileSync(0, "utf8"));
    const tunnel = data.tunnels.find((item) => item.proto === "https");
    if (!tunnel) process.exit(1);
    console.log(tunnel.public_url);
  '
}

echo "Ожидаю запуск ngrok..."
NGROK_URL=""
for _ in {1..20}; do
  if NGROK_URL="$(get_ngrok_url 2>/dev/null)"; then
    if [[ -n "${NGROK_URL}" ]]; then
      break
    fi
  fi
  sleep 0.5
done

if [[ -z "${NGROK_URL}" ]]; then
  echo "Не удалось получить ngrok URL. Проверьте ${NGROK_LOG}" >&2
  exit 1
fi

echo "ngrok URL: ${NGROK_URL}"

export TELEGRAM_BOT_TOKEN="${TELEGRAM_TEST_BOT_TOKEN}"
export TELEGRAM_WEBAPP_URL="${NGROK_URL}"
export APP_BASE_URL="${NGROK_URL}"

npm run api &
API_PID=$!

npm run dev &
DEV_PID=$!

npm run bot &
BOT_PID=$!

wait
