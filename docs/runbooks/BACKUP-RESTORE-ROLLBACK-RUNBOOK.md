# Runbook Operacional: Backup, Restore, Rollback e Recuperação de Falhas

> **SOS Sales v3 — MCT LTDA**  
> **Classificação:** Operação Crítica / Governança Soberana  
> **Filosofia:** *Poder invisível, simplicidade visível. Truth in Data.*

---

## 1. Visão Geral da Arquitetura de Persistência e Filas

A stack operacional SOS Sales v3 opera com os seguintes componentes de estado:

1. **PostgreSQL 16 (`sos-v3-postgres`):**
   - Porta externa local: `55440` (porta interna: `5432`).
   - Esquema multi-tenant isolado por `workspace_id` sob **FORCE ROW LEVEL SECURITY (RLS)**.
   - Tabelas imutáveis de trilha de auditoria (`audit_events`) e transacionais outbox (`outbound_commands`, `conversions_outbox`).
   - Usuário de migração: `sos_migration_owner`.
   - Usuário de aplicação: `sos_app_user`.
   - Usuário de worker: `sos_worker_user`.
   - Usuário de webhook ingress: `sos_ingress_user`.

2. **Redis 7 (`sos-v3-redis`):**
   - Porta externa local: `6389` (porta interna: `6379`).
   - Cache volátil, rate limiting por IP/tenant e chaves de lock distribuído.
   - Estado recuperável: nenhuma persistência de negócio reside exclusivamente no Redis.

3. **Workers Node.js (`apps/worker`):**
   - Consumo transacional com leases de concorrência (`SKIP LOCKED`, `lease_until`, `worker_id`, `lease_token`).
   - Sem retransmissão cega em caso de timeout de lease: transição obrigatória para `reconciliation_required`.

---

## 2. Procedimentos de Backup e Snapshot

### 2.1 Backup Lógico Completo (pg_dump com todos os esquemas e RLS)

Para gerar uma cópia consistente e autocontida de todos os tenants:

```bash
# Executado a partir do host para o container PostgreSQL ativo
docker exec -t sos-v3-postgres pg_dump \
  -U sos_migration_owner \
  -d sos_sales_v3 \
  --format=custom \
  --no-owner \
  --no-privileges \
  --file=/tmp/sos_sales_v3_backup_$(date +%Y%m%d_%H%M%S).dump

# Copiar o arquivo de dump para o storage seguro do host
docker cp sos-v3-postgres:/tmp/sos_sales_v3_backup_*.dump ./backups/
```

### 2.2 Backup Físico e Snapshot de Volume Docker

O volume `sos_v3_postgres_data` contém os blocos físicos do cluster PostgreSQL.

```bash
# Criar snapshot consistente em repouso (ou via fs-freeze)
docker run --rm \
  --volumes-from sos-v3-postgres \
  -v $(pwd)/backups:/backup \
  alpine tar czf /backup/postgres_volume_$(date +%Y%m%d_%H%M%S).tar.gz /var/lib/postgresql/data
```

---

## 3. Procedimento de Restauração (Restore) e Teste Sintético

### 3.1 Restauração em Banco Isolado de Laboratório

Nunca restaurar diretamente sobre a base de produção ativa sem pré-validação em banco descartável.

```bash
# 1. Criar banco temporário de validação
docker exec -i sos-v3-postgres psql -U sos_migration_owner -d postgres -c \
  "CREATE DATABASE sos_sales_v3_restore_drill;"

# 2. Restaurar dump customizado
docker exec -i sos-v3-postgres pg_restore \
  -U sos_migration_owner \
  -d sos_sales_v3_restore_drill \
  /tmp/sos_sales_v3_backup.dump

# 3. Executar dry-run de sanidade e integridade RLS
pnpm tsx scripts/migration-v2-to-v3-dryrun.ts --database sos_sales_v3_restore_drill

# 4. Descartar banco de validação após conformidade comprovada
docker exec -i sos-v3-postgres psql -U sos_migration_owner -d postgres -c \
  "DROP DATABASE sos_sales_v3_restore_drill;"
```

