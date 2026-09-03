import { describe, it, expect, beforeEach, vi } from 'vitest';
import Fastify from 'fastify';
import pg from 'pg';
import { publicSupplierRoutes } from '../../src/interfaces/http/routes/public-supplier-routes.js';
import { verifyWahaApiKeyTimingSafe, getWahaApiKey, isEventReplayed } from '../../src/interfaces/http/routes/whatsapp-channel-routes.js';

describe('WAHA Webhook Fail-Closed Security & Replay Deduplication', () => {
  const TEST_KEY = 'mct_sos_waha_test_key_secure_123';
  let query: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    process.env.WAHA_API_KEY = TEST_KEY;
    query = vi.fn().mockResolvedValue({
      rows: [{ id: 'mock-uuid-123' }],
      rowCount: 1,
    });
    vi.spyOn(pg.Pool.prototype, 'connect').mockImplementation(async () => {
      return {
        query,
        release: vi.fn(),
      } as any;
    });
  });

  it('SEC-01: verifyWahaApiKeyTimingSafe returns false for undefined, empty or whitespace key', () => {
    expect(verifyWahaApiKeyTimingSafe(undefined)).toBe(false);
    expect(verifyWahaApiKeyTimingSafe('')).toBe(false);
    expect(verifyWahaApiKeyTimingSafe('   ')).toBe(false);
  });

  it('SEC-02: verifyWahaApiKeyTimingSafe returns false for wrong or truncated key', () => {
    expect(verifyWahaApiKeyTimingSafe('wrong_key')).toBe(false);
    expect(verifyWahaApiKeyTimingSafe(TEST_KEY.slice(0, 10))).toBe(false);
    expect(verifyWahaApiKeyTimingSafe(TEST_KEY + '_extra')).toBe(false);
  });

  it('SEC-03: verifyWahaApiKeyTimingSafe returns true only for exact match', () => {
    expect(verifyWahaApiKeyTimingSafe(TEST_KEY)).toBe(true);
  });

  it('SEC-04: POST /api/v1/channels/waha/webhook rejects request without x-api-key with HTTP 401', async () => {
    const app = Fastify();
    await app.register(publicSupplierRoutes);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/channels/waha/webhook',
      payload: {
        event: 'message',
        session: 'haven',
        payload: { from: '5511999999999@s.whatsapp.net', body: 'Olá' },
      },
    });

    expect(response.statusCode).toBe(401);
    const json = JSON.parse(response.payload);
    expect(json.error).toBe('Unauthorized webhook caller');
    await app.close();
  });

  it('SEC-05: POST /api/v1/channels/waha/webhook rejects request with invalid x-api-key with HTTP 401', async () => {
    const app = Fastify();
    await app.register(publicSupplierRoutes);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/channels/waha/webhook',
      headers: { 'x-api-key': 'invalid_secret_attacker' },
      payload: {
        event: 'message',
        session: 'haven',
        payload: { from: '5511999999999@s.whatsapp.net', body: 'Olá' },
      },
    });

    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('SEC-05b: valid WAHA callers must provide an explicit session; no default tenant is inferred', async () => {
    const app = Fastify();
    await app.register(publicSupplierRoutes);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/channels/waha/webhook',
      headers: { 'x-api-key': TEST_KEY },
      payload: {
        event: 'message',
        payload: { id: `missing_session_${Date.now()}`, from: '5511999999999@s.whatsapp.net', body: 'Olá' },
      },
    });

    expect(response.statusCode).toBe(400);
    expect(JSON.parse(response.payload)).toMatchObject({ code: 'WAHA_SESSION_REQUIRED' });
    expect(query).not.toHaveBeenCalled();
    await app.close();
  });

  it('SEC-06: POST /api/v1/channels/waha/webhook accepts valid x-api-key and processes known session', async () => {
    const app = Fastify();
    await app.register(publicSupplierRoutes);

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/channels/waha/webhook',
      headers: { 'x-api-key': TEST_KEY },
      payload: {
        event: 'message',
        session: 'haven',
        payload: { id: `msg_${Date.now()}_test`, from: '5511999999999@s.whatsapp.net', body: 'Teste' },
      },
    });

    expect(response.statusCode).toBe(200);
    const json = JSON.parse(response.payload);
    expect(json.received).toBe(true);
    expect(json.workspaceId).toBe('22222222-2222-2222-2222-222222222222');
    expect(query.mock.calls.some(([sql]) => typeof sql === 'string' && sql.includes("provider = 'waha'"))).toBe(true);
    expect(query.mock.calls.some(([sql]) => typeof sql === 'string' && sql.includes('WHERE workspace_id = $1 LIMIT 1'))).toBe(false);
    await app.close();
  });

  it('SEC-07: Anti-Replay deduplication drops duplicate event IDs with deduplicated: true', async () => {
    const app = Fastify();
    await app.register(publicSupplierRoutes);

    const uniqueEventId = `replay_test_event_${Date.now()}`;
    const payload = {
      event: 'message',
      session: 'haven',
      payload: { id: uniqueEventId, from: '5511999999999@s.whatsapp.net', body: 'Teste Replay' },
    };

    // First delivery -> Accepted
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/v1/channels/waha/webhook',
      headers: { 'x-api-key': TEST_KEY },
      payload,
    });
    expect(res1.statusCode).toBe(200);
    expect(JSON.parse(res1.payload).received).toBe(true);
    expect(JSON.parse(res1.payload).deduplicated).toBeUndefined();

    // Second delivery of same eventId -> Dropped as duplicate
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/v1/channels/waha/webhook',
      headers: { 'x-api-key': TEST_KEY },
      payload,
    });
    expect(res2.statusCode).toBe(200);
    expect(JSON.parse(res2.payload).deduplicated).toBe(true);

    await app.close();
  });

  it('SEC-08: production route sends inbound WAHA envelopes to durable ingestion', async () => {
    const app = Fastify();
    const routeQuery = vi.fn().mockResolvedValue({
      rows: [{
        id: 'waha-channel-001',
        workspace_id: '22222222-2222-2222-2222-222222222222',
      }],
      rowCount: 1,
    });
    const ingestChannelEvent = vi.fn().mockResolvedValue({
      inboundEventId: 'inbound-event-001',
      workspaceId: '22222222-2222-2222-2222-222222222222',
      isDuplicate: false,
    });

    await app.register(publicSupplierRoutes, {
      databasePool: { query: routeQuery } as any,
      ingestionGateway: { ingestChannelEvent } as any,
    });

    const payload = {
      event: 'message',
      session: 'haven',
      payload: {
        id: 'false_5511999999999@c.us_ABC123',
        from: '5511999999999@c.us',
        body: 'Mensagem durável',
      },
    };

    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/channels/waha/webhook',
      headers: { 'x-api-key': TEST_KEY },
      payload,
    });

    expect(response.statusCode).toBe(200);
    expect(JSON.parse(response.payload)).toMatchObject({
      accepted: true,
      inboundEventId: 'inbound-event-001',
      workspaceId: '22222222-2222-2222-2222-222222222222',
    });
    expect(ingestChannelEvent).toHaveBeenCalledWith(expect.objectContaining({
      channelConnectionId: 'waha-channel-001',
      providerEventId: 'message:false_5511999999999@c.us_ABC123',
      eventType: 'message',
      rawPayload: expect.objectContaining({ session: 'haven' }),
    }));
    expect(routeQuery).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
