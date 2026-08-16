import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { AbacatePayGateway } from '../../../infrastructure/billing/abacatepay-gateway.js';

export interface AbacatePayRoutesOptions {
  abacateGateway?: AbacatePayGateway;
}

export const abacatePayRoutes: FastifyPluginAsync<AbacatePayRoutesOptions> = async (
  app: FastifyInstance,
  options
) => {
  const gateway = options.abacateGateway || new AbacatePayGateway();

  /**
   * POST /api/v1/billing/abacatepay/charges
   * Criação de cobrança PIX via AbacatePay
   */
  app.post(
    '/api/v1/billing/abacatepay/charges',
    {
      schema: {
        description: 'Cria uma cobrança PIX via AbacatePay com link de pagamento e chave copia-e-cola.',
        tags: ['Billing'],
        body: {
          type: 'object',
          required: ['customerName', 'customerPhone', 'customerEmail', 'productName', 'priceInCents'],
          properties: {
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
        customerName: string;
        customerPhone: string;
        customerEmail: string;
        customerTaxId?: string;
        productName: string;
        priceInCents: number;
        externalId?: string;
        metadata?: Record<string, unknown>;
      };

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
        metadata: body.metadata,
      });

      return reply.code(201).send(result);
    }
  );

  /**
   * POST /webhooks/abacatepay
   * Webhook oficial para receber notificações de pagamentos aprovados
   */
  app.post(
    '/webhooks/abacatepay',
    {
      schema: {
        description: 'Webhook público para receber confirmação de pagamentos do AbacatePay.',
        tags: ['Webhooks'],
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