---

## 4. Estratégia de Rollback: Por Tráfego e Flags (Sem Down Migrations Destrutivas)

### 4.1 Princípio de Expansão e Contração

De acordo com o `docs/project/RELEASE_STRATEGY.md`:
- **V2 e V3 coexistem; cutover é por workspace.**
- **Rollback acontece por chaveamento de tráfego e feature flags, nunca por rollback destrutivo de DDL (`DROP TABLE`).**
- Esquemas de banco são sempre aditivos (expand → backfill → cutover → contract).

### 4.2 Procedimento Imediato de Rollback por Tenant (SLA < 15 minutos)

Se uma anomalia for detectada em um workspace específico durante a transição:

1. **Desativar canal no V3 (evitar processamento concorrente):**
   ```bash
   # Chamar endpoint de revogação de canal via API autenticada
   curl -X POST http://127.0.0.1:3000/v1/workspaces/${WORKSPACE_ID}/channels/${CHANNEL_ID}/revoke \
     -H "Authorization: Bearer ${ADMIN_TOKEN}"
   ```

2. **Drenar e reconciliar comandos pendentes na outbox:**
   - Comandos com `reconciliation_required` devem ser conferidos pelo operador via interface ou endpoint `/reconcile`.
   - Nenhuma mensagem é descartada silenciosamente.

3. **Reapontar Webhooks para o runtime estável (V2):**
   - Atualizar a URL do webhook no provedor (WABA / WAHA) para o endpoint anterior.
   - Nenhuma perda de mensagem ocorre, pois o provedor WhatsApp retém mensagens não entregues por até 24 horas com retry exponencial.

4. **Flush do Cache de Locks no Redis:**
   ```bash
   docker exec -it sos-v3-redis redis-cli FLUSHDB
   ```

---

## 5. Recuperação de Falhas Operacionais do Worker e Outbox

### 5.1 Queda Abrupta do Processo Worker (SIGKILL / OOM / Host Crash)

Quando um worker morre no meio da execução:
1. O comando outbox fica com `status = 'processing'` e `lease_until` no passado.
2. O próximo worker que executa `reclaimExpiredLeases`:
   - Detecta o lease vencido.
   - **NÃO incrementa retry nem reenvia cegamente ao provedor** (prevenção de duplicidade física de mensagens no WhatsApp).
   - Transiciona o comando imediatamente para `status = 'reconciliation_required'`.
   - Registra log de erro: `ERR_LEASE_EXPIRED_DURING_PROCESSING`.
3. O operador ou serviço de reconciliação consulta o provedor externo com o idempotency key e atualiza o estado para `sent` ou `failed`.

### 5.2 Recuperação de Despachos CAPI Pendentes

1. As conversões CAPI são registradas em `conversions_outbox`.
2. Em caso de indisponibilidade da Meta Graph API (5xx ou timeout):
   - O worker aplica backoff exponencial com jitter.
   - Quando `retry_count < max_retries`, o status é marcado como `retry_scheduled`.
   - Se `retry_count >= max_retries`, o status é marcado como `dead_letter`, preservando o payload completo para inspeção.

---

## 6. Checklist de Validação Pré-Operação (Gates de Entrada)

- [ ] Todas as 21 migrations aplicadas com sucesso (`001` a `021`).
- [ ] RLS ativo e forçado (`FORCE ROW LEVEL SECURITY`) em todas as tabelas de tenant.
- [ ] Privilégios mínimos verificados (`sos_app_user` e `sos_worker_user` sem DELETE).
- [ ] Testes de isolamento multi-tenant verdes (`pnpm test:db:run`).
- [ ] Dry-run de migração V2->V3 sem divergências (`scripts/migration-v2-to-v3-dryrun.ts`).
- [ ] Verificação de portas Docker limitadas estritamente a `127.0.0.1`.
- [ ] Volumes isolados sem compartilhamento de arquivos com a stack anterior.
