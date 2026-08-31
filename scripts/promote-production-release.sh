#!/usr/bin/env bash
set -euo pipefail

VPS_ALIAS="${VPS_ALIAS:-vps}"
PRODUCTION_URL="${PRODUCTION_URL:-https://crm.iaparavendas.tech}"
RELEASE_SHA="${1:-}"
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ ! "${RELEASE_SHA}" =~ ^[0-9a-f]{40}$ ]]; then
  echo "usage: $0 <40-character-release-sha>" >&2
  exit 1
fi

# The runtime DATABASE_URL intentionally uses the application database role,
# which must not read Supabase's internal migration ledger. Verify that ledger
# from the operator machine using the authenticated Supabase CLI before the
# VPS can switch the release symlink.
verify_linked_schema_ledger() {
  local listing expected
  listing="$(cd "${REPO_ROOT}/apps/api" && npx supabase migration list)"
  expected="$(find "${REPO_ROOT}/apps/api/supabase/migrations" -maxdepth 1 -type f -name '*.sql' -exec basename {} \; | sed -E 's/^([0-9]{14})_.*/\1/' | sort)"
  printf '%s\n' "${listing}" | node -e '
    const fs = require("node:fs");
    const output = fs.readFileSync(0, "utf8");
    const expected = process.argv.slice(1);
    let remote;
    try {
      const parsed = JSON.parse(output);
      remote = new Map((parsed.migrations || []).map(({ local, remote }) => [local, remote]));
    } catch {
      const matches = [...output.matchAll(/`(\d{14})`\s*\|\s*`(\d{14})`/g)];
      remote = new Map(matches.map(([, local, applied]) => [local, applied]));
    }
    const missing = expected.filter((version) => remote.get(version) !== version);
    if (missing.length) {
      throw new Error(`Supabase migration ledger mismatch: ${missing.join(", ")}`);
    }
  ' ${expected}
  echo "[schema-gate] verified linked Supabase migration ledger"
}

verify_linked_schema_ledger

ssh "${VPS_ALIAS}" "bash -s -- '${RELEASE_SHA}' '${PRODUCTION_URL}'" <<'REMOTE_SCRIPT'
set -euo pipefail

release_sha="$1"
production_url="$2"
root="/opt/sos-sales"
release="${root}/releases/${release_sha}"
current="${root}/current"
previous="${root}/previous"

atomic_link() {
  local target="$1"
  local link="$2"
  local temporary="${link}.next.$$"
  ln -s "${target}" "${temporary}"
  mv -Tf "${temporary}" "${link}"
}

verify_active_release() {
  # Caddy may need to reopen HTTPS listeners after a release mount changes.
  # Keep the release candidate alive long enough for this expected warm-up,
  # while still restoring automatically on a persistent failure.
  curl --retry 20 --retry-delay 2 --retry-connrefused -fsS "${production_url}/health" >/dev/null || return 1
  curl --retry 20 --retry-delay 2 --retry-connrefused -fsS "${production_url}/ready" >/dev/null || return 1
}

recreate_active_release() {
  cd "${root}"
  SOS_SALES_RELEASE_ROOT="${current}" docker compose \
    -p sos-sales \
    --env-file .env.production \
    -f "${current}/docker-compose.yml" \
    up -d --no-deps --force-recreate sos-sales-api caddy || return 1
}

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

require_migration_gate() {
  local candidate="$1"
  test -f "${candidate}/scripts/verify-production-schema.mjs"
  find "${candidate}/api/supabase/migrations" -type f -name '*.sql' -print -quit | grep -q .
}

require_base_release "${release}"
require_migration_gate "${release}"

if [[ -L "${current}" ]]; then
  old_release="$(readlink -f "${current}")"
else
  old_release="${root}/releases/bootstrap-$(date -u +%Y%m%dT%H%M%SZ)"
  mkdir -p "${old_release}/web" "${old_release}/api" "${old_release}/certs"
  cp -a "${root}/dist" "${old_release}/web/dist"
  cp -a "${root}/api/dist" "${old_release}/api/dist"
  cp -a "${root}/api/node_modules" "${old_release}/api/node_modules"
  cp "${root}/api/package.json" "${old_release}/api/package.json"
  cp "${root}/api/production-runtime.mjs" "${old_release}/api/production-runtime.mjs"
  cp "${root}/certs/supabase-ca.crt" "${old_release}/certs/supabase-ca.crt"
  cp "${root}/docker-compose.yml" "${old_release}/docker-compose.yml"
fi

atomic_link "${old_release}" "${previous}"
require_base_release "${old_release}"
atomic_link "${release}" "${current}"

if ! recreate_active_release || ! verify_active_release; then
  atomic_link "${old_release}" "${current}"
  if ! recreate_active_release || ! verify_active_release; then
    echo "[promote] release and automatic restoration both failed; manual incident response required" >&2
    exit 2
  fi
  echo "[promote] health gate failed; previous release restored" >&2
  exit 1
fi

echo "[promote] release active: ${release_sha}"
REMOTE_SCRIPT
