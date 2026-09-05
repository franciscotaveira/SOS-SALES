import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { dbPool } from '../../src/infrastructure/database/pool.js';
import { PostgresCaktoBilling, type CaktoWebhookPayload } from '../../src/infrastructure/billing/postgres-cakto-billing.js';

describe('Cakto subscription billing persistence', () => {
  const planId = 'ca000000-0000-4000-8000-000000000001';
  const productId = 'ca000000-0000-4000-8000-000000000002';
  const offerId = 'offer-cakto-test';
  const subscriptionId = 'subscription-cakto-test';
  const billing = new PostgresCaktoBilling(dbPool, 7);

  beforeAll(async () => {
    await dbPool.query(
      `INSERT INTO public.billing_plans
        (id, code, name, tier, provider_product_id, provider_offer_id, checkout_url,
         amount_minor, interval_unit, active)
       VALUES ($1, 'cakto-test', 'Cakto Test', 'standard', $2, $3,
         'https://pay.cakto.com.br/test', 19700, 'month', true)
       ON CONFLICT (id) DO UPDATE SET active = true`,
      [planId, productId, offerId],
    );
  });

  afterAll(async () => {
    await dbPool.query("DELETE FROM public.billing_webhook_events WHERE provider_event_key LIKE '%cakto-test%'");
    await dbPool.query('DELETE FROM public.workspace_subscriptions WHERE billing_plan_id = $1', [planId]);
    await dbPool.query('DELETE FROM public.billing_plans WHERE id = $1', [planId]);
    await dbPool.end();
  });

  function payload(event: string, orderId: string): CaktoWebhookPayload {
    return {
      event,
      data: {
        id: orderId,
        status: event === 'subscription_renewal_refused' ? 'refused' : 'paid',
        paymentMethod: 'credit_card',
        customer: { id: 'customer-cakto-test', name: 'Cliente Cakto', email: 'CLIENTE@EXAMPLE.TEST' },
        product: { id: productId, name: 'SOS Vendas' },
        offer: { id: offerId, name: 'Plano mensal' },
        subscription: {
          id: subscriptionId,
          status: 'active',
          current_period: event === 'subscription_renewal_refused' ? 2 : 1,
          next_payment_date: '2026-10-05T12:00:00Z',
        },
      },
    };
  }

  it('creates one subscription, deduplicates delivery, and updates it on a new renewal order', async () => {
    const approved = payload('purchase_approved', 'order-cakto-test-1');
    expect(await billing.ingest(approved, Buffer.from(JSON.stringify(approved)))).toEqual({ processed: 1, duplicates: 0, ignored: 0 });
    expect(await billing.ingest(approved, Buffer.from(JSON.stringify(approved)))).toEqual({ processed: 0, duplicates: 1, ignored: 0 });

    const refused = payload('subscription_renewal_refused', 'order-cakto-test-2');
    expect(await billing.ingest(refused, Buffer.from(JSON.stringify(refused)))).toEqual({ processed: 1, duplicates: 0, ignored: 0 });

    const persisted = await dbPool.query(
      `SELECT provider_order_id, customer_email, status, current_period,
              access_until > NOW() + INTERVAL '6 days' AS has_grace
       FROM public.workspace_subscriptions WHERE provider_subscription_id = $1`,
      [subscriptionId],
    );
    expect(persisted.rows).toHaveLength(1);
    expect(persisted.rows[0]).toMatchObject({
      provider_order_id: 'order-cakto-test-2',
      customer_email: 'cliente@example.test',
      status: 'past_due',
      current_period: 2,
      has_grace: true,
    });
  });
});

