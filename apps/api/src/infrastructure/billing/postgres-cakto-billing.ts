import { createHash } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';

export type CaktoOrderData = {
  id?: string;
  status?: string;
  paymentMethod?: string;
  paidAt?: string | null;
  refundedAt?: string | null;
  chargedbackAt?: string | null;
  canceledAt?: string | null;
  customer?: { id?: string | number; name?: string; email?: string };
  product?: { id?: string; name?: string };
  offer?: { id?: string; name?: string } | null;
  subscription?: {
    id?: string;
    status?: string;
    current_period?: number;
    next_payment_date?: string | null;
    canceledAt?: string | null;
  } | null;
};

export interface CaktoWebhookPayload {
  secret?: string;
  event?: string;
  data?: CaktoOrderData | CaktoOrderData[];
}

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const email = value.trim().toLowerCase();
  return email.includes('@') && email.length <= 320 ? email : null;
}

function eventStatus(event: string, data: CaktoOrderData): string {
  if (event === 'refund') return 'refunded';
  if (event === 'chargeback') return 'chargeback';
  if (event === 'subscription_canceled') return 'canceled';
  if (event === 'subscription_paused') return 'paused';
  if (event === 'subscription_renewal_refused') return 'past_due';
  if (event === 'purchase_refused') return 'pending';
  const providerStatus = data.subscription?.status;
  if (providerStatus === 'trial') return 'trialing';
  if (providerStatus === 'canceled') return 'canceled';
  if (providerStatus === 'expired') return 'expired';
  if (providerStatus === 'paused') return 'paused';
  return ['purchase_approved', 'subscription_created', 'subscription_renewed', 'subscription_resumed'].includes(event)
    ? 'active'
    : 'pending';
}

export class PostgresCaktoBilling {
  constructor(private readonly pool: Pick<Pool, 'query' | 'connect'>, private readonly graceDays = 7) {}

  private eventKey(event: string, data: CaktoOrderData, index: number, rawBody: Buffer): string {
    if (data.id) return `${event}:${data.id}`;
    return `${event}:sha256:${createHash('sha256').update(rawBody).update(String(index)).digest('hex')}`;
  }

  async ingest(payload: CaktoWebhookPayload, rawBody: Buffer): Promise<{ processed: number; duplicates: number; ignored: number }> {
    const event = payload.event || 'unknown';
    const items = Array.isArray(payload.data) ? payload.data : payload.data ? [payload.data] : [];
    const result = { processed: 0, duplicates: 0, ignored: 0 };
    for (const [index, data] of items.entries()) {
      const state = await this.ingestOne(event, data, this.eventKey(event, data, index, rawBody), payload);
      result[state] += 1;
    }
    if (items.length === 0) result.ignored += 1;
    return result;
  }

  private async ingestOne(
    event: string,
    data: CaktoOrderData,
    eventKey: string,
    payload: CaktoWebhookPayload,
  ): Promise<'processed' | 'duplicates' | 'ignored'> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SELECT pg_catalog.set_config('request.jwt.claim.role', 'service_role', true)");
      const inserted = await client.query(
        `INSERT INTO public.billing_webhook_events
          (provider_event_key, event_type, provider_order_id, payload)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (provider, provider_event_key) DO NOTHING
         RETURNING id`,
        [eventKey, event, data.id || null, JSON.stringify(payload)],
      );
      if ((inserted.rowCount || 0) === 0) {
        await client.query('ROLLBACK');
        return 'duplicates';
      }
      const webhookEventId = inserted.rows[0].id as string;
      const email = normalizeEmail(data.customer?.email);
      const offerId = data.offer?.id;
      const productId = data.product?.id;
      if (!data.id || !email || (!offerId && !productId)) {
        await this.finish(client, webhookEventId, 'ignored', 'Missing order, customer email, or offer/product identifier');
        await client.query('COMMIT');
        return 'ignored';
      }

