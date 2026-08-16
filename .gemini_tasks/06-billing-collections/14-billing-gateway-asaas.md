# PROMPT PARA GEMINI — Task 14: Billing Gateway + Asaas Adapter (Onda 1)

## CONTEXTO
Projeto: SOS Sales (TX Commercial Core)
Pós-MVP: `commercial_outcome` (WON + revenueMinor) + `known_facts` + `outbound_dispatch` prontos
Objetivo: **Cobrança automatizada** — criar cobrança, monitorar pagamento, atualizar status, comunicar via WhatsApp

## ARQUIVOS A CRIAR

### 1. Port: `apps/api/src/application/ports/billing-gateway.ts`
```typescript
interface BillingGateway {
  createCharge(input: CreateChargeInput): Promise<ChargeResult>;
  getChargeStatus(chargeId: string): Promise<ChargeStatus>;
  cancelCharge(chargeId: string): Promise<void>;
  // Webhook handler chamado pelo adapter
  handleWebhook(provider: string, payload: unknown, signature: string): Promise<WebhookResult>;
}

interface CreateChargeInput {
  workspaceId: string;
  customerId: string;           // journeyId ou contactId
  amountMinor: number;          // centavos
  dueDate: string;              // ISO date
  description: string;
  paymentMethods: ('PIX' | 'BOLETO' | 'CREDIT_CARD')[];
  metadata?: Record<string, string>; // outcomeId, journeyId, etc.
}

interface ChargeResult {
  chargeId: string;             // ID do provedor (Asaas, Stripe, etc.)
  paymentUrl: string;           // Link para cliente pagar
  qrCodePix?: string;           // Pix copia-e-cola
  expiresAt: string;
}

type ChargeStatus = 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED' | 'PARTIAL' | 'REFUNDED';

interface ChargeStatusResult {
  status: ChargeStatus;
  paidAt?: string;
  paidAmountMinor?: number;
  providerData: unknown;
}

interface WebhookResult {
  chargeId: string;
  status: ChargeStatus;
  paidAt?: string;
}
```

### 2. Adapter Asaas: `apps/api/src/infrastructure/integrations/billing/asaas-adapter.ts`
```typescript
// Asaas API v3
// Docs: https://docs.asaas.com/
class AsaasBillingAdapter implements BillingGateway {
  private client: AsaasClient; // HTTP client com auth header
  
  async createCharge(input: CreateChargeInput): Promise<ChargeResult> {
    // 1. Criar/obter customer no Asaas (CPF/CNPJ + email + phone)
    // 2. POST /v3/payments com billingType: PIX/BOLETO/CREDIT_CARD
    // 3. Retornar chargeId + paymentUrl + pixQrCode
  }
  
  async getChargeStatus(chargeId: string): Promise<ChargeStatusResult> {
    // GET /v3/payments/{id}
  }
  
  async cancelCharge(chargeId: string): Promise<void> {
    // DELETE /v3/payments/{id}
  }
  
  async handleWebhook(payload: unknown, signature: string): Promise<WebhookResult> {
    // Validar assinatura (ASAAS_SIGNATURE)
    // Eventos: PAYMENT_RECEIVED, PAYMENT_OVERDUE, PAYMENT_DELETED
    // Retornar { chargeId, status, paidAt }
  }
}
```

### 3. Implementação Gateway: `apps/api/src/infrastructure/integrations/billing/billing-gateway.ts`
- Factory que seleciona adapter por configuração do workspace
- Fallback: se Asaas falha, tenta AbacatePay (futuro)

### 4. Worker: `apps/api/src/infrastructure/workers/billing-sync-worker.ts`
- Poll charges `PENDING` + `OVERDUE` a cada 15min
- Chama `getChargeStatus` → atualiza `known_facts`:
  - `payment.status` = `PAID` | `OVERDUE` | `CANCELLED`
  - `payment.paidAt`, `payment.paidAmountMinor`
- Dispara `DecisionEngine` → `NextBestAction` (ex: "Enviar lembrete de cobrança")

### 5. Webhook Route: `apps/api/src/interfaces/http/routes/billing-webhooks.ts`
```typescript
// POST /webhooks/billing/asaas
// Valida signature → BillingGateway.handleWebhook() → atualiza facts
```

### 6. Integração no Outcome Flow
```typescript
// Em CommercialOutcomeGateway.record() → após WON
const charge = await billingGateway.createCharge({
  workspaceId,
  customerId: journeyId,
  amountMinor: outcome.revenueMinor,
  dueDate: addDays(new Date(), 30).toISOString(),
  description: `Venda - ${journey.contactName}`,
  paymentMethods: ['PIX', 'BOLETO'],
  metadata: { outcomeId: outcome.id }
});

// Salvar chargeId em known_facts: payment.chargeId, payment.dueDate, payment.provider=asaas
```

### 7. UI: "Contas a Receber" (Task futura - Frontend)
- Lista: `known_facts` com `payment.status` + `payment.dueDate`
- Filtros: Vencidas, A vencer (7d), Parceladas
- Ações: "Enviar link pagamento", "Marcar como pago (manual)", "Cancelar"

## REQUISITOS TÉCNICOS

| Requisito | Detalhe |
|-----------|---------|
| **Idempotência** | `Idempotency-Key` = `outcomeId` ao criar cobrança |
| **Moeda** | Sempre centavos (BIGINT) — Asaas usa reais, converter |
| **Webhook Seguro** | Validar `ASAAS_SIGNATURE` (HMAC-SHA256) |
| **Multi-provider** | Config por workspace: `billing.provider = 'asaas' | 'abacatepay' | 'stripe'` |
| **LGPD** | Dados sensíveis (CPF) apenas no provedor — gateway guarda só `customerId` do provedor |

## CRITÉRIO DE ACEITE

1. `npm run check` verde
2. Outcome WON → cobrança criada no Asaas sandbox → `paymentUrl` gerado
3. Outbound Worker envia WhatsApp com link de pagamento
4. Pagamento no sandbox → webhook recebido → `payment.status = PAID` em known_facts
5. Traffic Proof reflete revenue realizado (não só esperado)
6. Worker de sincronização pega charge `OVERDUE` → DecisionEngine sugere cobrança

## COMANDOS

```bash
cd /Users/franciscotaveira.ads/Projetos/SOS-SALES
npm run check
# Testar sandbox Asaas:
# ASAAS_API_KEY=... ASAAS_WEBHOOK_SECRET=... npm run dev
```