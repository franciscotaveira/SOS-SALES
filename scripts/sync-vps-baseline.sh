#!/usr/bin/env bash
set -euo pipefail

VPS_ALIAS="${VPS_ALIAS:-vps}"
VPS_ROOT="${VPS_ROOT:-/opt/sos-sales}"
BASELINE_ID="${BASELINE_ID:-e773ec7}"
BASELINE_ROOT=".audit/vps-baseline-${BASELINE_ID}"

mkdir -p "${BASELINE_ROOT}/web" "${BASELINE_ROOT}/api/dist"

# Read-only pull. Deliberately excludes .env files, databases, sessions,
# provider media and other mutable production data.
rsync -az --delete "${VPS_ALIAS}:${VPS_ROOT}/dist/" "${BASELINE_ROOT}/web/"
rsync -az --delete "${VPS_ALIAS}:${VPS_ROOT}/api/dist/" "${BASELINE_ROOT}/api/dist/"
rsync -az \
  "${VPS_ALIAS}:${VPS_ROOT}/api/package.json" \
  "${VPS_ALIAS}:${VPS_ROOT}/api/package-lock.json" \
  "${VPS_ALIAS}:${VPS_ROOT}/api/production-runtime.mjs" \
  "${BASELINE_ROOT}/api/"

ssh "${VPS_ALIAS}" \
  "sha256sum '${VPS_ROOT}/dist/index.html' '${VPS_ROOT}/api/dist/index.js' '${VPS_ROOT}/api/dist/release-manifest.json'" \
  > "${BASELINE_ROOT}/SHA256SUMS.vps"

printf 'Baseline salvo em %s\n' "${BASELINE_ROOT}"
printf 'Nenhuma configuração, credencial ou informação de cliente foi copiada.\n'
