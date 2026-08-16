# PROMPT PARA GEMINI — Task 1: WAHA Outbound Worker

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Branch: `codex/import-latest-zip` (HEAD: `081634e`)
Ambiente: Local apenas (WAHA container porta 3002 no docker-compose.yml)
Baseline: 191/191 testes passando, health 10/10, @review APROVADO

## OBJETIVO
Implementar o **WAHA Outbound Worker** que processa a state machine de envio supervisionado:
`draft` → `approved` → `queued` → `sent` / `failed` / `delivered` / `read`

## ARQUIVOS A CRIAR

### 1. `apps/api/src/infrastructure/channels/waha/waha-outbound-adapter.ts`
- HTTP client para WAHA API (`POST /api/sendText`, `POST /api/sendMedia`, etc.)
- Assinatura HMAC-SHA512 para outbound (mesmo padrão inbound)
- Tratamento de erros: 4xx = não retry, 5xx/timeout = retry com backoff
- Retorna `providerMessageId` + status inicial

### 2. `apps/api/src/infrastructure/workers/waha-outbound-worker.ts`
- Poll `outbox_events` com `eventName = 'outbound.dispatch_queued'`
- Claim batch com `claim_token` fencing (padrão existente)
- Para cada evento:
  1. Buscar `outbound_dispatch` payload
  2. Chamar `WahaOutboundAdapter.sendText()`
  3. Atualizar status via `OutboundDispatchGateway` (`queued`→`sent`/`failed`)
  4. Completar outbox event
- Callbacks WAHA (webhook `message.ack`, `message.sent`, `message.delivered`, `message.read`, `message.failed`) → atualizar `outbound_dispatch` status

### 3. `apps/api/src/application/ports/outbound-dispatch-gateway.ts` (estender)
- Métodos: `updateDispatchStatus(dispatchId, status, providerMessageId?)`, `recordProviderEvent(dispatchId, eventType, payload)`

### 4. `apps/api/src/infrastructure/database/postgres-outbound-dispatch-gateway.ts` (implementar)
- SQL para updates de status + provider_message_id
- RLS: apenas `service_role` (worker) ou `owner`/`operator` do workspace

### 5. Testes de Integração
- `apps/api/tests/integration/waha-outbound-worker.test.ts`
- Cenários: draft→approve→queued→sent→delivered, retry em 5xx, DLQ em 4xx, timeout ambíguo = AMBIGUOUS (não retry cego)

## REQUISITOS TÉCNICOS OBRIGATÓRIOS

| Requisito | Detalhe |
|-----------|---------|
| **Idempotência** | `Idempotency-Key` no draft → `providerMessageId` único → reconciliação se WAHA não retornar ID |
| **Timeout Ambíguo** | Se WAHA não responde em 30s → status `AMBIGUOUS` → **NÃO retry automático** → alerta para revisão humana |
| **Kill Switch** | Antes de enviar: verificar `channel_connections.status !== 'CONNECTED'` ou `paused_by` → bloquear |
| **Aprovação Humana** | Worker só processa `approved` (nunca `draft` ou `pending_approval`) |
| **Retry Policy** | Exponencial: 1m, 5m, 15m, 1h, 6h (max 5) → DLQ. Só em erro 5xx/network. |
| **Callbacks** | Webhook `message.ack/sent/delivered/read/failed` → atualiza `outbound_dispatch` + `outbox_events` para projeções |
| **Segurança** | Zero secrets no código. `WAHA_API_KEY` / `WAHA_WEBHOOK_SECRET` via env. |

## INTEGRAÇÃO EXISTENTE (NÃO QUEBRAR)

- `PostgresOutboundDispatchGateway` já existe (migration 00005)
- `OutboundDispatchGateway` port já definida
- `OutboundDispatchRoutes` já expõem: `POST /drafts`, `POST /approve`, `POST /cancel`, `GET /dispatches/:id`
- `WahaWebhookAdapter` já valida HMAC inbound — reutilizar padrão para outbound callbacks
- `CompositeDependencyHealthProvider` já monitora `worker` — adicionar health check do outbound worker

## CRITÉRIO DE ACEITE (Definition of Done)

1. **Testes passam**: `npm run check` → 191+ testes (novos incluídos)
2. **Build OK**: `npm run build` (API + Web)
3. **Fluxo manual validado**:
   - Criar draft via API (`POST /outbound-drafts`)
   - Aprovar (`POST /approve`)
   - Worker pega → envia WAHA → status `sent`
   - Callback WAHA → status `delivered` → `read`
4. **Timeout ambíguo testado**: Mock WAHA delay >30s → status `AMBIGUOUS` (não `sent`, não retry)
5. **Kill switch testado**: Canal pausado → worker não envia, marca `blocked`
6. **Zero console errors** no `@browse` do fluxo completo

## ARQUIVOS DE REFERÊNCIA (LER ANTES DE CODIFICAR)

- `apps/api/src/infrastructure/workers/waha-inbound-worker.ts` (padrão worker + claim_token)
- `apps/api/src/infrastructure/channels/waha/waha-webhook-adapter.ts` (padrão HMAC + WAHA API)
- `apps/api/src/infrastructure/database/postgres-outbound-dispatch-gateway.ts` (implementação atual)
- `apps/api/src/application/ports/outbound-dispatch-gateway.ts` (port interface)
- `apps/api/src/domain/types/index.ts` (tipos: `OutboundDispatch`, `OutboundStatus`, `OutboxEvent`)
- `apps/api/supabase/migrations/20260814000005_supervised_waha_outbound.sql` (schema)

## COMANDOS DE VALIDAÇÃO

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES
npm run check                    # 191+ testes, typecheck, build
cd apps/api
npm run test:integration -- waha-outbound-worker  # testes específicos
```

## ENTREGA
- Commits pequenos por arquivo (adapter → worker → gateway → tests)
- `git diff --check` antes de cada commit
- Push para `origin/codex/import-latest-zip`

---

**DÚVIDAS TÉCNICAS PARA ESCLARECER ANTES DE CODIFICAR (responda se houver):**
1. WAHA engine para outbound: `WEBJS` (atual) ou testar `GOWS`/`NOWEB` para correlation ID?
2. Payload WAHA `sendText`: campos obrigatórios além de `chatId` + `text`?
3. Callback webhook path: reusar `/webhooks/waha` ou path dedicado `/webhooks/waha/outbound`?

Se tudo claro, **inicie a implementação**.