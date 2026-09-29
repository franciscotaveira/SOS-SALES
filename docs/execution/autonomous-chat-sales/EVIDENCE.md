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

---

## 8. Milestone M6 — Fluxo Comercial, Catálogo, Proposta Imutável, Pix EMV e Outcome WON/LOST

- **Data:** 2026-09-29T04:20:00-03:00
- **Mudanças Implementadas:**
  - `packages/database/migrations/021_commercial_proposals.sql`:
    - Criação da tabela `commercial_proposals` com snapshot imutável em JSONB (`items`), `total_cents` consolidado, composite foreign keys com `workspace_id` para integridade referencial com `contacts`, `commercial_threads` e `commercial_journeys`.
    - `FORCE ROW LEVEL SECURITY` com políticas tenant-isoladas (`app.current_workspace_id`).
    - Privilégio mínimo concedido a `sos_app_user`: estritamente `SELECT`, `INSERT`, `UPDATE` (DELETE expressamente revogado).
    - Adicionada coluna `proposal_id` em `pix_charges` com composite foreign key `(workspace_id, proposal_id)` permitindo vinculação estrita entre proposta e cobrança Pix.
  - `packages/database/src/repositories/commercial-proposals.repository.ts`:
    - `createCommercialProposal`: snapshotting automático de catálogo (congelando título e preço unitário vigentes ou aceitando itens customizados com precificação explícita), cálculo de subtotal por item e total consolidado. Avança automaticamente jornada comercial ativa vinculada para `proposal` se o estágio atual for `lead` ou `qualified`.
    - `getCommercialProposalById` e `listCommercialProposalsForThread`: consultas tenant-seguras com ordenação cronológica.
    - `updateCommercialProposalStatus`: máquina de estados (`draft`, `sent`, `accepted`, `rejected`, `expired`, `cancelled`) com transição para `won` na jornada ao aceitar (`accepted`), registro de timestamps específicos (`accepted_at`, `rejected_at`, `cancelled_at`), e bloqueio estrito de transições regressivas a partir de propostas aceitas.
  - `packages/database/src/commercial.ts`:
    - `recordCommercialOutcome`: validação estrita de ator responsável (`ACTOR_REQUIRED`), motivo obrigatório para desfecho de perda (`REASON_REQUIRED` quando `status === 'lost'`), e deduplicação idempotente retornando o desfecho existente sem re-enfileirar evento CAPI em chamadas repetidas idênticas.
  - `packages/database/src/pix.ts`:
    - Confirmação manual de caixa (`confirmPixChargeManual`): marca explicitamente `status = 'PAID'`, método `MANUAL_CASHIER`, grava notas de conferência bancária e mantém desacoplado de despacho de conversão CAPI ou avanço cego de jornada comercial.
  - `apps/api/src/routes/commercial-proposals.routes.ts`:
    - Endpoints REST tenant-isolados com RBAC (`journey:view`, `journey:transition_stage`): `GET/POST /v1/workspaces/:workspaceId/threads/:threadId/proposals`, `GET /v1/workspaces/:workspaceId/proposals/:proposalId` e `PATCH /v1/workspaces/:workspaceId/proposals/:proposalId/status`.
  - `apps/web/src/services/api-client.ts`:
    - Tipos TypeScript e métodos de cliente (`CommercialProposalSummary`, `CommercialProposalItem`, `getThreadProposals`, `createThreadProposal`, `getProposal`, `patchProposalStatus`).
- **Resultados de Testes Executados:**
  - `packages/database/src/__tests__/commercial-proposals.test.ts`:
    - **Resultado:** 9/9 testes aprovados (Exit Code: 0, Duração: 285ms).
  - `apps/api/src/__tests__/commercial-proposals.routes.test.ts`:
    - **Resultado:** 4/4 testes de rotas aprovados (Exit Code: 0, Duração: 264ms).
  - Execução Integral Monorepo (`pnpm test:db:run`):
    - **Resultado:** 52/52 arquivos de teste aprovados, 719/719 testes verdes (Exit Code: 0, Duração: 26.71s).
  - `pnpm typecheck`:
    - **Resultado:** 18/18 tarefas concluídas com sucesso no Turbo (Exit Code: 0).
  - `pnpm --filter @sos-sales/web build`:
    - **Resultado:** Build concluído com sucesso em 1.63s (Exit Code: 0).

---

## 9. Milestone M7 — Onboarding Assistido de Canal por Workspace (WABA/WAHA com Credenciais Protegidas)

