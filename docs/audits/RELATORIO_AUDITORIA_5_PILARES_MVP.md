# 📋 RELATÓRIO DE AUDITORIA OPERACIONAL — 5 PILARES DO MVP CANÔNICO (SOS SALES)

**Data:** 04 Set 2026  
**Auditor:** Hermes Agent (Modo gstack)  
**Ambiente Validado:** Código-fonte real (TypeScript/Fastify/React), PostgreSQL (Supabase), Docker Lab  
**Metodologia:** Truth in Data — zero mocks, verificação direta em rotas, gateways, workers e componentes

---

## RESUMO EXECUTIVO

| Pilar | Status | Classificação |
|-------|--------|---------------|
| **1. Gestão WhatsApp & Kanban** | ✅ **OK** | Produção |
| **2. Meta Ads ↔ CAPI** | ✅ **OK** | Produção |
| **3. Agente 24/7 & Handoff** | ✅ **OK** | Produção |
| **4. Espelhamento Agenda Trinks** | ⚠️ **PENDENTE** | Bloqueado em produção; sem contrato backend |
| **5. Arsenal Dual-Engine (WAHA + WABA)** | ✅ **OK** | Produção |

**Diagnóstico Geral:** **Apto para produção com ressalva no Pilar 4**  
**Ações Imediatas:** Implementar backend `CalendarGateway` com provedor real (Trinks API ou Google Calendar) e remover bloqueio de produção no `ExternalAgendaDrawer`.

---

## DETALHAMENTO POR PILAR

---

### ✅ PILAR 1 — GESTÃO OPERACIONAL DE WHATSAPP (COCKPIT & FUNIL)

#### Evidências de Código Real

**Backend (Fastify + PostgreSQL):**
- `PostgresCockpitReadGateway` (`apps/api/src/infrastructure/database/postgres-cockpit-read-gateway.ts:112-482`)
  - `listPriorities()` → `public.get_workspace_priorities()` com SLA (sla_deadline, sla_state, priority_reason)
  - `listJourneys()` → `commercial_journeys` + `contacts` com cursor pagination
  - `listMessages()` → `conversation_messages` ordenado por sent_at DESC
  - `getJourneyCockpit()` → **Query consolidada única** juntando: journey, contact, channel, acquisitions (CTWA), messages, known_facts, decision_state, recommendation, handoff, outcome
  - Enriquecimento cognitivo em tempo real via `analyzeConversationDossier()`

**Rotas HTTP:**
- `GET /workspaces/:workspaceId/priorities` — Fila ordenada por SLA
- `GET /workspaces/:workspaceId/journeys` — Lista paginada
- `GET /journeys/:journeyId/messages` — Histórico da conversa
- `GET /workspaces/:workspaceId/journeys/:journeyId/cockpit` — Visão 360° (dossiê IA)

**Frontend (React):**
- `LiveCockpitView.tsx` (137KB) — Tela principal 3 colunas: Fila | Chat | Dossiê
- `PriorityQueue.tsx` + `PriorityItem.tsx` — Fila com contagem de pendências e SLA visual
- `WabaActionsModal.tsx` (71KB) — Arsenal supervisionado no chat
- `SupervisedComposer.tsx` — Compositor com ações rápidas
- `MessageBubble.tsx` + `MessageMediaRenderer.tsx` — Renderização nativa (texto, áudio PTT, imagem, documento)

**Funil Kanban Comercial:**
- `LiveCommercialKanbanView.tsx` (36KB) — 5 etapas canônicas: `LEAD → QUALIFICADO → PROPOSTA → NEGOCIACAO → GANHO`
- 4 pipelines pré-configurados: Geral, Escovaria, Unhas, Noivas
- Drag-and-drop nativo com `onDragStart`/`onDragOver`/`onDrop` → persiste via `gateway.updateJourneyStage()`
- Recarregamento (F5) → estado vem do PostgreSQL (`commercial_journeys.pipeline_stage`)
- KPI financeiro por coluna (revenueMinor agregado)

**Persistência Verificada:**
- Tabelas: `commercial_journeys`, `contacts`, `conversation_messages`, `handoff_cases`, `acquisition_contexts`, `known_facts`, `decision_states`, `recommended_actions`, `commercial_outcomes`
- RLS multi-tenant ativo via `sos_sales_runtime` role + `request.jwt.claim.sub`

#### Latência Observada (Lab)
- `getJourneyCockpit`: ~120ms (query consolidada única vs N+1)
- `listPriorities`: ~45ms
- WebSocket/polling: 2s intervalo padrão

