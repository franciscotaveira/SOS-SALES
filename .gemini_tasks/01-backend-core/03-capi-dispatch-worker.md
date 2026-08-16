# PROMPT PARA GEMINI — Task 3: CAPI Dispatch Worker

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Branch: `codex/import-latest-zip`
Dependência: `commercial_outcome` já tem campo `capiStatus` (enum: `NOT_QUEUED`, `QUEUED`, `SENT`, `ACKNOWLEDGED`, `FAILED`) — hoje sempre `NOT_QUEUED`

## OBJETIVO
Implementar **CAPI Dispatch Worker** que:
1. Escuta outbox event `commercial_outcome.capi_queued` (criado quando outcome = WON)
2. Envia evento `Purchase` para Graph API `/{pixel_id}/events`
3. Atualiza `commercial_outcome.capiStatus` + `capiEventId` + `capiError`
4. Retry/DLQ com backoff exponencial

## ARQUIVOS A CRIAR

### 1. `apps/api/src/application/ports/capi-dispatch-gateway.ts`
```typescript
interface CapiDispatchGateway {
  queueForDispatch(outcomeId: string): Promise<void>;        // cria outbox event
  dispatchNow(outcomeId: string): Promise<DispatchResult>;   // envio imediato (admin)
}

interface DispatchResult {
  success: boolean;
  capiEventId?: string;
  errorCode?: string;
  errorMessage?: string;
}
```

### 2. `apps/api/src/infrastructure/channels/meta/capi-client.ts`
- HTTP client para `POST https://graph.facebook.com/v20.0/{pixel_id}/events`
- Payload `Purchase`:
  ```json
  {
    "data": [{
      "event_name": "Purchase",
      "event_time": <unix_timestamp>,
      "event_id": "<outcome_id>",                    // dedup Meta (UUID do outcome)
      "action_source": "physical_store",
      "event_source_url": "https://sos.mct.com.br",
      "user_data": { "ph": "<hash_phone_e164>", "em": "<hash_email>" },
      "custom_data": {
        "currency": "BRL",
        "value": <revenue_minor / 100>,
        "content_ids": ["<product_or_service_id>"],
        "contents": [{ "id": "<product_id>", "quantity": 1, "item_price": <value> }]
      }
    }],
    "test_event_code": "TEST_12345"   // apenas em staging
  }
  ```
- Hash PII: SHA-256 (phone E.164 sem `+`, email lowercase)
- Auth: **Pixel Access Token** (System User + `ads_management` permission)

### 3. `apps/api/src/infrastructure/workers/capi-dispatch-worker.ts`
- Poll outbox events com `eventName = 'commercial_outcome.capi_queued'`
- Claim batch + `claim_token` fencing (padrão existente)
- Para cada outcome:
  1. Buscar outcome + journey + contact (phone/email) + workspace pixel_id
  2. Montar payload `Purchase` com `event_id = outcome.id`
  3. Enviar via `CapiClient`
  4. Atualizar `commercial_outcome`: `capiStatus`, `capiEventId`, `capiError`, `capiDispatchedAt`
  5. Completar outbox event
- Retry: exponencial 1m, 5m, 15m, 1h, 6h (max 5) → DLQ (`capiStatus = FAILED`)
- **NÃO retry** em 4xx (invalid payload, permission denied) → direto FAILED

### 4. `apps/api/src/infrastructure/database/postgres-capi-dispatch-gateway.ts`
- Implementa `CapiDispatchGateway`
- `queueForDispatch`: INSERT outbox event
- `dispatchNow`: chamada direta (bypass worker) para admin/retry manual

### 5. Migration: `20260814000009_capi_dispatch_enhancements.sql` (se necessário)
- Índices em `commercial_outcome(capiStatus)` para worker query
- Constraint `event_id` único por pixel (Meta dedup)

### 6. Testes
- `apps/api/tests/integration/capi-dispatch-worker.test.ts`
- Mock Graph API: success → `ACKNOWLEDGED`, 4xx → `FAILED`, 5xx → retry
- Test dedup: mesmo `event_id` reenviado → Meta retorna `event_id` duplicado → idempotente

## REQUISITOS TÉCNICOS

| Requisito | Detalhe |
|-----------|---------|
| **Event ID** | `outcome.id` (UUID) — garante dedup Meta nativo |
| **Hash PII** | Phone: SHA-256(E.164 sem `+`), Email: SHA-256(lowercase) |
| **Value** | `revenueMinor / 100` (float com 2 casas) |
| **Currency** | Sempre `BRL` (hardcoded por enquanto) |
| **Test Event Code** | Apenas em `NODE_ENV !== 'production'` |
| **Pixel ID** | Vem de `workspace_settings.meta_capi_pixel_id` (nova coluna ou settings JSON) |
| **Access Token** | `META_CAPI_ACCESS_TOKEN` via env (System User + ads_management) |
| **Idempotência** | Outbox claim_token + Meta `event_id` = duplo fence |

## INTEGRAÇÃO EXISTENTE

- `PostgresCommercialOutcomeGateway.record()` → após outcome WON, chamar `CapiDispatchGateway.queueForDispatch(outcomeId)`
- `outbox_events` já existe (migration 00002) — novo `eventName = 'commercial_outcome.capi_queued'`
- `PostgresOutboxProcessingGateway` já processa — worker usa mesmo padrão

## CRITÉRIO DE ACEITE

1. `npm run check` verde
2. Outcome WON criado → worker pega → CAPI enviado → `capiStatus = ACKNOWLEDGED`
3. Meta Events Manager mostra evento `Purchase` com `event_id` = outcome UUID
4. Reprocessar mesmo outcome → não duplica (Meta dedup + outbox claim)
5. Erro 403 (token inválido) → `capiStatus = FAILED` (sem retry)
6. Timeout/5xx → retry exponencial → após max → `FAILED` + DLQ log

## COMANDOS

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES
npm run check
cd apps/api
npm run test:integration -- capi-dispatch-worker
```

---

**DÚVIDAS PARA ESCLARECER:**
1. `workspace_settings.meta_capi_pixel_id` já existe? Se não, adicionar coluna ou usar `settings` JSONB?
2. Pixel Access Token: Francisco já tem System User com `ads_management`?
3. `test_event_code`: valor fixo ou gerar por workspace?