- **Data:** 2026-09-29T04:32:00-03:00
- **Mudanças Implementadas:**
  - `apps/api/src/routes/channels.routes.ts`:
    - Endpoint de revogação segura `POST /v1/workspaces/:workspaceId/channels/:channelId/revoke`:
      - Atualiza `channel_instances.is_active = false`.
      - Atualiza `provider_credentials.status = 'REVOKED'`.
      - Registra auditoria imutável via `recordSecurityAuditEvent` em `audit_events` com ação `channel.revoked`.
      - Protegido por autenticação, isolamento de tenant e permissão RBAC `workspace:manage`.
    - Endpoint de pareamento WAHA seguro `GET /v1/workspaces/:workspaceId/channels/:channelId/qr-code`:
      - Decriptação de credenciais estritamente no cofre da aplicação em memória via AES-256-GCM.
      - Validação SSRF obrigatória (`validateWahaBaseUrl`).
      - Retorno de SVG/Data URI sem imprimir ou expor API keys, tokens ou sessões ao navegador.
      - Rejeição com HTTP 400 para provedores não-WAHA (`meta_waba`) e HTTP 409 para canais revogados/inativos.
    - Projeção de listagem enriquecida `GET /v1/workspaces/:workspaceId/channels`:
      - Adicionados campos `status` (`connected` | `revoked`) e `environment` (`production_certified` para WABA e `lab_local` para WAHA).
  - `apps/web/src/pages/SettingsPage.tsx`:
    - Badges distintos para canais ("Homologado Oficial" em esmeralda vs "Laboratório Local" em violeta).
    - Botão "Revogar" com diálogo nativo de confirmação que chama `api.revokeChannel`.
    - Botão "QR Code" para linhas WAHA com modal seguro dedicado exibindo o QR sem vazamento de tokens.
  - `apps/web/src/services/api-client.ts`:
    - Atualizada interface `ChannelSummary` e adicionados métodos `revokeChannel` e `getChannelQrCode`.
  - `apps/api/src/__tests__/channel-onboarding-m7.test.ts`:
    - Suíte de integração com 6/6 testes aprovados cobrindo provisionamento com encriptação, listagem com status/ambiente honestos, segurança de QR code, RBAC (403 para operadores), isolamento cross-tenant (404/403) e revogação com auditoria.
- **Resultados de Testes Executados:**
  - `apps/api/src/__tests__/channel-onboarding-m7.test.ts`:
    - **Resultado:** 6/6 testes aprovados (Exit Code: 0, Duração: 452ms).
  - Execução Integral Monorepo (`pnpm test:db:run`):
    - **Resultado:** 53/53 arquivos de teste aprovados, 725/725 testes verdes com teardown limpo (Exit Code: 0, Duração: 28.03s).
  - `pnpm typecheck`:
    - **Resultado:** 18/18 tarefas concluídas com sucesso no Turbo (Exit Code: 0, Duração: 1.95s).
  - `pnpm --filter @sos-sales/web build`:
    - **Resultado:** Build concluído com sucesso em 1.70s (Exit Code: 0).

---

## 10. Milestone M8 — Resiliência, Restarts, Lease Recovery e Preparação para Migração

- **Data:** 2026-09-29T04:40:00-03:00
- **Mudanças Implementadas:**
  - `docs/runbooks/BACKUP-RESTORE-ROLLBACK-RUNBOOK.md`:
    - Procedimentos operacionais detalhados de backup lógico (`pg_dump` completo) e físico (snapshots de volume Docker).
    - Ensaio de restauração em banco descartável de laboratório com verificação automática de integridade.
    - Estratégia de rollback por tráfego, revogação de canais e feature flags em conformidade com o princípio expand-contract (sem down migrations DDL destrutivas).
    - Protocolo de recuperação de crash de worker (SIGKILL / OOM) e política de dead-letter em filas CAPI e outbox.
  - `scripts/migration-v2-to-v3-dryrun.ts`:
    - Script automatizado de dry-run para auditoria de prontidão V2->V3 sem credenciais reais.
    - Validação de 17 tabelas estruturais de negócio e infraestrutura V3.
    - Verificação estrita de `FORCE ROW LEVEL SECURITY` em todas as tabelas multi-tenant.
    - Verificação de privilégios mínimos (garantindo que `DELETE` permaneça expressamente revogado para `sos_app_user` em tabelas imutáveis).
    - Auditoria de integridade referencial: zero threads, mensagens, propostas, ações e cobranças órfãs.
    - Emissão de relatório estruturado em formato CLI ou JSON.
  - `scripts/__tests__/migration-v2-to-v3-dryrun.test.ts`:
    - Suíte de testes automatizados com 2/2 testes aprovados confirmando que o dry-run executa com sucesso, sem divergências (`isReady: true`) e com garantia de idempotência.
  - `apps/worker/src/__tests__/resilience-and-recovery-m8.test.ts`:
    - Suíte de resiliência e integridade do worker com 3/3 testes aprovados:
      1. Queda súbita de worker processando comando outbox: na retomada, o lease expirado é recuperado para `reconciliation_required` sem chamada repetida ou cega ao provedor WhatsApp (garantia de Truth in Data contra duplicação de mensagens no canal);
      2. Reconciliação administrativa com registro de recibo externo (`externalMessageId`) e transição segura para `sent`;
      3. Recuperação de eventos CAPI com despacho simulado honesto sem geração de falsos `fbtrace_id`;
      4. Rastreabilidade ponta a ponta com correlação de IDs entre eventos de auditoria imutáveis, thread, mensagens e workspace.
- **Resultados de Testes Executados:**
  - `scripts/__tests__/migration-v2-to-v3-dryrun.test.ts`:
    - **Resultado:** 2/2 testes aprovados (Exit Code: 0, Duração: 164ms).
  - `apps/worker/src/__tests__/resilience-and-recovery-m8.test.ts`:
    - **Resultado:** 3/3 testes aprovados (Exit Code: 0, Duração: 202ms).
  - Execução Integral Monorepo (`pnpm test:db:run`):
    - **Resultado:** 55/55 arquivos de teste aprovados, 730/730 testes verdes com teardown limpo (Exit Code: 0, Duração: 29.91s).
  - `pnpm typecheck`:
    - **Resultado:** 18/18 tarefas concluídas com sucesso no Turbo (Exit Code: 0, Duração: 3.59s).
  - `pnpm build`:
    - **Resultado:** 10/10 pacotes construídos com sucesso (Exit Code: 0, Duração: 4.28s).





