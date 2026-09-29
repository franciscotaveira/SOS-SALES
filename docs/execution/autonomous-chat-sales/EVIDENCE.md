# EVIDENCE.md — Registro Factual de Testes e Comandos

> **Regra do Contrato:** Comandos, exit codes, tempos de execução e referências exatas de SHA.

---

## 1. Baseline de Entrada (Milestone M0)

- **Data:** 2026-09-29T02:50:00-03:00
- **Commit:** `c8f5a09a977495d9e9084409767d5c768ba20413`
- **Comando:** `node --check scripts/verify-e1-trust-browser.mjs`
  - **Exit Code:** `0`
  - **Evidência:** Sintaxe corrigida após remoção do token indevido `gerarimport` na linha 1.
- **Comando:** `pnpm typecheck`
  - **Exit Code:** `0` (18/18 tarefas bem-sucedidas no Turbo)
- **Comando:** `pnpm build`
  - **Exit Code:** `0` (10/10 pacotes construídos)

---

## 2. Testes de Unidade e Integração (Base c8f5a09)

| Suíte | Testes | Duração | Exit Code |
| :--- | :---: | :---: | :---: |
| `packages/database/src/__tests__/integration-suggestions.test.ts` | 20/20 | 700ms | 0 |
| `apps/api/src/__tests__/integration.routes.test.ts` | 24/24 | 596ms | 0 |
| `apps/api/src/__tests__/commercial-and-conversions.test.ts` | 6/6 | 402ms | 0 |
| `packages/database/src/__tests__/pix.test.ts` | 9/9 | 402ms | 0 |
| `apps/worker/src/__tests__/capi-dispatcher.test.ts` | 7/7 | 350ms | 0 |

---

## 3. Milestone M1 — Fechamento F1.1-C.1 (Imutabilidade Terminal e Replay Idempotente)

- **Data:** 2026-09-29T03:00:00-03:00
- **Mudanças Implementadas:**
  - `packages/database/src/repositories/integration-suggestions.repository.ts`:
    1. Terminal status check (`suggestion.status !== 'pending'`) e verificação otimista de versão (`suggestion.state_version !== decision.expectedStateVersion`) executados imediatamente após `SELECT ... FOR UPDATE OF s` antes de qualquer verificação de governança do workspace. Garante que retries e mudanças de governança não sobrescrevam decisões finais com `MODULE_DISABLED`, `RULE_VERSION_STALE` ou `WORKSPACE_INACTIVE`.
    2. `safeReject` com assinatura completa de `expectedStateVersion` e `decidedByUserId` persistindo structured rejection metadata.
    3. `createIntegrationSuggestion`: consulta de `idempotency_key` realizada antes de validações mutáveis de thread. Retorna o registro existente (`created: false`) caso o fingerprint do payload de entrada corresponda, mesmo na presença de mensagens supervenientes ou alteração de regras do workspace.
- **Resultados de Testes Executados:**
  - `pnpm --filter @sos-sales/database test src/__tests__/integration-suggestions.test.ts`
    - **Resultado:** 25/25 aprovados (5 novos testes adicionados cobrindo imutabilidade terminal, optimistic concurrency e replay estável).
    - **Exit Code:** `0` (Duração: 562ms)
  - `pnpm --filter @sos-sales/api exec vitest run src/__tests__/integration.routes.test.ts`
    - **Resultado:** 27/27 aprovados (3 novos testes de rotas cobrindo imutabilidade terminal após desativação de Radar, replay com retorno 200/false e version mismatch).
    - **Exit Code:** `0` (Duração: 441ms)
  - `pnpm typecheck`
    - **Resultado:** 18/18 tarefas concluídas com sucesso.
    - **Exit Code:** `0`
  - `pnpm build`
    - **Resultado:** 10/10 pacotes construídos com sucesso.
    - **Exit Code:** `0`

---

## 4. Milestone M2 — Fundação, Auth JWT, RBAC com Efeitos, withTenantTransaction e RLS

- **Data:** 2026-09-29T03:10:00-03:00
- **Verificações e Testes Realizados:**
  - `packages/database/src/__tests__/tenant-isolation.test.ts`:
    - Adicionada suíte completa de isolamento negativo cross-tenant cobrindo: contatos, threads comerciais, mensagens, produtos de catálogo, cobranças Pix, jornadas comerciais, outcomes e sugestões de integração.
    - Comprovado fail-closed quando `app.current_workspace_id` está ausente (0 rows retornadas).
    - Comprovada estrita revogação de DELETE para `sos_app_user` em contatos, canais, threads e mensagens (princípio do privilégio mínimo).
    - Comprovado bloqueio de INSERT cross-tenant por RLS `WITH CHECK`.
    - **Resultado:** 16/16 testes aprovados (Exit Code: 0, Duração: 213ms).
  - `apps/api/src/__tests__/auth-vertical-slice.test.ts`:
    - Validação de JWT, rejeição de assinaturas adulteradas, emissor e audiência inválidos, alg: none, privilégios RBAC nas rotas com efeito, e auditoria imutável de eventos de segurança.
    - **Resultado:** 19/19 testes aprovados (Exit Code: 0).
  - Execução Integral Monorepo (`pnpm test:db:run`):
    - **Resultado:** 48/48 arquivos de teste aprovados, 681/681 testes aprovados (Exit Code: 0, Duração: 21.56s).
  - `pnpm typecheck`: 18/18 tarefas concluídas com sucesso.
  - `pnpm build`: 10/10 pacotes construídos com sucesso.


