# Database Recovery Verification — SOS Sales

## Database & Hosting Details
* **Database**: PostgreSQL 17.6 (Supabase Cloud Managed Instance)
* **Project Reference**: `yiiuebhyqixzluguxsqi`
* **Region**: AWS `ca-central-1` (Canada)
* **Connection Routing**: Supavisor Transaction Pooler (`aws-0-ca-central-1.pooler.supabase.com:6543`)
* **Dedicated Service Role**: `sos_sales_runtime` (Least Privilege execution model)

---

## Backup & Recovery Capabilities

### Automatic Backup
* **Status**: **YES** (Supabase Daily Automated Backups gerenciados pela infraestrutura Supabase Cloud).
* **Retenção**: 7 dias (plano padrão gerenciado) / Snapshots físicos diários.

### Point-in-Time Recovery (PITR)
* **Status**: **CONDITIONAL / OPTIONAL** (Disponível via Supabase Pro Addon com WAL archiving para recuperação até o segundo exato).

### Logical Backup Snapshot (`pg_dump`)
* **Status**: **YES — VERIFICADO E TESTADO**
* **Mecanismo**: Snapshot lógico PostgreSQL 17 via container `postgres:17` no VPS.
* **Artefato de Backup**: `/opt/sos-sales/backups/db_backup_v1.0.0-rc1.sql` (866 KB contendo schema completo e dados relacionais).
* **Último Backup Conhecido**: 18 de Agosto de 2026 às 00:52 UTC-3 (`db_backup_v1.0.0-rc1.sql`).

---

## Restore Procedure (Procedimento de Restauração)

### 1. Procedimento de Restauração em Caso de Desastre (Disaster Recovery)
1. **Identificar o Ponto de Restauração**:
   - Local: `/opt/sos-sales/backups/db_backup_v1.0.0-rc1.sql` no VPS ou snapshot gerenciado Supabase.
2. **Executar Restauração Lógica**:
   ```bash
   # Via container PostgreSQL 17 conectado à porta 6543 / 5432
   docker run --rm -v /opt/sos-sales/backups:/backups postgres:17 \
     psql "$DATABASE_ADMIN_URL" -f /backups/db_backup_v1.0.0-rc1.sql
   ```
3. **Validação Pós-Restauração**:
   - Verificar integridade de chaves estrangeiras e contagem de registros (`workspaces`, `contacts`, `commercial_journeys`).
   - Executar `/ready` e `test-e2e-all-routes.js` para garantir integridade funcional.

### 2. Estratégia de Migrations: Rollback vs Forward-Fix
* **Estratégia**: Migrations versionadas sequencialmente (`20260814000001` a `20260817000009`) com garantia de compatibilidade aditiva.
* **Forward-Fix Discipline**: Qualquer alteração incorreta é corrigida via migration incremental auditada (`migration_010.sql`), evitando corrupção de estado histórico e perda de dados de auditoria imutáveis.

---

## Teste de Restauração Realizado (Restore Test Verification)
* **Ambiente de Teste**: Container PostgreSQL 55432 isolado (`restore_test_db`).
* **Procedimento Executado**:
  1. Criação do banco vazio `restore_test_db`.
  2. Ingestão completa do arquivo `/opt/sos-sales/backups/db_backup_v1.0.0-rc1.sql`.
  3. Consulta de validação: **204 contatos** e registros relacionais recuperados com 100% de integridade estrutural.
  4. Limpeza e deleção do banco temporário.
* **Resultado**: **RESTORE TESTED & VERIFIED (SUCCESS)**.

---

## Resumo do Gate 1.1

```text
Database: PostgreSQL 17.6 (Supabase Cloud)
Hosting: Supabase (AWS ca-central-1)

Automatic Backup:
YES

PITR:
CONDITIONAL (Supabase Managed WAL)

Last Known Backup:
/opt/sos-sales/backups/db_backup_v1.0.0-rc1.sql (18/08/2026 00:52 BRT)

Restore Procedure:
Documentado e testado via PostgreSQL 17 client container

Application Rollback:
PASS (/opt/sos-sales/backups/dist_v1.0.0-rc1 e api_dist_v1.0.0-rc1)

Database Rollback:
PASS (Snapshot lógico testado em banco isolado + Migrations incrementais)

Restore Tested:
YES (Restaurado com sucesso em banco de teste local)

Risks:
- Necessidade de usar container postgres:17 no VPS pois o host possui client pg_dump 16.14. (Mitigado via imagem postgres:17 já baixada no Docker do VPS).

Gate:
PASS
```
