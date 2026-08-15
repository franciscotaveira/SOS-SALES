#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# SOS SALES — DATABASE BACKUP UTILITY (SUPABASE / POSTGRESQL)
# =============================================================================

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/sos_sales_backup_${TIMESTAMP}.dump"

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ Error: DATABASE_URL environment variable is required."
  exit 1
fi

mkdir -p "${BACKUP_DIR}"

echo "📦 Starting database backup to ${BACKUP_FILE}..."
pg_dump \
  --dbname="${DATABASE_URL}" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file="${BACKUP_FILE}"

echo "✅ Backup completed successfully: ${BACKUP_FILE}"
ls -lh "${BACKUP_FILE}"
