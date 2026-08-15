#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# SOS SALES — DATABASE RESTORE UTILITY (SUPABASE / POSTGRESQL)
# =============================================================================

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <path_to_backup_file.dump>"
  exit 1
fi

BACKUP_FILE="$1"

if [ ! -f "${BACKUP_FILE}" ]; then
  echo "❌ Error: File not found: ${BACKUP_FILE}"
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "❌ Error: DATABASE_URL environment variable is required."
  exit 1
fi

echo "⚠️  WARNING: You are about to restore database from: ${BACKUP_FILE}"
read -p "Are you sure you want to proceed? (yes/no): " CONFIRM
if [ "${CONFIRM}" != "yes" ]; then
  echo "Aborted."
  exit 0
fi

echo "🔄 Restoring database..."
pg_restore \
  --dbname="${DATABASE_URL}" \
  --clean \
  --if-exists \
  --no-owner \
  --no-privileges \
  "${BACKUP_FILE}"

echo "✅ Database restore completed successfully."
