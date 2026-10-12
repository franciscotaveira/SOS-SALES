#!/usr/bin/env bash
# ==============================================================================
# MCT OS v2.0 — Sovereign Database Restore Engine
# Decrypts AES-256 backup and safely restores into PostgreSQL
# ==============================================================================

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Uso: $0 <caminho_para_backup.sql.gz.enc> [target_db_name]"
  echo "Exemplo: $0 /opt/sos-sales/backups/daily/sos_sales_v3_20261010_120000.sql.gz.enc sos_sales_v3"
  exit 1
fi

BACKUP_ENC="$1"
TARGET_DB="${2:-sos_sales_v3}"
ENV_FILE="${ENV_FILE:-/opt/chat-sales-v3/.env}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-sos-sales-postgres}"
DB_USER="${DB_USER:-sos_user}"

if [[ ! -f "${BACKUP_ENC}" ]]; then
  echo "Erro: Arquivo de backup não encontrado: ${BACKUP_ENC}"
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Erro: Arquivo .env não encontrado em ${ENV_FILE}"
  exit 1
fi

MASTER_KEY=$(grep -E '^APP_MASTER_KEY=' "${ENV_FILE}" | head -n 1 | cut -d '=' -f2- | tr -d '"' | tr -d "'" | tr -d '\r')

if [[ -z "${MASTER_KEY}" ]]; then
  echo "Erro: APP_MASTER_KEY não encontrada em ${ENV_FILE}"
  exit 1
fi

echo "=========================================================="
echo "MCT OS — RESTAURAÇÃO DE BANCO DE DADOS"
echo "Arquivo:   ${BACKUP_ENC}"
echo "Container: ${POSTGRES_CONTAINER}"
echo "Destino:   ${TARGET_DB}"
echo "=========================================================="
echo "AVISO: Esta operação irá sobrescrever dados no banco ${TARGET_DB}!"
read -p "Deseja prosseguir com a restauração? (digite 'CONFIRMAR'): " CONFIRMATION

if [[ "${CONFIRMATION}" != "CONFIRMAR" ]]; then
  echo "Operação cancelada pelo usuário."
  exit 0
fi

echo "Descriptografando e aplicando dump SQL diretamente no PostgreSQL..."
openssl enc -d -aes-256-cbc -pbkdf2 -in "${BACKUP_ENC}" -pass "pass:${MASTER_KEY}" \
  | gunzip \
  | docker exec -i "${POSTGRES_CONTAINER}" psql -U "${DB_USER}" -d "${TARGET_DB}"

echo "SUCESSO: Banco de dados ${TARGET_DB} restaurado com sucesso a partir de ${BACKUP_ENC}!"
