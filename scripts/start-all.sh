#!/usr/bin/env bash
set -euo pipefail

npm install

npx pm2-runtime ecosystem.config.cjs
