# Work Package CRM-01 — CRM Core, Fechamento de Venda no Cockpit e Meta CAPI Return Loop

> **Status:** ACCEPTED  
> **Evidence ID:** `EV-CRM01-001`  
> **Data de Homologação:** 27 de setembro de 2026  
> **Branch:** `codex/iteration-2.7`  
> **Compliance:** ADR-001 (MVP Frontier), ADR-002 (FORCE RLS Fail-Closed), Truth in Data (valores monetários inteiros em centavos, recibos fidedignos da Meta), Sovereign Kernel v2.0 (Zero n8n, Zero mocks em produção).

---

## 1. Contexto e Objetivo Arquitetural

O pacote **CRM-01** conclui o ciclo comercial completo do MVP do **SOS Sales V3**, conectando as pontas de aquisição, atendimento conversacional e feedback à mídia paga ([ADR-001](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/docs/adr/ADR-001-mvp-frontier.md)):

$$\text{Aquisição (CTWA)} \longrightarrow \text{WhatsApp (WABA/WAHA)} \longrightarrow \text{Cockpit Real (Operador)} \longrightarrow \text{Venda/Outcome} \longrightarrow \text{Feedback CAPI Meta}$$

### Objetivos Específicos Alcançados
1. **Modelagem de Dados e Isolamento Tenant:** Criação das tabelas `commercial_journeys`, `commercial_outcomes` e `conversion_events` na [Migration 007](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/packages/database/migrations/007_commercial_journeys_and_conversions.sql) com `FORCE ROW LEVEL SECURITY`, integridade referencial composta `(workspace_id, id)` e políticas granulares para `sos_migration_owner`, `sos_app_user` e `sos_worker_user`.
2. **Persistência Transacional:** Módulo [packages/database/src/commercial.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/packages/database/src/commercial.ts) encapsulando criação de oportunidades, registro de desfecho comercial (won/lost) com valor financeiro em centavos (`value_cents`), transição atômica de estágio e enfileiramento automático de conversões CAPI.
3. **API Fastify de CRM e Conversões:** Rotas em [apps/api/src/routes/commercial.routes.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/api/src/routes/commercial.routes.ts) protegidas com `app.authenticate` e `app.requireWorkspaceContext`, incluindo consulta de oportunidade da thread (`GET .../threads/:threadId/journey`), fechamento de negócio (`POST .../threads/:threadId/outcomes`), listagem de oportunidades (`GET .../journeys`) e auditoria de conversões (`GET .../conversions`).
4. **Worker CAPI Dispatcher:** Processador [apps/worker/src/processors/capi-dispatcher.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/worker/src/processors/capi-dispatcher.ts) e integração no [apps/worker/src/index.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/worker/src/index.ts) (`WorkerRuntime`), realizando claim via `SKIP LOCKED`, envio formatado para a Graph API v21.0 da Meta (com hash SHA-256 do telefone e `ctwa_clid`), e persistência do recibo `ACCEPTED` / erro sob `withWorkerTransaction`.
5. **Cockpit UI Integration:** Atualização do [apps/web/src/pages/CockpitPage.tsx](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/web/src/pages/CockpitPage.tsx) e [apps/web/src/services/api-client.ts](file:///Users/franciscotaveira.ads/Downloads/FT/CHAT-SALES/apps/web/src/services/api-client.ts) permitindo ao operador registrar o fechamento comercial da conversa, com feedback visual em tempo real do evento Meta CAPI `PurchaseCompleted` enfileirado/despachado.

---

## 2. Matriz de Aceite e Critérios de Homologação

| AC-ID | Critério | Resultado | Evidência Técnica |
|---|---|---|---|
| **AC-CRM01-001** | Criação de oportunidade (`commercial_journeys`) preservando rastreabilidade de campanha e `ctwa_clid` sob FORCE RLS. | **PASS** | Teste `CRM-01` em `commercial-and-conversions.test.ts` (retorna HTTP 201, dados vinculados ao workspace). |
| **AC-CRM01-002** | Isolamento multi-tenant estrito (fail-closed) bloqueando leitura e mutação cross-tenant com HTTP 403 Forbidden. | **PASS** | Teste `CRM-05` em `commercial-and-conversions.test.ts` e `CRM-02` (zero vazamento de linhas entre tenants). |
| **AC-CRM01-003** | Fechamento de venda (`won`) com valor monetário real em centavos gerando atomicamente evento `PurchaseCompleted` enfileirado (`status: 'QUEUED'`). | **PASS** | Teste `CRM-03` em `commercial-and-conversions.test.ts` e `threads-and-channels.test.ts` (valor R$ 497,00 = 49700 centavos). |
| **AC-CRM01-004** | Registro de desfecho perdido (`lost`) atualizando status do negócio sem poluir a fila de conversões da Meta CAPI. | **PASS** | Teste `CRM-04` em `commercial-and-conversions.test.ts` (0 conversion_events gerados). |
| **AC-CRM01-005** | Claim transacional e despacho de conversões CAPI pelo Worker com hash SHA-256 do telefone, `ctwa_clid` e gravação de recibo com `fbtrace_id`. | **PASS** | Testes `CAPI-01`, `CAPI-02`, `CAPI-03` em `capi-dispatcher.test.ts` (mock endpoint e sandbox). |
| **AC-CRM01-006** | Execução automática de despacho CAPI no loop governado do `WorkerRuntime`. | **PASS** | Teste `CAPI-04` em `capi-dispatcher.test.ts` (transição assíncrona de `QUEUED` para `ACCEPTED`). |
| **AC-CRM01-007** | Interface do Cockpit permitindo fechamento comercial direto da conversa com exibição de badge de despacho CAPI. | **PASS** | `CockpitPage.tsx` e `apiClient.recordOutcome` compilados e validados no bundle Vite sem erros. |
| **AC-CRM01-008** | Verificação integral dos 6 Gates do CI local (`pnpm ci:gate`). | **PASS** | 43 arquivos de teste (599 asserções) 100% aprovados, TypeScript limpo, build turbo verde e manifests íntegros. |

---

## 3. Resumo de Testes Executados

```text
================================================================================
 SOS SALES V3 — CANONICAL LOCAL CI GATE RUNNER (G-06)
================================================================================
GATE-01 | [PASS] | Document & JSON Schema Integrity (22 JSON files verified)
GATE-02 | [PASS] | Static TypeScript Compilation (10/10 packages)
GATE-03 | [PASS] | Monorepo Linter (turbo lint completed with code 0)
GATE-04 | [PASS] | Monorepo Full Build (all packages & Vite bundle compiled)
GATE-05 | [PASS] | Hermetic DB Test Runner (43 files, 599 assertions passed)
GATE-06 | [PASS] | Evidence Manifest Integrity Audit (verified)
--------------------------------------------------------------------------------
Final Pipeline Status: ACCEPTED (SUCCESS)
================================================================================
```
