import { createHmac, timingSafeEqual } from 'node:crypto';
import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { OperatorAuthenticator } from '../../../application/ports/operator-authenticator.js';
import { WorkspaceDirectory } from '../../../application/ports/workspace-directory.js';
import { AbacatePayGateway } from '../../../infrastructure/billing/abacatepay-gateway.js';
import { assertTenantAccess, unauthorized, verifyOperatorAuth } from '../helpers/auth-guard.js';
import { normalizeWorkspaceUuid } from './whatsapp-channel-routes.js';

export interface AbacatePayRoutesOptions {
  abacateGateway?: AbacatePayGateway;
  authenticator?: OperatorAuthenticator;
  workspaceDirectory?: WorkspaceDirectory;
  webhookSecret?: string;
  webhookPublicKey?: string;
}

export function verifyAbacateWebhookSignature(
  rawBody: Buffer,
  signature: string,
  publicKey: string,
): boolean {
  const expected = createHmac('sha256', publicKey).update(rawBody).digest('base64');
  const expectedBytes = Buffer.from(expected, 'utf8');
  const receivedBytes = Buffer.from(signature, 'utf8');
  return expectedBytes.length === receivedBytes.length
    && timingSafeEqual(expectedBytes, receivedBytes);
}

export const abacatePayRoutes: FastifyPluginAsync<AbacatePayRoutesOptions> = async (
  app: FastifyInstance,
  options
) => {
  const gateway = options.abacateGateway || new AbacatePayGateway();
  const webhookSecret = options.webhookSecret?.trim() || process.env.ABACATEPAY_WEBHOOK_SECRET?.trim() || '';
  const webhookPublicKey = options.webhookPublicKey?.trim() || process.env.ABACATEPAY_WEBHOOK_PUBLIC_KEY?.trim() || '';

  const secretsMatch = (received: string, expected: string): boolean => {
    const receivedBytes = Buffer.from(received);
    const expectedBytes = Buffer.from(expected);
    return receivedBytes.length === expectedBytes.length
      && timingSafeEqual(receivedBytes, expectedBytes);
  };

  /**
   * POST /api/v1/billing/abacatepay/charges
   * Criação de cobrança PIX via AbacatePay
   */
  app.post(
    '/api/v1/billing/abacatepay/charges',
    {
      preHandler: async (request, reply) => {
        if (!options.authenticator) {
          return unauthorized(reply, 'Authenticator is required');
        }
        const actor = await verifyOperatorAuth(request, reply, options.authenticator);
        if (!actor) return;

        const body = request.body as { workspaceId?: string };
        if (!body?.workspaceId) {
          return reply.code(400).send({ error: 'workspaceId is required' });
        }

        const allowed = await assertTenantAccess(
          request,
          reply,
          body.workspaceId,
          actor,
          options.workspaceDirectory,
          'operator'
        );
        if (!allowed) return;
      },
      schema: {
        description: 'Cria uma cobrança PIX via AbacatePay com link de pagamento e chave copia-e-cola.',
        tags: ['Billing'],
        body: {
          type: 'object',
          required: ['workspaceId', 'customerName', 'customerPhone', 'customerEmail', 'productName', 'priceInCents'],
          properties: {
            workspaceId: { type: 'string', format: 'uuid' },
            customerName: { type: 'string' },
            customerPhone: { type: 'string' },
            customerEmail: { type: 'string' },
            customerTaxId: { type: 'string' },
            productName: { type: 'string' },
            priceInCents: { type: 'number', minimum: 100 },
            externalId: { type: 'string' },
            metadata: { type: 'object' },
          },
        },
        response: {
          201: {
            type: 'object',
            properties: {
              billingId: { type: 'string' },
              url: { type: 'string' },
              status: { type: 'string' },
              amount: { type: 'number' },
              pixCopiaECola: { type: 'string' },
              pixQrCode: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const body = request.body as {
        workspaceId: string;
        customerName: string;
        customerPhone: string;
        customerEmail: string;
        customerTaxId?: string;
        productName: string;
        priceInCents: number;
        externalId?: string;
        metadata?: Record<string, unknown>;
      };

      const workspaceId = normalizeWorkspaceUuid(body.workspaceId);
      if (!workspaceId) {
        return reply.code(400).send({ error: 'Invalid workspaceId' });
      }
      if (!gateway.isConfigured()) {
        return reply.code(503).send({ error: 'Billing provider is not configured' });
      }

      const result = await gateway.createBilling({
        externalId: body.externalId || `ext_${Date.now()}`,
        customer: {
          name: body.customerName,
          cellphone: body.customerPhone,
          email: body.customerEmail,
          taxId: body.customerTaxId,
        },
        product: {
          externalId: `prod_${Date.now()}`,
          name: body.productName,
          priceInCents: body.priceInCents,
        },
        metadata: {
          ...(body.metadata || {}),
          workspaceId,
        },
      });

      return reply.code(201).send(result);
    }
  );

  /**
   * POST /webhooks/abacatepay
   * Webhook oficial para receber notificações de pagamentos aprovados
   */
  app.post<{ Querystring: { webhookSecret?: string } }>(
    '/webhooks/abacatepay',
    {
      preHandler: async (request, reply) => {
        if (!webhookSecret || !webhookPublicKey) {
          return reply.code(503).send({ error: 'Webhook verification is not configured' });
        }
        const receivedSecret = request.query?.webhookSecret || '';
        if (!receivedSecret || !secretsMatch(receivedSecret, webhookSecret)) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
        const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;
        const signature = request.headers['x-webhook-signature'];
        if (!rawBody || typeof signature !== 'string' || !verifyAbacateWebhookSignature(rawBody, signature, webhookPublicKey)) {
          return reply.code(401).send({ error: 'Unauthorized' });
        }
      },
      schema: {
        description: 'Webhook público para receber confirmação de pagamentos do AbacatePay.',
        tags: ['Webhooks'],
        querystring: {
          type: 'object',
          required: ['webhookSecret'],
          properties: {
            webhookSecret: { type: 'string', minLength: 16 },
          },
        },
        headers: {
          type: 'object',
          required: ['x-webhook-signature'],
          properties: {
            'x-webhook-signature': { type: 'string', minLength: 16 },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              received: { type: 'boolean' },
              event: { type: 'string' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      const payload = request.body as {
        event?: string;
        data?: {
          id?: string;
          status?: string;
          amount?: number;
          metadata?: Record<string, unknown>;
          customer?: {
            name?: string;
            email?: string;
            cellphone?: string;
          };
        };
      };

      app.log.info({ abacateEvent: payload.event, billingId: payload.data?.id }, 'AbacatePay Webhook received');

      if (payload.event === 'billing.paid' || payload.event === 'charge.paid' || payload.data?.status === 'PAID') {
        app.log.info({ billingId: payload.data?.id }, 'Payment confirmed! Auto-activating customer workspace.');
        // Aqui o evento de ativação e CAPI Purchase é disparado
      }

      return reply.code(200).send({ received: true, event: payload.event || 'unknown' });
    }
  );
};
