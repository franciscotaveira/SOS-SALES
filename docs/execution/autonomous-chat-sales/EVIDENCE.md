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

---

## 5. Milestone M3 — Mensageria e Canais no Núcleo (Inbox, Outbox Transacional, Reconciliação, SSRF Guard)

- **Data:** 2026-09-29T03:25:00-03:00
- **Mudanças Implementadas:**
  - `apps/api/src/routes/channels.routes.ts`:
    - Validação SSRF real (`validateWahaBaseUrl`, `validateEvolutionBaseUrl`) e requisições HTTP reais com timeout para `test-connection` WAHA/Evolution (eliminação de sucesso simulado sem I/O).
    - Remoção de fallback hardcoded de chave criptográfica (`FatalCryptographicConfigError` fora do ambiente de testes).
    - Alinhamento de contrato em `createChannel` devolvendo `webhookToken` e `webhookUrl` tanto na raiz do JSON quanto no objeto `channel`.
  - `apps/web/src/pages/SettingsPage.tsx`:
    - Adicionado suporte a `appSecret` no assistente Meta WABA (input dedicado, envio para API e persistência).
    - Resolução robusta de `webhookUrl` e `webhookToken` consumindo tanto raiz quanto `channel`.
  - `packages/database/src/commercial.ts`:
    - `markConversionEventResult`: adicionada cláusula `AND status IN ('QUEUED', 'PROCESSING')` para impedir que workers atrasados com lease expirada sobrescrevam status terminais (`ACCEPTED`, `SIMULATED`, `FAILED`, `DISCARDED`).
  - `apps/worker/src/processors/capi-dispatcher.ts`:
    - Adicionada resolução tenant-safe de credenciais Meta via `withWorkerTransaction` consultando `provider_credentials` do workspace antes de recorrer a variáveis globais de ambiente.
  - `apps/api/src/__tests__/threads-and-channels.test.ts`:
    - Novos testes para contrato de criação de canal, bloqueio SSRF em `test-connection` e falha honesta quando WAHA estiver inacessível.
  - `apps/worker/src/__tests__/capi-dispatcher.test.ts`:
    - Adicionados testes `CAPI-08` (imutabilidade de estado terminal) e `CAPI-09` (resolução tenant-safe de credenciais).
- **Resultados de Testes Executados:**
  - `pnpm vitest run apps/api/src/__tests__/threads-and-channels.test.ts`
    - **Resultado:** 9/9 testes aprovados (Exit Code: 0, Duração: 969ms).
  - `pnpm vitest run apps/worker/src/__tests__/capi-dispatcher.test.ts`
    - **Resultado:** 9/9 testes aprovados (Exit Code: 0, Duração: 826ms).
  - Execução Integral Monorepo (`pnpm test:db:run`):
    - **Resultado:** 48/48 arquivos de teste aprovados, 686/686 testes aprovados (Exit Code: 0, Duração: 22.68s).
  - `pnpm typecheck`: 18/18 tarefas concluídas com sucesso.
  - `pnpm build`: 10/10 pacotes construídos com sucesso.

---

## 6. Milestone M4 — Cockpit Íntegro (Timeline, Isolamento de Rascunhos, Troca Rápida sem Corrida)

- **Data:** 2026-09-29T03:31:00-03:00
- **Mudanças Implementadas:**
  - `apps/web/src/pages/CockpitPage.tsx`:
    - Adicionado suporte a `sessionStorage` persistente para rascunhos de mensagens, associados de forma estrita à tupla `(workspaceId, threadId)` sob a chave `chat_sales_draft_${workspaceId}_${threadId}`.
    - Limpeza imediata da lista de mensagens ao selecionar nova conversa (`setMessages([])`), eliminando qualquer visualização residual de contatos prévios durante carregamentos lentos.
    - Prevenção de condições de corrida em respostas assíncronas de rede (`loadMessages`) e polling periódico via sentinela `activeThreadIdRef`.
    - Limpeza de estados transitórios de erro e sucesso (`sendError`, `outcomeError`, `pixError`, etc.) na troca de conversa.
    - Sincronização automática do rascunho aceito a partir de sugestões do Radar com a chave isolada da conversa alvo.
- **Resultados de Testes Executados:**
  - `pnpm --filter @sos-sales/web build`:
    - **Resultado:** Build concluído com sucesso em 1.63s (`dist/index.html`, `dist/assets/index-DDGbEmeF.css`, `dist/assets/index-Cc3NwY6E.js`).
    - **Exit Code:** `0`
  - `pnpm --filter @sos-sales/ui test`:
    - **Resultado:** 20/20 testes de componentes e acessibilidade aprovados.
    - **Exit Code:** `0` (Duração: 300ms)