      const plan = await client.query(
        `SELECT id FROM public.billing_plans
         WHERE provider = 'cakto' AND active = true
           AND (provider_offer_id = $1 OR provider_product_id = $2)
         ORDER BY (provider_offer_id = $1) DESC LIMIT 1`,
        [offerId || '', productId || ''],
      );
      if ((plan.rowCount || 0) === 0) {
        await this.finish(client, webhookEventId, 'ignored', 'No active billing plan maps this Cakto offer/product');
        await client.query('COMMIT');
        return 'ignored';
      }

      // A provider webhook never receives authority to inspect auth.users or
      // choose a tenant from an email. The verified user claims the pending
      // purchase later through the authenticated owner-only endpoint.
      const workspaceId = null;
      const status = eventStatus(event, data);
      const accessUntil = status === 'past_due'
        ? new Date(Date.now() + this.graceDays * 86_400_000).toISOString()
        : ['canceled', 'expired', 'refunded', 'chargeback', 'paused'].includes(status)
          ? new Date().toISOString()
          : null;

      await client.query(
        `WITH updated_subscription AS (
          UPDATE public.workspace_subscriptions SET
            workspace_id = COALESCE(workspace_subscriptions.workspace_id, $1),
            billing_plan_id = $2,
            provider_order_id = $4,
            provider_customer_id = COALESCE($5, workspace_subscriptions.provider_customer_id),
            customer_email = $6,
            customer_name = $7,
            status = $8,
            payment_method = $9,
            current_period = $10,
            current_period_end = $11,
            access_until = $12,
            canceled_at = $13,
            last_provider_event_at = NOW()
          WHERE provider = 'cakto' AND provider_subscription_id = $3 AND $3 IS NOT NULL
          RETURNING id
        )
        INSERT INTO public.workspace_subscriptions (
          workspace_id, billing_plan_id, provider_subscription_id, provider_order_id,
          provider_customer_id, customer_email, customer_name, status, payment_method,
          current_period, current_period_end, access_until, canceled_at, last_provider_event_at
        ) SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,NOW()
        WHERE NOT EXISTS (SELECT 1 FROM updated_subscription)
        ON CONFLICT (provider, provider_order_id) DO UPDATE SET
          workspace_id = COALESCE(workspace_subscriptions.workspace_id, EXCLUDED.workspace_id),
          billing_plan_id = EXCLUDED.billing_plan_id,
          provider_subscription_id = COALESCE(EXCLUDED.provider_subscription_id, workspace_subscriptions.provider_subscription_id),
          provider_customer_id = COALESCE(EXCLUDED.provider_customer_id, workspace_subscriptions.provider_customer_id),
          customer_email = EXCLUDED.customer_email,
          customer_name = EXCLUDED.customer_name,
          status = EXCLUDED.status,
          payment_method = EXCLUDED.payment_method,
          current_period = EXCLUDED.current_period,
          current_period_end = EXCLUDED.current_period_end,
          access_until = EXCLUDED.access_until,
          canceled_at = EXCLUDED.canceled_at,
          last_provider_event_at = NOW()`,
        [
          workspaceId, plan.rows[0].id, data.subscription?.id || null, data.id,
          data.customer?.id?.toString() || null, email, data.customer?.name || null, status,
          data.paymentMethod || null, data.subscription?.current_period || null,
          data.subscription?.next_payment_date || null, accessUntil,
          data.canceledAt || data.subscription?.canceledAt || null,
        ],
      );
      await this.finish(client, webhookEventId, 'processed', null);
      await client.query('COMMIT');
      return 'processed';
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  private async finish(client: PoolClient, id: string, status: 'processed' | 'ignored', error: string | null): Promise<void> {
    await client.query(
      `UPDATE public.billing_webhook_events
       SET processing_status = $2, processing_error = $3, processed_at = NOW()
       WHERE id = $1`,
      [id, status, error],
    );
  }
}
