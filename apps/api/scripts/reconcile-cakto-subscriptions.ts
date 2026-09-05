import { CaktoGateway } from '../src/infrastructure/billing/cakto-gateway.js';
import { PostgresCaktoBilling, type CaktoOrderData, type CaktoWebhookPayload } from '../src/infrastructure/billing/postgres-cakto-billing.js';
import { dbPool } from '../src/infrastructure/database/pool.js';

type OrderPage = { count?: number; next?: string | null; results?: Array<CaktoOrderData & { createdAt?: string }> };

function eventFor(order: CaktoOrderData): string {
  switch (order.status) {
    case 'refunded': return 'refund';
    case 'chargedback': return 'chargeback';
    case 'canceled': return 'subscription_canceled';
    case 'refused': return 'subscription_renewal_refused';
    default: return 'purchase_approved';
  }
}

async function main(): Promise<void> {
  const gateway = new CaktoGateway();
  if (!gateway.isConfigured()) throw new Error('CAKTO_CLIENT_ID and CAKTO_CLIENT_SECRET are required');
  const billing = new PostgresCaktoBilling(dbPool, Math.max(0, Number(process.env.CAKTO_PAST_DUE_GRACE_DAYS || 7)));
  const maxPages = Math.max(1, Number(process.env.CAKTO_RECONCILIATION_MAX_PAGES || 100));
  const orders: Array<CaktoOrderData & { createdAt?: string }> = [];

  for (let page = 1; page <= maxPages; page += 1) {
    const response = await gateway.listOrders<OrderPage>(new URLSearchParams({
      type: 'subscription',
      ordering: 'createdAt',
      limit: '100',
      page: String(page),
    }).toString());
    orders.push(...(response.results || []));
    if (!response.next) break;
  }

  orders.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));
  const totals = { processed: 0, duplicates: 0, ignored: 0 };
  for (const order of orders) {
    const payload: CaktoWebhookPayload = { event: eventFor(order), data: order };
    const result = await billing.ingest(payload, Buffer.from(JSON.stringify(payload)));
    totals.processed += result.processed;
    totals.duplicates += result.duplicates;
    totals.ignored += result.ignored;
  }
  console.log(JSON.stringify({ provider: 'cakto', scanned: orders.length, ...totals }));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => dbPool.end());

