# SOS Sales — Decision Log

> Registro formal e contínuo de decisões arquiteturais e técnicas tomadas durante a execução do Plano Mestre do SOS Sales (TX Commercial Core).

---

## Task 1: WAHA Outbound Worker
- **Decision:** Utilizar adapter HTTP com retries exponenciais, jitter e heartbeat assíncrono diretamente contra a API REST do WAHA em vez de SDK/biblioteca de terceiros.
- **Rationale:** Elimina dependências externas pesadas que podem quebrar entre versões do WAHA; permite controle estrito sobre timeouts, idempotency-key por dispatch e tratamento de erros específicos do WhatsApp (422 invalid phone, 429 rate limit, 503 session dead).
- **Scope:** 
  - `apps/api/src/infrastructure/integrations/waha/waha-outbound-adapter.ts`
  - `apps/api/src/infrastructure/workers/waha-outbound-worker.ts`
  - `apps/api/tests/integration/waha-outbound-worker.test.ts`
- **Trade-offs:** Exige tipagem manual de envelopes e payloads do WAHA, mas garante 100% de previsibilidade no claim token e fencing de lease.
- **Confidence:** 10/10
- **Date:** 2026-08-15

---

## Task 2: Meta Ads Spend Import Worker
- **Decision:** Ingestão periódica de métricas diárias via endpoint `/insights` da Meta Graph API (v20.0) com upsert transacional em `campaign_spend_daily_facts`.
- **Rationale:** Fornece a verdade soberana sobre o investimento em anúncios (Spend/CPA) para cruzamento automático com o faturamento fechado na jornada comercial no módulo Traffic Proof.
- **Scope:**
  - `apps/api/src/infrastructure/integrations/meta/meta-marketing-api-client.ts`
  - `apps/api/src/infrastructure/workers/meta-spend-import-worker.ts`
  - `apps/api/tests/integration/meta-spend-import.test.ts`
- **Trade-offs:** Dados da Meta sofrem janela de atribuição de 24h a 72h; a estratégia de upsert idempotente por `(workspace_id, campaign_id, date)` resolve eventuais reprocessamentos sem duplicar custo.
- **Confidence:** 10/10
- **Date:** 2026-08-15

---

## Task 3: Meta Conversions API (CAPI) Dispatch Worker
- **Decision:** Processamento assíncrono do outbox de desfechos comerciais (`commercial.outcome_recorded`) despachando eventos `Purchase` / `Lead` para a Meta CAPI com hashing criptográfico SHA-256 de PII (telefone e email normalizados).
- **Rationale:** Permite feedback de conversão offline de alto valor sem expor dados do cliente em texto puro e sem travar a thread de fechamento da jornada comercial no Postgres.
- **Scope:**
  - `apps/api/src/infrastructure/integrations/meta/capi-client.ts`
  - `apps/api/src/infrastructure/workers/capi-dispatch-worker.ts`
  - `apps/api/tests/integration/capi-dispatch-worker.test.ts`
- **Trade-offs:** Requer configuração prévia de Pixel ID e Access Token na Meta; em sua ausência, o worker registra falha transitória com backoff sem perder o evento no outbox.
- **Confidence:** 10/10
- **Date:** 2026-08-15

---

## Task 4: Appointments & Notes Backend API
- **Decision:** Implementação de endpoints dedicados sob `/api/v1/workspaces/:wsId/appointments` e `/notes` com repositórios Postgres isolados por RLS e token de 3 segmentos.
- **Rationale:** Substitui fixtures estáticas por persistência real no PostgreSQL do Supabase, permitindo auditoria, filtros por status/categoria e integridade referencial com jornadas e operadores.
- **Scope:**
  - `apps/api/src/application/ports/appointment-gateway.ts`
  - `apps/api/src/application/ports/notes-gateway.ts`
  - `apps/api/src/infrastructure/database/postgres-appointment-gateway.ts`
  - `apps/api/src/infrastructure/database/postgres-notes-gateway.ts`
  - `apps/api/src/interfaces/http/routes/appointments.ts`
  - `apps/api/src/interfaces/http/routes/notes.ts`
  - `apps/api/tests/integration/appointments-api.test.ts`
  - `apps/api/tests/integration/notes-api.test.ts`
