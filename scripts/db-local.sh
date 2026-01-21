#!/usr/bin/env bash
set -euo pipefail

container_name="${DB_CONTAINER_NAME:-teacherbot-db}"
db_name="${POSTGRES_DB:-teacherbot}"
db_user="${POSTGRES_USER:-teacherbot_user}"
db_password="${POSTGRES_PASSWORD:-teacherbot_pass}"
db_port="${POSTGRES_PORT:-5432}"

if docker ps -a --format '{{.Names}}' | grep -q "^${container_name}$"; then
  docker start "${container_name}"
else
  docker run -d \
    --name "${container_name}" \
    -e POSTGRES_DB="${db_name}" \
    -e POSTGRES_USER="${db_user}" \
    -e POSTGRES_PASSWORD="${db_password}" \
    -p "${db_port}:5432" \
    -v "${container_name}-data:/var/lib/postgresql/data" \
    postgres:15
fi
