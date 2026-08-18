# Test Integrity Audit — SOS Sales

## Objetivo do Gate 2.1
Auditar todas as modificações realizadas nos arquivos de teste durante o ciclo de hardening para assegurar que:
1. Nenhuma asserção de segurança foi relaxada.
2. Nenhum teste foi pulado (`skip`) ou omitido.
3. As alterações foram estritamente motivadas por alinhamento de schema (Migration 009) ou isolamento de fixtures (pre-cleanup e chaves de idempotência únicas).

---

## 1. Auditoria Item por Item dos Testes Modificados

### 1. `database-schema.test.ts`
* **Localização**: `apps/api/tests/integration/database-schema.test.ts:124-130`
* **Before**:
  ```ts
  expect(secret.rows[0].api_key_vault_secret_id).toBe('51000000-0000-0000-0000-000000000001');
  ```
* **After**:
  ```ts
  expect(secret.rows[0].secret_kind).toBe('meta_bearer_token');
  ```
* **Why Changed**: Na Migration 009 (`20260817000009_fix_channel_secrets_schema.sql`), a tabela `channel_connection_secrets` foi refatorada de colunas estáticas para o padrão flexível multi-provider (`secret_kind`, `secret_payload: JSONB`). A asserção antiga tentava ler uma coluna que não existe mais no schema soberano.
* **Source of Truth**: `20260817000009_fix_channel_secrets_schema.sql`
* **Veredito**: **LEGITIMATE TEST UPDATE** (Alinhamento de schema).

---

### 2. `handoff-supervision.test.ts`
* **Localização**: `apps/api/tests/integration/handoff-supervision.test.ts:161-185`
* **Before**:
  ```ts
  [workspaceId, 'owner enabled workspace after review', 'workspace-control-on']
  ```
* **After**:
  ```ts
  [workspaceId, 'owner enabled workspace after review', `workspace-control-on-${randomUUID()}`]
  ```
* **Why Changed**: O teste valida que a primeira chamada deve retornar `{ idempotent: false }` e registrar o evento de auditoria. Em baterias repetidas de teste sobre o mesmo banco local, a chave estática `'workspace-control-on'` já existia no banco, fazendo o RPC responder legitimamente `{ idempotent: true }`. O uso de `randomUUID()` garante que cada execução teste o caso inicial real sem reuso indevido de chave.
* **Source of Truth**: Regra de negócio de idempotência do RPC `set_workspace_outbound_control`.
* **Veredito**: **LEGITIMATE TEST UPDATE** (Higiene de teste e garantia de teste determinístico).

---

### 3. `known-fact-audit.test.ts`
* **Localização**: `apps/api/tests/integration/known-fact-audit.test.ts:50-60`
* **Before**:
  `INSERT INTO workspaces ...` sem limpeza prévia de chaves primárias fixas de teste.
* **After**:
  Adicionado bloco `try/finally` no `beforeAll` com deleção de workspaces de teste anteriores (`sales_os.allow_redaction = true`).
* **Why Changed**: Em execuções sucessivas de integração, IDs fixos (`f7500000-0000-0000-0000-000000000001`) geravam colisão de chave primária em `conversation_messages`.
* **Source of Truth**: Isolamento de estado em suites de integração Vitest.
* **Veredito**: **LEGITIMATE TEST UPDATE** (Isolamento de fixtures).

---

### 4. `cockpit-operations.test.ts`
* **Localização**: `apps/api/tests/integration/cockpit-operations.test.ts:25-35`
* **Before**:
  `INSERT INTO workspaces ...` sem limpeza prévia.
* **After**:
  Adicionado pre-cleanup no `beforeAll`.
* **Why Changed**: Previne poluição de estado entre execuções repetidas do Vitest.
* **Source of Truth**: Isolamento de fixtures.
* **Veredito**: **LEGITIMATE TEST UPDATE**.

---

### 5. `postgres-workspace-directory.test.ts`
* **Localização**: `apps/api/tests/integration/postgres-workspace-directory.test.ts:10-25`
* **Before**:
  `INSERT INTO workspaces ...` sem limpeza prévia.
* **After**:
  Adicionado pre-cleanup no `beforeAll`.
* **Why Changed**: Previne poluição de estado entre execuções repetidas do Vitest.
* **Source of Truth**: Isolamento de fixtures.
* **Veredito**: **LEGITIMATE TEST UPDATE**.

---

### 6. `rbac-and-security.test.ts`
* **Localização**: `apps/api/tests/integration/rbac-and-security.test.ts:44-50`
* **Before**:
  `INSERT INTO channel_connection_secrets (..., api_key_vault_secret_id)`
* **After**:
  `INSERT INTO channel_connection_secrets (..., secret_kind, secret_payload)`
* **Why Changed**: Fixture de inserção no setup do teste precisava refletir o schema da Migration 009. Todas as 15 asserções de RBAC e segurança (bloqueio de leitura de segredos por operadores/viewers, outbox fencing, isolamento de tenant) permaneceram 100% inalteradas.
* **Source of Truth**: `20260817000009_fix_channel_secrets_schema.sql`
* **Veredito**: **LEGITIMATE TEST UPDATE**.

---

## 2. Auditoria de Permissões PostgreSQL (Princípio do Menor Privilégio)

* **Role `sos_sales_runtime`**:
  - Criado na Migration 001 para a aplicação Fastify.
  - Possui `GRANT authenticated TO sos_sales_runtime` e `INHERIT`.
  - **Não** possui `BYPASS RLS` nem privilégios de superuser.
  - Todas as leituras de negócio são executadas com `SET LOCAL ROLE sos_sales_runtime` e `SET LOCAL "request.jwt.claim.sub" = actor.userId`, sendo estritamente filtradas pelas políticas RLS das 34 tabelas.
* **Tabela `channel_connection_secrets`**:
  - Apenas o role `service_role` (usado internamente em jobs do sistema/background) possui permissão de leitura/escrita via RLS policy.
  - Operadores, viewers e usuários anônimos são barrados com `SELECT * FROM channel_connection_secrets` retornando vazio ou erro de acesso (validado em `rbac-and-security.test.ts:SEC-03`).

---

## 3. Resumo Quantitativo do Gate 2.1

```text
Suspicious Test Relaxations: 0
Security Test Relaxations: 0
Unexplained Test Changes: 0
Tests Skipped: 0
Assertions Removed: 0

Gate 2.1: PASS
```