---

## 7. Milestone M5 — Próxima Ação Comercial E2 (Schema, Repositório, Atomicidade Radar e UI Cockpit)

- **Data:** 2026-09-29T04:00:00-03:00
- **Mudanças Implementadas:**
  - `packages/database/migrations/020_commercial_actions.sql`:
    - Criação das tabelas `commercial_actions` e `commercial_action_history` com chave estrangeira estrita para `workspaces`, `commercial_threads`, `commercial_journeys`, `integration_suggestions` e `users`.
    - Índice único parcial: `uq_commercial_actions_open_thread ON commercial_actions(workspace_id, thread_id) WHERE status = 'open'`, garantindo invariante de no máximo uma ação aberta por conversa simultaneamente.
    - `FORCE ROW LEVEL SECURITY` em ambas as tabelas com políticas tenant-isoladas (`app.current_workspace_id`).
    - Privilégio mínimo concedido a `sos_app_user`: estritamente `SELECT`, `INSERT`, `UPDATE` (DELETE expressamente revogado).
  - `packages/database/src/repositories/commercial-actions.repository.ts`:
    - `createCommercialAction`: reuso idempotente de ação aberta existente (`created: false`), impedindo duplicidade ou erro de concorrência.
    - `rescheduleCommercialAction`: adiamento auditado com incremento de `postponed_count`, timestamp `postponed_at`, motivo obrigatório e registro imutável em `commercial_action_history`.
    - `assignCommercialAction`: reatribuição de responsável com histórico auditado.
    - `completeCommercialAction` e `cancelCommercialAction`: transições de estado terminais idempotentes.
  - `packages/database/src/repositories/integration-suggestions.repository.ts`:
    - Vinculação atômica em `decideSuggestion`: ao aceitar sugestão do Radar (`status = 'accepted'`), cria ou reutiliza a ação comercial aberta na mesma transação tenant, garantindo que retries concorrentes retornem o mesmo registro de ação.
  - `packages/database/src/messaging.ts` & `apps/api/src/routes/threads.routes.ts`:
    - Projeção de `next_action` via lateral join na listagem de threads.
    - Suporte a filtro booleano `needsAttention`: threads ativas sem próxima ação aberta OU com próxima ação vencida (`due_at < now()`).
  - `apps/api/src/routes/commercial-actions.routes.ts`:
    - Endpoints REST tenant-isolados: `GET/POST /v1/workspaces/:workspaceId/threads/:threadId/actions`, `PATCH /v1/workspaces/:workspaceId/actions/:actionId` e `GET /v1/workspaces/:workspaceId/actions/:actionId/history`.
  - `apps/web/src/pages/CockpitPage.tsx`:
    - Card "Próxima Ação Comercial (E2)" na Coluna 3 com exibição de prazo, badges de status (`ABERTA`, `VENCIDA`, `X ADIADA`), ações diretas de conclusão, adiamento com formulário modal e cancelamento.
    - Pill de prazo na listagem de conversas com destaque em vermelho para ações vencidas.
    - Botão de filtro de fila `Atenção` (`needs_attention`).
- **Resultados de Testes Executados:**
  - `packages/database/src/__tests__/commercial-actions.test.ts`:
    - **Resultado:** 9/9 testes aprovados (Exit Code: 0, Duração: 195ms).
  - `apps/api/src/__tests__/commercial-actions.routes.test.ts`:
    - **Resultado:** 11/11 testes de rotas aprovados (Exit Code: 0, Duração: 220ms).
  - `apps/api/src/__tests__/integration.routes.test.ts`:
    - **Resultado:** 27/27 testes aprovados com decisão atômica de Radar (Exit Code: 0, Duração: 599ms).
  - Execução Integral Monorepo (`pnpm test:db:run`):
    - **Resultado:** 50/50 arquivos de teste aprovados, 706/706 testes verdes (Exit Code: 0, Duração: 31.17s).
  - `pnpm typecheck`:
    - **Resultado:** 18/18 tarefas concluídas com sucesso no Turbo (Exit Code: 0).
  - `pnpm --filter @sos-sales/web build`:
    - **Resultado:** Build concluído com sucesso em 1.85s (Exit Code: 0).



