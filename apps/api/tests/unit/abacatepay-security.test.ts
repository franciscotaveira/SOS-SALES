import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { AuthenticatedActor, OperatorAuthenticator } from '../../src/application/ports/operator-authenticator.js';
import { AccessibleWorkspace, WorkspaceDirectory } from '../../src/application/ports/workspace-directory.js';
import { createHmac } from 'node:crypto';
import { AbacatePayGateway } from '../../src/infrastructure/billing/abacatepay-gateway.js';
import { abacatePayRoutes, verifyAbacateWebhookSignature } from '../../src/interfaces/http/routes/abacatepay-routes.js';

const workspaceId = '11111111-1111-1111-1111-111111111111';

const authenticator: OperatorAuthenticator = {
  async verifyAccessToken(token: string): Promise<AuthenticatedActor | null> {
    return token.startsWith('owner_token')
      ? { userId: 'owner-user', email: 'owner@example.test' }
      : null;
  },
};

const workspaceDirectory: WorkspaceDirectory = {
  async listForActor(): Promise<AccessibleWorkspace[]> {
    return [{ id: workspaceId, name: 'Tenant A', slug: 'tenant-a', role: 'owner' }];
  },
};

const chargePayload = {
  workspaceId,
  customerName: 'Test Customer',
  customerPhone: '+5549999999999',
  customerEmail: 'customer@example.test',
  productName: 'Test Product',
  priceInCents: 100,
};

describe('AbacatePay security boundaries', () => {
  beforeEach(() => {
    vi.stubEnv('ABACATEPAY_API_KEY', '');
    vi.stubEnv('ABACATEPAY_WEBHOOK_SECRET', '');
    vi.stubGlobal('fetch', vi.fn());
  });

  it('fails closed instead of generating a simulated charge when provider credentials are absent', async () => {
    const gateway = new AbacatePayGateway();

    await expect(gateway.createBilling({
      externalId: 'test-external-id',
      customer: {
        name: chargePayload.customerName,
        cellphone: chargePayload.customerPhone,
        email: chargePayload.customerEmail,
      },
      product: {
        externalId: 'test-product',
        name: chargePayload.productName,
        priceInCents: chargePayload.priceInCents,
      },
    })).rejects.toThrow('AbacatePay is not configured');

    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns 503 for an authorized charge when the provider is not configured', async () => {
    const app = Fastify();
    await app.register(abacatePayRoutes, {
      authenticator,
      workspaceDirectory,
      abacateGateway: new AbacatePayGateway(),
      webhookSecret: 'test-only-webhook-secret',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/billing/abacatepay/charges',
      headers: { authorization: 'Bearer owner_token.part2.part3' },
      payload: chargePayload,
    });

    expect(response.statusCode).toBe(503);
    expect(fetch).not.toHaveBeenCalled();
    await app.close();
  });

  it('rejects an invalid webhook secret before processing the event', async () => {
    const app = Fastify();
    await app.register(abacatePayRoutes, {
      authenticator,
      workspaceDirectory,
      abacateGateway: new AbacatePayGateway(),
      webhookSecret: 'expected-test-webhook-secret',
      webhookPublicKey: 'expected-test-public-key',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/abacatepay?webhookSecret=wrong-test-webhook-secret',
      headers: { 'x-webhook-signature': 'invalid-test-signature' },
      payload: { event: 'billing.paid', data: { id: 'billing-test' } },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('fails closed when webhook verification is not configured', async () => {
    const app = Fastify();
    await app.register(abacatePayRoutes, {
      authenticator,
      workspaceDirectory,
      abacateGateway: new AbacatePayGateway(),
    });

    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/abacatepay?webhookSecret=some-test-webhook-secret',
      headers: { 'x-webhook-signature': 'invalid-test-signature' },
      payload: { event: 'billing.paid', data: { id: 'billing-test' } },
    });

    expect(response.statusCode).toBe(503);
    await app.close();
  });

  it('verifies the documented HMAC-SHA256 signature over the exact raw body', () => {
    const rawBody = Buffer.from('{"id":"log_123","event":"checkout.completed"}', 'utf8');
    const publicKey = 'test-public-key';
    const signature = createHmac('sha256', publicKey).update(rawBody).digest('base64');

    expect(verifyAbacateWebhookSignature(rawBody, signature, publicKey)).toBe(true);
    expect(verifyAbacateWebhookSignature(Buffer.from('{"id":"tampered"}', 'utf8'), signature, publicKey)).toBe(false);
    expect(verifyAbacateWebhookSignature(rawBody, 'invalid-signature', publicKey)).toBe(false);
  });

  it('accepts a webhook only when both the URL secret and raw-body HMAC are valid', async () => {
    const app = Fastify();
    await app.addContentTypeParser('application/json', { parseAs: 'buffer' }, (request, body, done) => {
      (request as unknown as { rawBody: Buffer }).rawBody = body as Buffer;
      done(null, JSON.parse((body as Buffer).toString('utf8')));
    });
    await app.register(abacatePayRoutes, {
      authenticator,
      workspaceDirectory,
      abacateGateway: new AbacatePayGateway(),
      webhookSecret: 'expected-test-webhook-secret',
      webhookPublicKey: 'expected-test-public-key',
    });

    const rawPayload = '{"id":"log_123","event":"checkout.completed","data":{"id":"billing_123"}}';
    const signature = createHmac('sha256', 'expected-test-public-key').update(Buffer.from(rawPayload, 'utf8')).digest('base64');
    const response = await app.inject({
      method: 'POST',
      url: '/webhooks/abacatepay?webhookSecret=expected-test-webhook-secret',
      headers: {
        'content-type': 'application/json',
        'x-webhook-signature': signature,
      },
      payload: rawPayload,
    });

    expect(response.statusCode).toBe(200);
    await app.close();
  });
});