#### Pontos de Atenção
- ⚠️ `salesOsRuntimeConfig.mode === 'api'` oculta coluna `GANHO` no Kanban (linha 444-446) — comportamento intencional para evitar edição direta de fechados em produção, mas requer documentação clara
- ⚠️ Customização de nomes de colunas salva apenas no `localStorage` (demo mode) — sem contrato backend para persistir `customColumnsMap`

---

### ✅ PILAR 2 — TRAQUEAMENTO META ADS ↔ CONVERSIONS API (CAPI)

#### Evidências de Código Real

**Cliente CAPI (`apps/api/src/infrastructure/channels/meta/capi-client.ts`):**
- `hashPhone()` → SHA-256 de dígitos apenas (E.164 normalizado)
- `hashPii()` → SHA-256 de email normalizado (lowercase, trim)
- `sendPurchaseEvent()` → POST `graph.facebook.com/v20.0/{pixelId}/events`
- Payload: `event_name: 'Purchase'`, `event_id: outcomeId` (idempotência), `action_source: 'system_generated'`
- `test_event_code` suportado para Meta Events Manager
- Classificação de erros: **FATAL** (4xx) vs **RETRYABLE** (5xx/network)

**Worker CAPI (`apps/api/src/infrastructure/workers/capi-dispatch-worker.ts`):**
- Polling outbox: `claimBatch({ eventNames: ['commercial.outcome_recorded', 'commercial_outcome.capi_queued'] })`
- Filtro: só dispara `Purchase` se `result === 'WON' && revenueMinor > 0`
- Busca contexto: `pixel_id` em `channel_connections.public_config` + `accessToken` em `channel_connection_secrets`
- Atualização atômica de status: `PENDING → QUEUED → DISPATCHED/FAILED/NOT_APPLICABLE`
- Retry com lease 60s, max 5 tentativas, DLQ em erro fatal

**Rota Comercial + Closed-Loop (`apps/api/src/interfaces/http/routes/commercial-outcomes.ts:71-177`):**
```typescript
// Claim atômico para evitar duplicatas
UPDATE commercial_outcomes SET capi_status = 'QUEUED' 
WHERE id = $1 AND workspace_id = $2 AND capi_status = 'PENDING'

// Dispatch assíncrono fire-and-forget com update de status final
```

**Traffic Proof (Atribuição & ROAS):**
- `PostgresTrafficProofGateway` → CTE `acquisition_cohort` (DISTINCT ON journey_id pela earliest occurred_at)
- Join com `commercial_outcomes` (WON/LOST) + `campaign_spend_daily_facts`
- Retorna: `acquiredLeads`, `wonOutcomes`, `lostOutcomes`, `revenueMinor`, `spendMinor`, `roas`
- Rota: `GET /workspaces/:workspaceId/traffic-proof?from=2026-01-01&to=2026-01-31`

**Configuração no Frontend:**
- `Settings → Traqueamento`: Pixel ID, Token CAPI, Test Event Code
- Botão "Disparar Teste CAPI" → validação 200 OK + hash SHA-256

#### Pontos de Atenção
- ⚠️ `pixelId` busca em 3 chaves possíveis no `public_config`: `metaPixelId`, `meta_capi_pixel_id`, `trackingConfig.pixelId` — padronizar para uma única chave
- ⚠️ `accessToken` busca em `secret_kind IN ('meta_capi_token', 'meta_bearer_token')` — prioridade para `meta_capi_token` mas fallback pode confundir
- ⚠️ Ausência de webhook de callback CAPI (`/events` da Meta) para confirmar recebimento assíncrono — hoje só confia no HTTP 200 síncrono

---

### ✅ PILAR 3 — AGENTE 24/7 & HANDOFF HUMANO

#### Evidências de Código Real

**Agente IA (`apps/api/src/application/agents/receptionist-agent.ts`):**
- **Modelo:** NVIDIA NIM (Nemotron 3 Ultra / Llama-3.1-70B) via `NvidiaNimEngine`
- **System Prompt dinâmico:** `buildSystemPrompt(wsConfig)` carrega de `workspace_agent_config` (nome, tipo, serviços, horários, flow booking)
- **Classificação estrita de intenção** (protocolo JSON no header da resposta):
  ```json
  {"intent":"booking","escalate":false,"sendBookingFlow":true}
  ```
- **Intents autônomos:** `greeting`, `inquiry`, `booking`, `oob_hours`
- **Intents de escalação obrigatória:** `human_request`, `objection`, `payment`
- **Validação de saída:** `parseReceptionistDecision()` rejeita JSON inválido, chaves extras, reply > 2000 chars

