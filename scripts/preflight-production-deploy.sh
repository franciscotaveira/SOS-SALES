#!/usr/bin/env bash
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
EXPECTED_CA_FINGERPRINT="80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA"

required_artifacts=(
  "dist/index.html"
  "apps/api/dist/index.js"
  "apps/api/dist/release-manifest.json"
  "apps/api/production-runtime.mjs"
  "apps/api/package.json"
  "apps/api/node_modules/.package-lock.json"
  "docker-compose.prod.yml"
  "deploy/docker-compose.prod.yml"
  "certs/supabase-ca.crt"
)

for artifact in "${required_artifacts[@]}"; do
  if [[ ! -f "${REPO_ROOT}/${artifact}" ]]; then
    echo "[preflight] missing required artifact: ${artifact}" >&2
    exit 1
  fi
done

actual_fingerprint="$(
  openssl x509 \
    -in "${REPO_ROOT}/certs/supabase-ca.crt" \
    -noout \
    -fingerprint \
    -sha256 \
    | cut -d= -f2
)"

if [[ "${actual_fingerprint}" != "${EXPECTED_CA_FINGERPRINT}" ]]; then
  echo "[preflight] Supabase CA fingerprint mismatch" >&2
  exit 1
fi

if ! openssl x509 -checkend 604800 -noout -in "${REPO_ROOT}/certs/supabase-ca.crt"; then
  echo "[preflight] Supabase CA expires in less than seven days" >&2
  exit 1
fi

manifest_commit="$(node -p "JSON.parse(require('fs').readFileSync('${REPO_ROOT}/apps/api/dist/release-manifest.json', 'utf8')).commitSha")"
current_commit="$(git -C "${REPO_ROOT}" rev-parse HEAD)"
if [[ "${manifest_commit}" != "${current_commit}" ]]; then
  echo "[preflight] API manifest commit ${manifest_commit} does not match HEAD ${current_commit}" >&2
  exit 1
fi

WAHA_API_KEY=preflight-only SOS_SALES_ENV_FILE=/dev/null docker compose \
  -f "${REPO_ROOT}/deploy/docker-compose.prod.yml" \
  config --quiet

WAHA_API_KEY=preflight-only \
WAHA_WEBHOOK_SECRET=preflight-only \
META_VERIFY_TOKEN=preflight-only \
META_APP_SECRET=preflight-only \
SOS_SALES_ENV_FILE=/dev/null \
docker compose -f "${REPO_ROOT}/docker-compose.prod.yml" config --quiet

if ! WAHA_API_KEY=preflight-only SOS_SALES_ENV_FILE=/dev/null docker compose \
  -f "${REPO_ROOT}/deploy/docker-compose.prod.yml" \
  config | grep -F 'SOS_SALES_RUNTIME_FACTORY: /app/production-runtime.mjs' >/dev/null; then
  echo "[preflight] production runtime factory is missing from canonical compose" >&2
  exit 1
fi

echo "[preflight] production artifacts, release manifest, compose, and Supabase CA are valid"
