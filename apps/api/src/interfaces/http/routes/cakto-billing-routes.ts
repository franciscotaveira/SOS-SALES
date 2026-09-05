import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Pool } from 'pg';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { OperatorAuthenticator } from '../../../application/ports/operator-authenticator.js';
import type { WorkspaceDirectory } from '../../../application/ports/workspace-directory.js';
import {
  EKO_BONUS_MODULES,
  EKO_BONUS_VERSION,
  hasEkoBonusEntitlement,
} from '../../../application/services/eko-bonus.js';
import { PostgresCaktoBilling, type CaktoWebhookPayload } from '../../../infrastructure/billing/postgres-cakto-billing.js';
import { assertTenantAccess, unauthorized, verifyOperatorAuth } from '../helpers/auth-guard.js';
import { normalizeWorkspaceUuid } from './whatsapp-channel-routes.js';

export interface CaktoBillingRoutesOptions {
  databasePool?: Pick<Pool, 'query' | 'connect'>;
  authenticator?: OperatorAuthenticator;
  workspaceDirectory?: WorkspaceDirectory;
  webhookSecret?: string;
  timestampToleranceSeconds?: number;
  now?: () => number;
}

export function verifyCaktoWebhookSignature(params: {
  rawBody: Buffer;
  timestamp: string;
  signature: string;
  secret: string;
  nowMs?: number;
  toleranceSeconds?: number;
}): boolean {
  const timestampSeconds = Number(params.timestamp);
  if (!Number.isInteger(timestampSeconds)) return false;
  const tolerance = params.toleranceSeconds ?? 300;
  if (Math.abs((params.nowMs ?? Date.now()) / 1000 - timestampSeconds) > tolerance) return false;

  const knownSignatures = params.signature.split(',').map((part) => part.trim());
  const expected = `v1=${createHmac('sha256', params.secret)
    .update(`${params.timestamp}.`)
    .update(params.rawBody)
    .digest('hex')}`;
  const expectedBytes = Buffer.from(expected);
  return knownSignatures.some((candidate) => {
    if (!candidate.startsWith('v1=')) return false;
    const candidateBytes = Buffer.from(candidate);
    return candidateBytes.length === expectedBytes.length && timingSafeEqual(candidateBytes, expectedBytes);
  });
}