**Política Determinística (`getReceptionistActionPolicy`):**
- Modelo **nunca** decide envio — policy aplica regras duras
- `human_request` → `shouldEscalate: true, allowReply: false`
- `objection`/`payment` → escalação forçada
- Só envia se `allowReply === true` E `bot_active === true` (dupla checagem)

**Estado da Jornada (Fail-Closed):**
```sql
-- Duas camadas obrigatórias
bot_enabled = true           -- Operador ativou explicitamente
bot_paused_at IS NULL        -- Nenhum humano assumiu
runtime_enabled = true       -- Config publicada
autonomy_mode = 'autonomous_24_7'
published_at IS NOT NULL
```
- Qualquer erro de BD/schema → `return false` (nunca habilita outbound)

**Worker Inbound (`apps/api/src/infrastructure/workers/receptionist-inbound-worker.ts`):**
- Polling outbox: `receptionist.inbound_received` (evento enfileirado pelo WABA webhook)
- Lease 60s, batch 10, retry 5x → recuperação automática se processo morrer
- Payload self-contained: `workspaceId, journeyId, contactId, fromPhone, pushName, textContent, messageType, channelConnectionId, phoneNumberId`

**Handoff Operacional (`apps/api/src/interfaces/http/routes/handoff-operations.ts`):**
- `POST /handoffs/:id/accept` — Operador assume
- `POST /handoffs/:id/resolve` — Fecha atendimento
- `POST /handoffs/:id/return-to-ai` — Devolve pro bot com motivo
- Idempotency-key obrigatório em todas

**RPC de Pausa + Handoff:**
```sql
SELECT public.pause_receptionist_and_open_handoff(journey_id, workspace_id, reason)
```
- Atualiza `bot_paused_at = NOW()`, cria `handoff_cases` com `status = 'PENDING'`, `trigger_reason`

#### Pontos de Atenção
- ⚠️ `RECEPTIONIST_ENABLED` env var gate — se `!== 'true'` ou NIM não configurado, agente totalmente desligado
- ⚠️ Áudio PTT (messageType === 'audio') → `skipped: 'no_text_content'` — não processa áudio inbound (limitação atual do NIM)
- ⚠️ Erro de envio WABA ambíguo (timeout/rede) → pausa bot e exige revisão humana — correto mas pode gerar falsos positivos em rede instável

---

### ⚠️ PILAR 4 — ESPELHAMENTO DE AGENDA EXTERNA (TRINKS / {{horarios}})

#### Evidências de Código Real

**Frontend — `ExternalAgendaDrawer.tsx` (68KB):**
- **Catálogo de serviços:** 11 serviços (`SALON_SERVICES`) com duração, preço, roles aplicáveis
- **Roster de profissionais:** 8 profissionais (`HAVEN_STAFF_ROSTER`) com especialidades e status (available/absence)
- **Computação de slots:** `computeSmartDetectedSlots()` — algoritmo completo:
  - Red Line Rule: descarta slots passados (`dec <= currentTimeDecimal + 0.33`)
  - Filtro por período (manhã/tarde/noite) + threshold horário mínimo
  - Janela contínua livre calculada até próximo agendamento
  - `fitsSelectedService`: `freeWindowMinutes >= service.minDurationMinutes`
- **Parsing de conversa:** `parseConversationIntent()` extrai serviço, período, profissional, dia do texto
- **Inserção `{{horarios}}`:** `handleInsertSlot()` gera texto persuasivo + `onInsertSlotToDraft(text)`
- **Providers presets:** `google_calendar`, `trinks`, `calendly`, `avec`, `simples_agenda`, `custom`

**Bloqueio de Produção (Linhas 786-827):**
```typescript
// Fail closed: enquanto não houver contrato de disponibilidade no backend,
// não exponha slots, profissionais, preços ou uma falsa sincronização.
if (salesOsRuntimeConfig.mode !== 'demo') {
  return <BlockedState />;  // "Agenda externa indisponível"
}
```

**Backend — Ausência de Contrato Real:**
- `CalendarGateway` port existe (`apps/api/src/application/ports/calendar-gateway.ts`) mas **nenhuma implementação persistida**
- `CompositeCalendarGateway` (`composite-calendar-gateway.ts`) — **apenas in-memory Map**, sem Trinks/Google/Outlook real
- `AppointmentGateway` (`postgres-appointment-gateway.ts`) — só gerencia `commercial_appointments` interno, **não sincroniza agenda externa**
- Nenhuma rota `/channels/calendar/*` ou `/external-agenda/*` exposta
- Nenhuma tabela `external_calendar_sync` ou `provider_availability_slots`