- **Trade-offs:** Adiciona 8 novos testes de integração e novas tabelas no schema, mas remove qualquer estado volátil do cliente.
- **Confidence:** 10/10
- **Date:** 2026-08-15

---

## Task 5: Calendar Gateway & RRULE Recurring Follow-ups
- **Decision:** Gateway composto para provedores de calendário (Google Calendar / Outlook) com algoritmo de expansão RFC 5545 RRULE integrado no `RecurringFollowUpWorker`.
- **Rationale:** Permite que operadores programem rotinas de reengajamento comercial com regras complexas (diárias, semanais, mensais) mantendo o timezone padrão `America/Sao_Paulo` e checagem de slots livres/ocupados.
- **Scope:**
  - `apps/api/src/application/ports/calendar-gateway.ts`
  - `apps/api/src/infrastructure/integrations/calendar/google-calendar-adapter.ts`
  - `apps/api/src/infrastructure/integrations/calendar/outlook-calendar-adapter.ts`
  - `apps/api/src/infrastructure/integrations/calendar/composite-calendar-gateway.ts`
  - `apps/api/src/infrastructure/workers/recurring-followup-worker.ts`
  - `apps/api/tests/integration/calendar-gateway.test.ts`
  - `apps/api/tests/integration/recurring-followup-worker.test.ts`
- **Trade-offs:** Requer tratamento de fusos horários e limites de recorrência (`UNTIL` / `COUNT`); coberto por 5 testes unitários e de integração.
- **Confidence:** 10/10
- **Date:** 2026-08-15

---

## Task 6: Workspace Provisioning & Auto-Init API
- **Decision:** Criação de transação atômica em `POST /api/v1/workspaces/init` que inicializa o workspace do operador, atribui role `owner`, cria políticas de SLA e provisiona canal WAHA padrão com status `DISCONNECTED`.
- **Rationale:** Garante experiência de onboarding fluida e sem fricção técnica para novos usuários logo no primeiro login, mantendo a invariante de que todo operador deve possuir ao menos 1 workspace ativo.
- **Scope:**
  - `apps/api/src/application/ports/workspace-provisioning-gateway.ts`
  - `apps/api/src/infrastructure/database/postgres-workspace-provisioning-gateway.ts`
  - `apps/api/src/interfaces/http/routes/workspace-init.ts`
  - `apps/api/tests/integration/workspace-init-api.test.ts`
  - `src/components/workspace/WorkspaceInitModal.tsx`
  - `src/hooks/useWorkspaceInit.ts`
- **Trade-offs:** Nenhuma duplicação; chamadas subsequentes retornam o workspace primário já existente de forma idempotente.
- **Confidence:** 10/10
- **Date:** 2026-08-15

---

## Tasks 7 a 11: Telas Operacionais Ao Vivo no Frontend
- **Decision:** Substituição de telas de demonstração por interfaces conectadas ao `salesOsGateway` (`LiveCommercialKanbanView`, `LiveConversationsView`, `LiveSettingsView`, `AgendaView`, `NotesView`).
- **Rationale:** Permite que operadores reais naveguem no funil, acompanhem prazos de SLA em tempo real, pareiem instâncias WAHA e gerenciem agendamentos sem nunca ver dados simulados ou mockados.
- **Scope:**
  - `src/components/kanban/LiveCommercialKanbanView.tsx`
  - `src/components/conversations/LiveConversationsView.tsx`
  - `src/components/settings/LiveSettingsView.tsx`
  - `src/components/agenda/AgendaView.tsx`
  - `src/components/notes/NotesView.tsx`
  - `src/App.tsx`
- **Trade-offs:** Estrutura de tipos sincronizada entre frontend e backend com compilação TypeScript estrita (`strict: true`).
- **Confidence:** 10/10
- **Date:** 2026-08-15
