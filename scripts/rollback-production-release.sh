#!/usr/bin/env bash
set -euo pipefail

VPS_ALIAS="${VPS_ALIAS:-vps}"
PRODUCTION_URL="${PRODUCTION_URL:-https://crm.iaparavendas.tech}"

ssh "${VPS_ALIAS}" 'bash -s' -- "${PRODUCTION_URL}" <<'REMOTE_SCRIPT'
set -euo pipefail

production_url="$1"
root="/opt/sos-sales"
current="${root}/current"
previous="${root}/previous"
test -L "${current}"
test -L "${previous}"

current_target="$(readlink -f "${current}")"
previous_target="$(readlink -f "${previous}")"

require_base_release() {
  local candidate="$1"
  for artifact in \
    "${candidate}/web/dist/index.html" \
    "${candidate}/api/dist/index.js" \
    "${candidate}/api/node_modules/.package-lock.json" \
    "${candidate}/api/package.json" \
    "${candidate}/api/production-runtime.mjs" \
    "${candidate}/certs/supabase-ca.crt" \
    "${candidate}/docker-compose.yml"; do
    test -f "${artifact}" || return 1
  done
}

require_base_release "${current_target}"
require_base_release "${previous_target}"
next_current="${current}.next.$$"
next_previous="${previous}.next.$$"

ln -s "${previous_target}" "${next_current}"
mv -Tf "${next_current}" "${current}"
ln -s "${current_target}" "${next_previous}"
mv -Tf "${next_previous}" "${previous}"

recreate_and_verify() {
  cd "${root}"
  SOS_SALES_RELEASE_ROOT="${current}" docker compose \
    --env-file .env.production \
    -f "${current}/docker-compose.yml" \
    up -d --no-deps --force-recreate sos-sales-api caddy || return 1
  curl --retry 6 --retry-delay 2 --retry-connrefused -fsS "${production_url}/health" >/dev/null || return 1
  curl --retry 6 --retry-delay 2 --retry-connrefused -fsS "${production_url}/ready" >/dev/null || return 1
}

if ! recreate_and_verify; then
  failed_target="$(readlink -f "${current}")"
  current_next="${current}.restore.$$"
  previous_next="${previous}.restore.$$"
  ln -s "${current_target}" "${current_next}"
  mv -Tf "${current_next}" "${current}"
  ln -s "${failed_target}" "${previous_next}"
  mv -Tf "${previous_next}" "${previous}"
  if ! recreate_and_verify; then
    echo "[rollback] rollback target and automatic restoration both failed; manual incident response required" >&2
    exit 2
  fi
  echo "[rollback] target failed; original release restored" >&2
  exit 1
fi

echo "[rollback] restored: ${previous_target}"
REMOTE_SCRIPT