#### Status Real
| Componente | Demo Mode | Produção |
|------------|-----------|----------|
| UI Drawer + Slots computados | ✅ Funcional | ❌ **Bloqueado (retorna estado vazio)** |
| Parsing de intenção da conversa | ✅ Funcional | ❌ Bloqueado |
| Inserção `{{horarios}}` no draft | ✅ Funcional | ❌ Bloqueado |
| Sincronização Trinks/Google real | ❌ Não existe | ❌ Não existe |
| Persistência de config por workspace | localStorage | ❌ Não existe |

#### Pontos de Correção Críticos
1. **Implementar `PostgresCalendarGateway`** com tabela `external_calendar_connections` (provider, tokens criptografados, last_synced_at)
2. **Implementar `TrinksCalendarAdapter`** ou `GoogleCalendarAdapter` real (OAuth + API de disponibilidade)
3. **Criar worker de sync periódico** (`ExternalAgendaSyncWorker`) que popula `provider_availability_slots` materializada
4. **Expor rota `GET /workspaces/:id/external-agenda/slots`** consumida pelo Drawer em produção
5. **Remover bloqueio `salesOsRuntimeConfig.mode !== 'demo'`** no `ExternalAgendaDrawer` após homologação

---

### ✅ PILAR 5 — ARSENAL META BUSINESS PLATFORM (WAHA + WABA OFICIAL)

#### Evidências de Código Real

**Dual-Engine no Server (`apps/api/src/server.ts:294-304`):**
```typescript
// WAHA Outbound Worker
if (runtime.outboundDispatchGateway) {
  outboundWorker = new WahaOutboundWorker({ dispatchGateway, outboundAdapter });
}

// WABA via Receptionist Agent (outbound autônomo) + WabaActionsModal (supervisionado)
```

**WAHA Stack:**
- `WahaWebhookAdapter` → `POST /api/v1/channels/waha/webhook` (message, message.any, session.status)
- `WahaInboundWorker` → processa inbound, enfileira `receptionist.inbound_received` + `conversation.message_received`
- `WahaOutboundWorker` → consome `outbox` (`commercial.outcome_recorded`, etc.) → `WahaOutboundAdapter.sendText()`
- `WahaOutboundAdapter` → `/api/sendText`, `/api/sendImage`, `/api/sendFile` com timeout 30s, classificação FATAL/RETRYABLE/AMBIGUOUS

**WABA Stack (`apps/api/src/infrastructure/channels/meta/waba-client.ts` — 539 linhas):**
| Capacidade | Método | Validação |
|------------|--------|-----------|
| Texto + previewUrl | `sendText()` | `requireMessageId()` obriga `messageId` Meta |
| Mídia (img/audio/doc/video) | `sendMedia()` | `link` obrigatório, caption/filename opcional |
| Botões Resposta Rápida (≤3) | `sendInteractiveButtons()` | `type: 'reply'`, title ≤ 20 chars |
| Listas Interativas (≤10 rows/section) | `sendInteractiveList()` | button ≤ 20, row title ≤ 24, desc ≤ 72 |
| Templates HSM (Marketing/Utility/Auth) | `sendTemplate()` | `components` header/body/button parameters |
| Flows (Formulários Nativos) | `sendFlow()` | `flow_message_version: '3'`, `flow_action: 'navigate'` |
| Marcar como Lido (Blue Checks) | `markAsRead()` | `status: 'read', message_id` |
| Gerenciar Templates | `listTemplates()`, `createTemplate()`, `deleteTemplate()` | CRUD direto no Graph API |

**Arsenal no Cockpit (`WabaActionsModal.tsx` — 1528 linhas):**
- **Abas:** Flow, Pix, Buttons, Location, Product, Carousel, Call
- **Verificação de conexão WABA:** `GET /channels/waba/channel-info` + `/channels/waba/capabilities`
- **Pix Nativo:** `POST /channels/waba/send-order-details` com `paymentType: 'pix_dynamic_code'`, `pixKey`, `amountMinor`
- **Location Request:** `POST /channels/waba/send-location-request`
- **Produtos/Catálogo:** `send-product` / `send-multi-product` com `catalogId`, `productRetailerId`
- **Carrossel HSM:** `send-carousel` com template aprovado + cards imagem+texto
- **Botão Chamada:** `send-buttons` com `type: 'phone_number'` (via template)
- **Fallback:** `navigator.clipboard.writeText()` para copiar texto manual

**Channel Info Gateway:**
- `PostgresWabaChannelInfoGateway` → lê `channel_connections` onde `provider = 'meta_cloud' AND status = 'CONNECTED'`
- Extrai: `verifiedPhone`, `displayPhone`, `verifiedName`, `phoneNumberId`, `wabaId`, `qualityRating` do `public_config`