export const caktoBillingRoutes: FastifyPluginAsync<CaktoBillingRoutesOptions> = async (
  app: FastifyInstance,
  options,
) => {
  const webhookSecret = options.webhookSecret?.trim() || process.env.CAKTO_WEBHOOK_SECRET?.trim() || '';
  const graceDays = Math.max(0, Number(process.env.CAKTO_PAST_DUE_GRACE_DAYS || 7));
  const billing = options.databasePool ? new PostgresCaktoBilling(options.databasePool, graceDays) : null;

  app.get('/api/v1/billing/cakto/plans', {
    preHandler: async (request, reply) => {
      if (!options.authenticator) return unauthorized(reply, 'Authenticator is required');
      if (!await verifyOperatorAuth(request, reply, options.authenticator)) return;
    },
    schema: { tags: ['Billing'], description: 'Lista os planos Cakto ativos e seus checkouts.' },
  }, async (_request, reply) => {
    if (!options.databasePool) return reply.code(503).send({ error: 'Billing database is not configured' });
    const plans = await options.databasePool.query(
      `SELECT code, name, tier, checkout_url AS "checkoutUrl", amount_minor AS "amountMinor",
              currency, interval_unit AS "intervalUnit", interval_count AS "intervalCount"
       FROM public.billing_plans WHERE provider = 'cakto' AND active = true
       ORDER BY amount_minor ASC`,
    );
    return { data: plans.rows };
  });

  app.get('/api/v1/workspaces/:workspaceId/billing/subscription', {
    preHandler: async (request, reply) => {
      if (!options.authenticator) return unauthorized(reply, 'Authenticator is required');
      const actor = await verifyOperatorAuth(request, reply, options.authenticator);
      if (!actor) return;
      const workspaceId = normalizeWorkspaceUuid((request.params as { workspaceId?: string }).workspaceId || '');
      if (!workspaceId) return reply.code(400).send({ error: 'Invalid workspaceId' });
      if (!await assertTenantAccess(request, reply, workspaceId, actor, options.workspaceDirectory, 'viewer')) return;
    },
    schema: { tags: ['Billing'], description: 'Retorna a assinatura Cakto vigente do workspace.' },
  }, async (request, reply) => {
    if (!options.databasePool) return reply.code(503).send({ error: 'Billing database is not configured' });
    const workspaceId = normalizeWorkspaceUuid((request.params as { workspaceId: string }).workspaceId)!;
    const subscription = await options.databasePool.query(
      `SELECT subscription.id, plan.code AS "planCode", plan.name AS "planName", plan.tier,
              subscription.status, subscription.payment_method AS "paymentMethod",
              subscription.current_period_end AS "currentPeriodEnd",
              subscription.access_until AS "accessUntil", subscription.canceled_at AS "canceledAt"
       FROM public.workspace_subscriptions subscription
       JOIN public.billing_plans plan ON plan.id = subscription.billing_plan_id
       WHERE subscription.workspace_id = $1
       ORDER BY subscription.last_provider_event_at DESC LIMIT 1`,
      [workspaceId],
    );
    return { data: subscription.rows[0] || null };
  });

  app.get('/api/v1/workspaces/:workspaceId/bonuses/eko', {
    preHandler: async (request, reply) => {
      if (!options.authenticator) return unauthorized(reply, 'Authenticator is required');
      const actor = await verifyOperatorAuth(request, reply, options.authenticator);
      if (!actor) return;
      const workspaceId = normalizeWorkspaceUuid((request.params as { workspaceId?: string }).workspaceId || '');
      if (!workspaceId) return reply.code(400).send({ error: 'Invalid workspaceId' });
      if (!await assertTenantAccess(request, reply, workspaceId, actor, options.workspaceDirectory, 'viewer')) return;
    },
    schema: { tags: ['Billing'], description: 'Retorna o bônus EKO de implantação quando a assinatura Cakto está vigente.' },
  }, async (request, reply) => {
    if (!options.databasePool) return reply.code(503).send({ error: 'Billing database is not configured' });
    const workspaceId = normalizeWorkspaceUuid((request.params as { workspaceId: string }).workspaceId)!;
    const subscription = await options.databasePool.query(
      `SELECT status, access_until AS "accessUntil", current_period_end AS "currentPeriodEnd"
       FROM public.workspace_subscriptions
       WHERE workspace_id = $1
       ORDER BY last_provider_event_at DESC LIMIT 1`,
      [workspaceId],
    );
    const row = subscription.rows[0] || null;
    const eligible = hasEkoBonusEntitlement(row);

    return {
      data: {
        eligible,
        product: 'EKO',
        version: EKO_BONUS_VERSION,
        title: 'Kit de Configuração Comercial para IA no WhatsApp',
        description: 'Material de implantação para organizar oferta, contexto, limites e testes antes de liberar o agente.',
        modules: eligible ? EKO_BONUS_MODULES : [],
        subscriptionStatus: row?.status || null,
        claimRequired: !eligible,
      },
    };
  });

  app.post('/api/v1/workspaces/:workspaceId/billing/claim', {
    preHandler: async (request, reply) => {
      if (!options.authenticator) return unauthorized(reply, 'Authenticator is required');
      const actor = await verifyOperatorAuth(request, reply, options.authenticator);
      if (!actor) return;
      const workspaceId = normalizeWorkspaceUuid((request.params as { workspaceId?: string }).workspaceId || '');
      if (!workspaceId || !actor.email) return reply.code(422).send({ error: 'A valid workspace and verified email are required' });
      if (!await assertTenantAccess(request, reply, workspaceId, actor, options.workspaceDirectory, 'owner')) return;
      request.operatorActor = actor;
    },
    schema: { tags: ['Billing'], description: 'Vincula ao workspace uma compra Cakto pendente do mesmo e-mail verificado.' },
  }, async (request, reply) => {
    if (!options.databasePool) return reply.code(503).send({ error: 'Billing database is not configured' });
    const workspaceId = normalizeWorkspaceUuid((request.params as { workspaceId: string }).workspaceId)!;
    const email = request.operatorActor!.email!.trim().toLowerCase();
    const claimed = await options.databasePool.query(
      `UPDATE public.workspace_subscriptions SET workspace_id = $1
       WHERE workspace_id IS NULL AND customer_email = $2
       RETURNING id, status`,
      [workspaceId, email],
    );
    return { data: { claimed: claimed.rowCount || 0 } };
  });

  app.post('/webhooks/cakto', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    preHandler: async (request, reply) => {
      if (!webhookSecret || !billing) {
        return reply.code(503).send({ error: 'Cakto webhook is not configured' });
      }
      const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;
      const timestamp = request.headers['x-cakto-timestamp'];
      const signature = request.headers['x-cakto-signature'];
      if (!rawBody || typeof timestamp !== 'string' || typeof signature !== 'string' || !verifyCaktoWebhookSignature({
        rawBody,
        timestamp,
        signature,
        secret: webhookSecret,
        nowMs: options.now?.(),
        toleranceSeconds: options.timestampToleranceSeconds,
      })) {
        return reply.code(401).send({ error: 'Unauthorized' });
      }
    },
    schema: {
      tags: ['Webhooks'],
      description: 'Recebe eventos assinados de pedidos e assinaturas da Cakto (V1 e V2).',
      headers: {
        type: 'object',
        required: ['x-cakto-timestamp', 'x-cakto-signature'],
        properties: {
          'x-cakto-timestamp': { type: 'string' },
          'x-cakto-signature': { type: 'string' },
        },
      },
    },
  }, async (request, reply) => {
    const payload = request.body as CaktoWebhookPayload;
    if (!payload?.event || !payload.data) return reply.code(422).send({ error: 'Invalid Cakto payload' });
    const rawBody = (request as unknown as { rawBody: Buffer }).rawBody;
    try {
      const result = await billing!.ingest(payload, rawBody);
      return reply.code(200).send({ received: true, event: payload.event, ...result });
    } catch (error) {
      request.log.error({ error, event: payload.event }, 'Unable to persist Cakto webhook');
      // Cakto does not retry application 5xx responses. Reconciliation must pick
      // up this order from the provider API after the database recovers.
      return reply.code(503).send({ error: 'Billing event persistence failed' });
    }
  });
};
