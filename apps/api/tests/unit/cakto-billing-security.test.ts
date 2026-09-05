import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CaktoGateway } from '../../src/infrastructure/billing/cakto-gateway.js';
import { verifyCaktoWebhookSignature } from '../../src/interfaces/http/routes/cakto-billing-routes.js';

describe('Cakto billing security boundaries', () => {
  beforeEach(() => {
    vi.stubEnv('CAKTO_CLIENT_ID', '');
    vi.stubEnv('CAKTO_CLIENT_SECRET', '');
    vi.stubGlobal('fetch', vi.fn());
  });

  it('fails closed when API credentials are absent', async () => {
    const gateway = new CaktoGateway();
    expect(gateway.isConfigured()).toBe(false);
    await expect(gateway.listSubscriptions()).rejects.toThrow('Cakto API is not configured');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('exchanges credentials using the OAuth form encoding required by Cakto', async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock
      .mockResolvedValueOnce(new Response(JSON.stringify({ access_token: 'access-token', expires_in: 36000 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ results: [] }), { status: 200 }));

    const gateway = new CaktoGateway({ clientId: 'client-id', clientSecret: 'client-secret' });
    await gateway.listOrders();

    const tokenRequest = fetchMock.mock.calls[0];
    expect(tokenRequest?.[1]?.headers).toEqual({ 'Content-Type': 'application/x-www-form-urlencoded' });
    expect(tokenRequest?.[1]?.body).toBeInstanceOf(URLSearchParams);
    expect(String(tokenRequest?.[1]?.body)).toBe('client_id=client-id&client_secret=client-secret');
  });

  it('verifies the documented timestamp plus raw-body HMAC', () => {
    const rawBody = Buffer.from('{"event":"purchase_approved","data":{"id":"order-1"}}');
    const timestamp = '1788566400';
    const secret = 'test-cakto-webhook-secret';
    const signature = `v1=${createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex')}`;

    expect(verifyCaktoWebhookSignature({ rawBody, timestamp, signature, secret, nowMs: 1788566400_000 })).toBe(true);
    expect(verifyCaktoWebhookSignature({ rawBody: Buffer.from('{}'), timestamp, signature, secret, nowMs: 1788566400_000 })).toBe(false);
  });

  it('rejects stale deliveries to prevent replay', () => {
    const rawBody = Buffer.from('{}');
    const timestamp = '1788566400';
    const secret = 'test-cakto-webhook-secret';
    const signature = `v1=${createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex')}`;
    expect(verifyCaktoWebhookSignature({
      rawBody,
      timestamp,
      signature,
      secret,
      nowMs: 1788567001_000,
      toleranceSeconds: 300,
    })).toBe(false);
  });

  it('accepts a known signature version among multiple versions', () => {
    const rawBody = Buffer.from('{}');
    const timestamp = '1788566400';
    const secret = 'test-cakto-webhook-secret';
    const v1 = `v1=${createHmac('sha256', secret).update(`${timestamp}.`).update(rawBody).digest('hex')}`;
    expect(verifyCaktoWebhookSignature({
      rawBody,
      timestamp,
      signature: `v2=future, ${v1}`,
      secret,
      nowMs: 1788566400_000,
    })).toBe(true);
  });
});