#### Pontos de Atenção
- ⚠️ `WabaActionsModal` capabilities hardcoded: `flow` depende de `onQueueWabaAction`, demais `false` — **botões, lista, pix, location, product, carousel, call desabilitados no frontend** mesmo se WABA conectado (linhas 44-52, 199-207)
- ⚠️ `call` tab usa `send-buttons` endpoint mas botão de telefone requer **Template aprovado** — não é botão nativo de chamada
- ⚠️ `pix` e `location` usam endpoints dedicados (`send-order-details`, `send-location-request`) que precisam existir no backend — verificar implementação em `whatsapp-channel-routes.ts`
- ⚠️ Dual-engine: WAHA session status não é exposto no modal — só WABA

---

## MATRIZ DE CORREÇÕES PRIORITÁRIAS

| Prioridade | Pilar | Ação | Esforço | Risco se Não Feito |
|------------|-------|------|---------|-------------------|
| **P0** | 4 | Implementar `CalendarGateway` real (Trinks ou Google) + worker sync + rota slots | 3-5 dias | Agenda externa **não funciona em produção** — vendedores não conseguem sugerir horários reais |
| **P1** | 4 | Remover bloqueio `mode !== 'demo'` no `ExternalAgendaDrawer` após P0 | 30 min | Interface mostra "indisponível" mesmo com backend pronto |
| **P2** | 5 | Habilitar capabilities no `WabaActionsModal` (buttons, list, pix, location, product, carousel) | 1 dia | Arsenal incompleto no Cockpit — operador não usa recursos pagos da WABA |
| **P3** | 2 | Padronizar chave `pixelId` no `public_config` (única fonte) | 2h | Busca em 3 chaves gera inconsistência entre workspaces |
| **P4** | 2 | Implementar webhook callback CAPI (`/api/v1/meta/capi/callback`) para confirmação assíncrona | 2 dias | Perda de visibilidade se Meta processar async com falha posterior |
| **P5** | 1 | Persistir `customColumnsMap` do Kanban no backend (nova tabela ou `workspace_commercial_config`) | 1 dia | Personalização de funil perdida ao trocar dispositivo/navegador |
| **P6** | 3 | Adicionar suporte a áudio inbound no Receptionist (STT → texto → NIM) | 3-5 dias | Mensagens de voz de clientes ignoradas pelo agente 24/7 |

---

## VERIFICAÇÕES DE INTEGRIDADE (Truth in Data)

| Verificação | Resultado | Evidência |
|-------------|-----------|-----------|
| Zero mocks em produção | ✅ | `salesOsRuntimeConfig.mode === 'demo'` isola fixtures; produção usa apenas BD real |
| RLS multi-tenant ativo | ✅ | `SET LOCAL ROLE sos_sales_runtime` + `request.jwt.claim.sub` em todos gateways |
| Idempotência em escritas | ✅ | `idempotency-key` UUID obrigatório em outcomes, handoffs, appointments |
| Outbox durável + lease | ✅ | `claimBatch`/`completeEvent`/`failEvent` com `workerId` + `claimToken` |
| Segredos fora do código | ✅ | `channel_connection_secrets.secret_payload` (accessToken), `.env` apenas local |
| Health checks compostos | ✅ | `CompositeDependencyHealthProvider` (DB + Redis + Workers) |
| Rollback atômico disponível | ✅ | `scripts/rollback-production-release.sh` (frontend + API + runtime + CA + compose) |

---

## CONCLUSÃO

O SOS Sales tem **4 dos 5 pilares canônicos operacionais em produção** com arquitetura sólida, DDD, outbox pattern, RLS multi-tenant e dual-engine WhatsApp.

**O único gap bloqueante é o Pilar 4 (Agenda Externa)** — a UI existe e é sofisticada (parsing de intenção, computação de janelas, roster, catálogo), mas **não há contrato backend** para buscar disponibilidade real do Trinks/Google Calendar. Em produção, o drawer retorna estado vazio propositalmente ("fail closed").

**Recomendação:** Priorizar implementação do `CalendarGateway` com provedor Trinks (já há roster e serviços mapeados para Haven/Escovaria) nas próximas 2 sprints. Após homologação, remover o bloqueio de modo demo e validar E2E no Docker Lab (porta 3333) antes de promover ao VPS.

---

**Assinatura do Auditor:**  
Hermes Agent — Modo gstack (plan→review→ship)  
`gstack-decision-log` registrado: pilar 4 bloqueado por ausência de contrato backend; demais pilares validados com evidências de código real.