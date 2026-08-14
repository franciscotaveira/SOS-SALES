import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import crypto from 'node:crypto';
import { buildApp } from '../../src/interfaces/http/app.js';
import { EnvironmentWebhookSecretProvider } from '../../src/infrastructure/security/environment-webhook-secret-provider.js';
import { WahaWebhookAdapter } from '../../src/infrastructure/channels/waha/waha-webhook-adapter.js';
import { PostgresInboundIngestionGateway } from '../../src/infrastructure/database/postgres-inbound-ingestion-gateway.js';
import { InboundIngestionGateway } from '../../src/application/ports/inbound-ingestion-gateway.js';
import { ChannelWebhookAdapter } from '../../src/application/ports/channel-webhook-adapter.js';
import { dbPool } from '../../src/infrastructure/database/pool.js';
import { FastifyInstance } from 'fastify';

describe('TX Commercial Core — WAHA Inbound Webhook HTTP Integration (Official Contract & Rate Limiting)', () => {
  let app: FastifyInstance;
  const channelConnectionId = 'a2000000-0000-0000-0000-000000000001';
  const secret = 'whsec_waha_test_key_haven_2026';
  let ingestionGateway: InboundIngestionGateway;

  beforeAll(async () => {
    const secretProvider = new EnvironmentWebhookSecretProvider(
      new Map([[channelConnectionId, secret]])
    );
    const wahaAdapter = new WahaWebhookAdapter();
    ingestionGateway = new PostgresInboundIngestionGateway();

    app = buildApp({
      secretProvider,
      wahaAdapter,
      ingestionGateway,
      logger: false,
    });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await dbPool.end();
  });

  it('WEB-01: valid webhook with official x-webhook-hmac, sha512 algorithm and epoch ms timestamp returns 202 Accepted', async () => {
    const rawPayload = JSON.stringify({
      event: 'message',
      id: `waha_evt_test_${crypto.randomUUID()}`,
      payload: {
        id: `wamid_web_${crypto.randomUUID()}`,
        from: '5549999112233@c.us',
        pushName: 'Juliana Test',
        body: 'Olá, gostaria de saber o valor da escova',
        timestamp: Date.now(),
      },
    });

    const timestampHeader = Date.now().toString(); // Milliseconds
    const signature = crypto.createHmac('sha512', secret).update(rawPayload).digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: `/webhooks/waha/${channelConnectionId}`,
      headers: {
        'content-type': 'application/json',
        'x-webhook-hmac': signature,
        'x-webhook-hmac-algorithm': 'sha512',
        'x-webhook-timestamp': timestampHeader,
      },
      body: rawPayload,
    });

    expect(response.statusCode).toBe(202);
    const json = JSON.parse(response.payload);
    expect(json.status).toBe('ACCEPTED');
    expect(json.eventId).toBeDefined();
    expect(json.isDuplicate).toBe(false);
  });

  it('WEB-02: webhook with missing x-webhook-hmac-algorithm returns 401 Unauthorized', async () => {
    const rawPayload = JSON.stringify({ event: 'message' });
    const signature = crypto.createHmac('sha512', secret).update(rawPayload).digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: `/webhooks/waha/${channelConnectionId}`,
      headers: {
        'content-type': 'application/json',
        'x-webhook-hmac': signature,
        'x-webhook-timestamp': Date.now().toString(),
      },
      body: rawPayload,
    });

    expect(response.statusCode).toBe(401);
    expect(response.payload).toMatch(/Missing x-webhook-hmac-algorithm/i);
  });

  it('WEB-03: webhook with unsupported algorithm (e.g. sha256) returns 401 Unauthorized', async () => {
    const rawPayload = JSON.stringify({ event: 'message' });
    const signature = crypto.createHmac('sha512', secret).update(rawPayload).digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: `/webhooks/waha/${channelConnectionId}`,
      headers: {
        'content-type': 'application/json',
        'x-webhook-hmac': signature,
        'x-webhook-hmac-algorithm': 'sha256',
        'x-webhook-timestamp': Date.now().toString(),
      },
      body: rawPayload,
    });

    expect(response.statusCode).toBe(401);
    expect(response.payload).toMatch(/Unsupported HMAC algorithm/i);
  });

  it('WEB-04: webhook with missing x-webhook-timestamp returns 401 Unauthorized', async () => {
    const rawPayload = JSON.stringify({ event: 'message' });
    const signature = crypto.createHmac('sha512', secret).update(rawPayload).digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: `/webhooks/waha/${channelConnectionId}`,
      headers: {
        'content-type': 'application/json',
        'x-webhook-hmac': signature,
        'x-webhook-hmac-algorithm': 'sha512',
      },
      body: rawPayload,
    });

    expect(response.statusCode).toBe(401);
    expect(response.payload).toMatch(/Missing x-webhook-timestamp/i);
  });

  it('WEB-05: webhook with timestamp in seconds instead of milliseconds returns 401 Unauthorized', async () => {
    const rawPayload = JSON.stringify({ event: 'message' });
    const signature = crypto.createHmac('sha512', secret).update(rawPayload).digest('hex');
    const timestampInSeconds = Math.floor(Date.now() / 1000).toString(); // < 1e11

    const response = await app.inject({
      method: 'POST',
      url: `/webhooks/waha/${channelConnectionId}`,
      headers: {
        'content-type': 'application/json',
        'x-webhook-hmac': signature,
        'x-webhook-hmac-algorithm': 'sha512',
        'x-webhook-timestamp': timestampInSeconds,
      },
      body: rawPayload,
    });

    expect(response.statusCode).toBe(401);
    expect(response.payload).toMatch(/epoch milliseconds/i);
  });

  it('WEB-06: webhook with expired timestamp (anti-replay violation) returns 401 Unauthorized', async () => {
    const rawPayload = JSON.stringify({ event: 'message' });
    const signature = crypto.createHmac('sha512', secret).update(rawPayload).digest('hex');
    const expiredTimestamp = (Date.now() - 400 * 1000).toString(); // 400s ago (> 300s window)

    const response = await app.inject({
      method: 'POST',
      url: `/webhooks/waha/${channelConnectionId}`,
      headers: {
        'content-type': 'application/json',
        'x-webhook-hmac': signature,
        'x-webhook-hmac-algorithm': 'sha512',
        'x-webhook-timestamp': expiredTimestamp,
      },
      body: rawPayload,
    });

    expect(response.statusCode).toBe(401);
    expect(response.payload).toMatch(/tolerance window/i);
  });

  it('WEB-07: webhook using legacy/deprecated headers (x-waha-hmac-sha512) returns 401 Unauthorized', async () => {
    const rawPayload = JSON.stringify({ event: 'message' });
    const signature = crypto.createHmac('sha512', secret).update(rawPayload).digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: `/webhooks/waha/${channelConnectionId}`,
      headers: {
        'content-type': 'application/json',
        'x-waha-hmac-sha512': signature,
        'x-waha-timestamp': Date.now().toString(),
      },
      body: rawPayload,
    });

    expect(response.statusCode).toBe(401);
    expect(response.payload).toMatch(/Missing x-webhook-hmac-algorithm/i);
  });

  it('WEB-08: webhook for unknown channelConnectionId returns 404 Not Found with controlled message', async () => {
    const unknownId = 'a0000000-9999-9999-9999-999999999999';
    const rawPayload = JSON.stringify({ event: 'message' });
    const signature = crypto.createHmac('sha512', secret).update(rawPayload).digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: `/webhooks/waha/${unknownId}`,
      headers: {
        'content-type': 'application/json',
        'x-webhook-hmac': signature,
        'x-webhook-hmac-algorithm': 'sha512',
        'x-webhook-timestamp': Date.now().toString(),
      },
      body: rawPayload,
    });

    expect(response.statusCode).toBe(404);
    const json = JSON.parse(response.payload);
    expect(json.error).toBe(`Channel connection ${unknownId} secret not found`);
  });

  // ============================================================================
  // R2G: TYPED 400 ERRORS & SANITIZED 500 ERROR RESPONSES
  // ============================================================================
  it('WEB-09: valid HMAC + envelope without event/type returns 400 Bad Request and does not call gateway', async () => {
    const gatewaySpy = vi.spyOn(ingestionGateway, 'ingestChannelEvent');
    const rawPayload = JSON.stringify({
      payload: { id: 'wamid_no_event_test', body: 'Sem event type' },
    });

    const timestampHeader = Date.now().toString();
    const signature = crypto.createHmac('sha512', secret).update(rawPayload).digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: `/webhooks/waha/${channelConnectionId}`,
      headers: {
        'content-type': 'application/json',
        'x-webhook-hmac': signature,
        'x-webhook-hmac-algorithm': 'sha512',
        'x-webhook-timestamp': timestampHeader,
      },
      body: rawPayload,
    });

    expect(response.statusCode).toBe(400);
    const json = JSON.parse(response.payload);
    expect(json.error).toBe('WAHA payload missing or invalid event type');
    expect(gatewaySpy).not.toHaveBeenCalled();
    gatewaySpy.mockRestore();
  });

  it('WEB-10: valid HMAC + empty event string returns 400 Bad Request', async () => {
    const rawPayload = JSON.stringify({
      event: '   ',
      payload: { id: 'wamid_empty_event_test', body: 'Evento vazio' },
    });

    const timestampHeader = Date.now().toString();
    const signature = crypto.createHmac('sha512', secret).update(rawPayload).digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: `/webhooks/waha/${channelConnectionId}`,
      headers: {
        'content-type': 'application/json',
        'x-webhook-hmac': signature,
        'x-webhook-hmac-algorithm': 'sha512',
        'x-webhook-timestamp': timestampHeader,
      },
      body: rawPayload,
    });

    expect(response.statusCode).toBe(400);
    const json = JSON.parse(response.payload);
    expect(json.error).toBe('WAHA payload missing or invalid event type');
  });

  it('WEB-11: valid HMAC + event "message" without message ID returns 400 Bad Request', async () => {
    const rawPayload = JSON.stringify({
      event: 'message',
      payload: { from: '5549999112233@c.us', body: 'Sem message ID' },
    });

    const timestampHeader = Date.now().toString();
    const signature = crypto.createHmac('sha512', secret).update(rawPayload).digest('hex');

    const response = await app.inject({
      method: 'POST',
      url: `/webhooks/waha/${channelConnectionId}`,
      headers: {
        'content-type': 'application/json',
        'x-webhook-hmac': signature,
        'x-webhook-hmac-algorithm': 'sha512',
        'x-webhook-timestamp': timestampHeader,
      },
      body: rawPayload,
    });

    expect(response.statusCode).toBe(400);
    const json = JSON.parse(response.payload);
    expect(json.error).toBe('WAHA message payload missing provider message ID');
  });

  it('WEB-12: fake adapter throwing unexpected programming failure returns sanitized 500 without internal message', async () => {
    const buggedAdapter: ChannelWebhookAdapter = {
      providerName: 'waha',
      verifySignature: () => ({ valid: true }),
      extractEvent: () => {
        throw new Error('Unexpected adapter programming failure in null reference pointer');
      },
      parseInboundMessage: () => ({ kind: 'IGNORED', reason: 'mock' }),
    };

    const secretProvider = new EnvironmentWebhookSecretProvider(
      new Map([[channelConnectionId, secret]])
    );
    const customApp = buildApp({
      secretProvider,
      wahaAdapter: buggedAdapter,
      ingestionGateway,
      logger: false,
    });
    await customApp.ready();

    const rawPayload = JSON.stringify({ event: 'message' });
    const timestampHeader = Date.now().toString();
    const signature = crypto.createHmac('sha512', secret).update(rawPayload).digest('hex');

    const response = await customApp.inject({
      method: 'POST',
      url: `/webhooks/waha/${channelConnectionId}`,
      headers: {
        'content-type': 'application/json',
        'x-webhook-hmac': signature,
        'x-webhook-hmac-algorithm': 'sha512',
        'x-webhook-timestamp': timestampHeader,
      },
      body: rawPayload,
    });

    expect(response.statusCode).toBe(500);
    const json = JSON.parse(response.payload);
    expect(json.error).toBe('Internal server error during webhook ingestion');
    expect(json.error).not.toMatch(/Unexpected adapter programming failure/i);

    await customApp.close();
  });

  it('WEB-13: unexpected failure thrown by gateway returns sanitized 500 without leaking DB/SQL messages', async () => {
    const failingGateway: InboundIngestionGateway = {
      ingestChannelEvent: async () => {
        throw new Error('FATAL 28P01: password authentication failed for user "postgres" on 10.0.0.4');
      },
    };

    const secretProvider = new EnvironmentWebhookSecretProvider(
      new Map([[channelConnectionId, secret]])
    );
    const customApp = buildApp({
      secretProvider,
      wahaAdapter: new WahaWebhookAdapter(),
      ingestionGateway: failingGateway,
      logger: false,
    });
    await customApp.ready();

    const rawPayload = JSON.stringify({
      event: 'message',
      payload: { id: 'wamid_fail_gw', body: 'Teste gateway 500' },
    });

    const timestampHeader = Date.now().toString();
    const signature = crypto.createHmac('sha512', secret).update(rawPayload).digest('hex');

    const response = await customApp.inject({
      method: 'POST',
      url: `/webhooks/waha/${channelConnectionId}`,
      headers: {
        'content-type': 'application/json',
        'x-webhook-hmac': signature,
        'x-webhook-hmac-algorithm': 'sha512',
        'x-webhook-timestamp': timestampHeader,
      },
      body: rawPayload,
    });

    expect(response.statusCode).toBe(500);
    const json = JSON.parse(response.payload);
    expect(json.error).toBe('Internal server error during webhook ingestion');
    expect(json.error).not.toMatch(/password authentication failed/i);
    expect(json.error).not.toMatch(/FATAL/i);

    await customApp.close();
  });

  // ============================================================================
  // R2H: RATE LIMITING TESTS
  // ============================================================================
  it('WEB-14: rate limiting triggers HTTP 429 Too Many Requests when configured limit is exceeded', async () => {
    const gatewaySpy = vi.spyOn(ingestionGateway, 'ingestChannelEvent');

    // Create app with rate limit max: 2 per minute for testing
    const rateLimitedApp = buildApp({
      secretProvider: new EnvironmentWebhookSecretProvider(new Map([[channelConnectionId, secret]])),
      wahaAdapter: new WahaWebhookAdapter(),
      ingestionGateway,
      logger: false,
      rateLimit: { max: 2, timeWindow: '1 minute' },
    });
    await rateLimitedApp.ready();

    const makeRequest = async (i: number) => {
      const rawPayload = JSON.stringify({
        event: 'message',
        id: `waha_rl_${i}_${crypto.randomUUID()}`,
        payload: {
          id: `wamid_rl_${i}_${crypto.randomUUID()}`,
          from: '5549999112233@c.us',
          body: `Rate limit probe ${i}`,
        },
      });

      const signature = crypto.createHmac('sha512', secret).update(rawPayload).digest('hex');
      return rateLimitedApp.inject({
        method: 'POST',
        url: `/webhooks/waha/${channelConnectionId}`,
        headers: {
          'content-type': 'application/json',
          'x-webhook-hmac': signature,
          'x-webhook-hmac-algorithm': 'sha512',
          'x-webhook-timestamp': Date.now().toString(),
        },
        body: rawPayload,
      });
    };

    // Request 1 -> 202 Accepted
    const res1 = await makeRequest(1);
    expect(res1.statusCode).toBe(202);

    // Request 2 -> 202 Accepted
    const res2 = await makeRequest(2);
    expect(res2.statusCode).toBe(202);

    // Request 3 -> 429 Too Many Requests
    const res3 = await makeRequest(3);
    expect(res3.statusCode).toBe(429);
    const json3 = JSON.parse(res3.payload);
    expect(json3.statusCode).toBe(429);
    expect(json3.error).toBe('Too Many Requests');
    expect(json3.message).toMatch(/rate limit exceeded/i);

    // Gateway was called exactly twice (for requests 1 & 2), not for request 3
    expect(gatewaySpy).toHaveBeenCalledTimes(2);

    await rateLimitedApp.close();
    gatewaySpy.mockRestore();
  });

  it('WEB-15: healthcheck bypasses rate limiting', async () => {
    const rateLimitedApp = buildApp({
      secretProvider: new EnvironmentWebhookSecretProvider(new Map([[channelConnectionId, secret]])),
      wahaAdapter: new WahaWebhookAdapter(),
      ingestionGateway,
      logger: false,
      rateLimit: { max: 1, timeWindow: '1 minute' },
    });
    await rateLimitedApp.ready();

    // Call healthcheck 5 times in a row
    for (let i = 0; i < 5; i++) {
      const res = await rateLimitedApp.inject({
        method: 'GET',
        url: '/health',
      });
      expect(res.statusCode).toBe(200);
      const json = JSON.parse(res.payload);
      expect(json.status).toBeDefined();
    }

    await rateLimitedApp.close();
  });

  it('GW-01: buildApp without ingestionGateway fails clearly at initialization', () => {
    expect(() => {
      buildApp({} as any);
    }).toThrow(/buildApp requires an InboundIngestionGateway instance/i);
  });

  it('GW-02: PostgresInboundIngestionGateway is strictly rejected in production and allowed in development/test', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = 'production';
      expect(() => new PostgresInboundIngestionGateway()).toThrow(/disabled in production/i);

      process.env.NODE_ENV = 'test';
      expect(() => new PostgresInboundIngestionGateway()).not.toThrow();
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });
});
