#!/usr/bin/env bash
set -euo pipefail

npm install
npm run build

npx pm2-runtime ecosystem.config.cjs
