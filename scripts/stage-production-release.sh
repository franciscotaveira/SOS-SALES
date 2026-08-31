#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VPS_ALIAS="${VPS_ALIAS:-vps}"
RELEASE_SHA="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
REMOTE_ROOT="/opt/sos-sales"
REMOTE_STAGING="${REMOTE_ROOT}/releases/.staging-${RELEASE_SHA}"
REMOTE_RELEASE="${REMOTE_ROOT}/releases/${RELEASE_SHA}"

bash "${REPO_ROOT}/scripts/preflight-production-deploy.sh"

ssh "${VPS_ALIAS}" \
  "test ! -e '${REMOTE_RELEASE}' && test ! -e '${REMOTE_STAGING}' && mkdir -p '${REMOTE_STAGING}/web/dist' '${REMOTE_STAGING}/api/dist' '${REMOTE_STAGING}/api/supabase/migrations' '${REMOTE_STAGING}/certs' '${REMOTE_STAGING}/scripts'"

rsync -avz --delete "${REPO_ROOT}/dist/" "${VPS_ALIAS}:${REMOTE_STAGING}/web/dist/"
rsync -avz --delete "${REPO_ROOT}/apps/api/dist/" "${VPS_ALIAS}:${REMOTE_STAGING}/api/dist/"
rsync -avz "${REPO_ROOT}/apps/api/package.json" "${VPS_ALIAS}:${REMOTE_STAGING}/api/package.json"
rsync -avz "${REPO_ROOT}/apps/api/package-lock.json" "${VPS_ALIAS}:${REMOTE_STAGING}/api/package-lock.json"
rsync -avz "${REPO_ROOT}/apps/api/production-runtime.mjs" "${VPS_ALIAS}:${REMOTE_STAGING}/api/production-runtime.mjs"
rsync -avz --delete "${REPO_ROOT}/apps/api/supabase/migrations/" "${VPS_ALIAS}:${REMOTE_STAGING}/api/supabase/migrations/"
rsync -avz "${REPO_ROOT}/apps/api/supabase/config.toml" "${VPS_ALIAS}:${REMOTE_STAGING}/api/supabase/config.toml"
rsync -avz "${REPO_ROOT}/scripts/verify-production-schema.mjs" "${VPS_ALIAS}:${REMOTE_STAGING}/scripts/verify-production-schema.mjs"
rsync -avz "${REPO_ROOT}/scripts/PRODUCTION_MIGRATIONS_OPERATOR.md" "${VPS_ALIAS}:${REMOTE_STAGING}/scripts/PRODUCTION_MIGRATIONS_OPERATOR.md"
rsync -avz "${REPO_ROOT}/certs/supabase-ca.crt" "${VPS_ALIAS}:${REMOTE_STAGING}/certs/supabase-ca.crt"
rsync -avz "${REPO_ROOT}/deploy/docker-compose.prod.yml" "${VPS_ALIAS}:${REMOTE_STAGING}/docker-compose.yml"

ssh "${VPS_ALIAS}" \
  "cd '${REMOTE_ROOT}' && test -s .env.production && grep -Eq '^DATABASE_URL=[[:space:]]*[^[:space:]]' .env.production && grep -Eq '^META_VERIFY_TOKEN=[[:space:]]*[^[:space:]]' .env.production && grep -Eq '^META_APP_SECRET=[[:space:]]*[^[:space:]]' .env.production && grep -Eq '^WAHA_API_KEY=[[:space:]]*[^[:space:]]' .env.production && test -f '${REMOTE_STAGING}/api/package-lock.json' && (cd '${REMOTE_STAGING}/api' && npm ci --omit=dev --ignore-scripts) && find '${REMOTE_STAGING}/api/node_modules' -mindepth 1 -maxdepth 1 -print -quit | grep -q . && find '${REMOTE_STAGING}/api/supabase/migrations' -type f -name '*.sql' -print -quit | grep -q . && test -f '${REMOTE_STAGING}/api/supabase/config.toml' && test -f '${REMOTE_STAGING}/scripts/verify-production-schema.mjs' && test -f '${REMOTE_STAGING}/scripts/PRODUCTION_MIGRATIONS_OPERATOR.md' && chmod 0644 '${REMOTE_STAGING}/certs/supabase-ca.crt' && SOS_SALES_RELEASE_ROOT='${REMOTE_STAGING}' docker compose --env-file .env.production -f '${REMOTE_STAGING}/docker-compose.yml' config --quiet && mv '${REMOTE_STAGING}' '${REMOTE_RELEASE}'"

echo "[stage] immutable release ready: ${REMOTE_RELEASE}"
