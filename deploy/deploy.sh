#!/usr/bin/env bash
# Builds everything from the current checkout and restarts the API. Run it again after every `git pull`.
set -euo pipefail
cd "$(dirname "$0")/.."

# The first image build spends several minutes compressing the Lean toolchain at "exporting layers". It is not stuck.
docker compose -f docker/compose.yaml build lean
docker compose -f docker/compose.yaml run --rm lean lake build

(cd apps/web && npm ci && npm run build)
rm -rf /var/www/tactile/*
cp -r apps/web/dist/. /var/www/tactile/

sudo systemctl restart tactile-api
curl -fsS --retry 10 --retry-connrefused --retry-delay 1 http://127.0.0.1:3001/healthz
echo
echo "Deployed."
