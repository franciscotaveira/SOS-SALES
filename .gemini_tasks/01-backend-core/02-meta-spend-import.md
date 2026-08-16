# PROMPT PARA GEMINI — Task 2: Meta Ads Spend Import Gateway

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Branch: `codex/import-latest-zip`
Dependência: Traffic Proof API já lê `campaign_spend_daily_facts` mas retorna `spend: null` ("Não importado")

## OBJETIVO
Implementar **Meta Ads Spend Import Gateway** que:
1. Busca `insights` (spend, impressions, clicks) na Marketing API v20+
2. Upsert em `campaign_spend_daily_facts` (dedup por `date + campaign_id`)
3. Roda como job agendado (cron) ou worker assíncrono

## ARQUIVOS A CRIAR

### 1. `apps/api/src/application/ports/meta-spend-import-gateway.ts`
```typescript
interface MetaSpendImportGateway {
  importDailySpend(workspaceId: string, date: string): Promise<ImportResult>;
  importDateRange(workspaceId: string, startDate: string, endDate: string): Promise<ImportResult[]>;
}

interface ImportResult {
  campaignId: string;
  date: string;
  spendMinor: number;
  impressions: number;
  clicks: number;
  importedAt: string;
}
```

### 2. `apps/api/src/infrastructure/channels/meta/meta-marketing-api-client.ts`
- HTTP client para Graph API `https://graph.facebook.com/v20.0`
- Auth: **System User Token** + **App Secret** (server-to-server, não expira)
- Rate limiting: 200 calls/hora por app (respeitar headers `x-app-usage`)
- Retry: exponencial em 5xx/429, **NÃO** em 4xx

### 3. `apps/api/src/infrastructure/database/postgres-meta-spend-gateway.ts`
- Implementa `MetaSpendImportGateway`
- Upsert em `campaign_spend_daily_facts` (PK composta: `workspace_id, campaign_id, date`)
- RLS: apenas `service_role` (worker) escreve; `operator`/`owner` leem

### 4. `apps/api/src/infrastructure/workers/meta-spend-import-worker.ts`
- Poll job queue (nova tabela `meta_spend_import_jobs` ou cron via `pg_cron`)
- Para cada workspace com `channel_connections.meta_ads_account_id` configurado
- Import date range: ontem + últimos 7 dias (backfill drift)

### 5. Migration: `20260814000008_meta_spend_import_jobs.sql` (opcional, se job queue)
- Tabela `meta_spend_import_jobs` com status, workspace_id, date_range, error_log

### 6. Testes
- `apps/api/tests/integration/meta-spend-import.test.ts`
- Mock Graph API responses (spend, impressions, clicks)
- Test dedup: mesma campaign+date importada 2x → 1 row

## REQUISITOS TÉCNICOS

| Requisito | Detalhe |
|-----------|---------|
| **Auth** | System User Token (long-lived) + App Secret — **NUNCA** user token |
| **Dedup** | PK composta `(workspace_id, campaign_id, date)` — upsert idempotente |
| **Moeda** | `spend_minor` em centavos (BIGINT) — converter de `spend` (string float) |
| **Timezone** | `date` = data no timezone do workspace (UTC-3 default) |
| **Rate Limit** | Respeitar `x-app-usage` header; backoff se >80% |
| **Erro Parcial** | Se uma campaign falha → log + continua outras; job marca `partial_success` |
| **Config** | `META_APP_ID`, `META_APP_SECRET`, `META_SYSTEM_USER_TOKEN` via env |

## INTEGRAÇÃO EXISTENTE

- `PostgresTrafficProofGateway` já lê `campaign_spend_daily_facts` → Traffic Proof UI
- `channel_connections` tem `meta_ads_account_id` (string) para mapear workspace → conta
- `LiveTrafficProofView` mostra "Não importado" se `spend_minor` null — ficará preenchido

## CRITÉRIO DE ACEITE

1. `npm run check` verde (testes novos incluídos)
2. Job manual: importar spend de ontem para workspace de teste → `campaign_spend_daily_facts` populada
3. Traffic Proof UI (`LiveTrafficProofView`) mostra valores reais (não "Não importado")
4. Re-import mesmo período → dedup OK (linhas não duplicam)
5. Rate limit respeitado (mock 429 → backoff + retry)

## COMANDOS

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES
npm run check
cd apps/api
npm run test:integration -- meta-spend-import
```

---

**DÚVIDAS PARA ESCLARECER:**
1. System User Token já provisionado? Ou criar instrução para Francisco gerar?
2. Job scheduler: `pg_cron` no Supabase (requer extensão) ou worker polling tabela?
3. Backfill inicial: importar últimos 30 dias na primeira execução?