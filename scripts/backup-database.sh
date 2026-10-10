#!/usr/bin/env bash
# ==============================================================================
# MCT OS v2.0 — Sovereign Database Backup Engine
# Automated, Compressed (gzip -9), and Encrypted (AES-256-CBC with PBKDF2)
# ==============================================================================

set -euo pipefail

ENV_FILE="${ENV_FILE:-/opt/chat-sales-v3/.env}"
BACKUP_DIR="${BACKUP_DIR:-/opt/sos-sales/backups/daily}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-sos-sales-postgres}"
DB_NAME="${DB_NAME:-sos_sales_v3}"
DB_USER="${DB_USER:-sos_migration_owner}"
RETENTION_DAYS="${RETENTION_DAYS:-7}"

log() {
  echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] $*"
}

if [[ ! -f "${ENV_FILE}" ]]; then
  log "ERROR: Environment file not found at ${ENV_FILE}"
  exit 1
fi

# Extract APP_MASTER_KEY from .env for AES-256 encryption
MASTER_KEY=$(grep -E '^APP_MASTER_KEY=' "${ENV_FILE}" | head -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r')

if [[ -z "${MASTER_KEY}" ]]; then
  log "ERROR: APP_MASTER_KEY is empty in ${ENV_FILE}"
  exit 1
fi

mkdir -p "${BACKUP_DIR}"
chmod 700 "${BACKUP_DIR}"

TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_RAW="${BACKUP_DIR}/sos_sales_v3_${TIMESTAMP}.sql.gz"
BACKUP_ENC="${BACKUP_RAW}.enc"

log "Starting database backup for ${DB_NAME} from container ${POSTGRES_CONTAINER}..."

# 1. Execute pg_dump, pipe through max compression
docker exec -i "${POSTGRES_CONTAINER}" pg_dump -U "${DB_USER}" -d "${DB_NAME}" --clean --if-exists | gzip -9 > "${BACKUP_RAW}"

if [[ ! -s "${BACKUP_RAW}" ]]; then
  log "ERROR: Raw backup file is empty: ${BACKUP_RAW}"
  rm -f "${BACKUP_RAW}"
  exit 1
fi

RAW_SIZE=$(du -h "${BACKUP_RAW}" | cut -f1)
log "Database dump completed (${RAW_SIZE}). Encrypting with AES-256-CBC..."

# 2. Encrypt with AES-256-CBC and PBKDF2 key derivation
openssl enc -aes-256-cbc -pbkdf2 -salt -in "${BACKUP_RAW}" -out "${BACKUP_ENC}" -pass "pass:${MASTER_KEY}"
chmod 600 "${BACKUP_ENC}"

# 3. Immediately shred/delete unencrypted raw dump
rm -f "${BACKUP_RAW}"

# 4. Integrity verification: decrypt and test gzip stream in-memory without saving to disk
log "Verifying backup stream integrity..."
if openssl enc -d -aes-256-cbc -pbkdf2 -in "${BACKUP_ENC}" -pass "pass:${MASTER_KEY}" | gunzip -t; then
  ENC_SIZE=$(du -h "${BACKUP_ENC}" | cut -f1)
  log "SUCCESS: Backup verified and encrypted successfully -> ${BACKUP_ENC} (${ENC_SIZE})"
else
  log "FATAL: Integrity verification failed for ${BACKUP_ENC}!"
  exit 1
fi

# 5. Purge backups older than RETENTION_DAYS
log "Purging local backups older than ${RETENTION_DAYS} days in ${BACKUP_DIR}..."
find "${BACKUP_DIR}" -name "sos_sales_v3_*.sql.gz.enc" -type f -mtime +"${RETENTION_DAYS}" -delete

log "Backup lifecycle completed successfully."
