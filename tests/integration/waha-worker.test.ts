import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import crypto from 'node:crypto';
import { randomUUID } from 'node:crypto';
import { FastifyInstance } from 'fastify';
import { buildApp } from '../../src/interfaces/http/app.js';
import { EnvironmentWebhookSecretProvider } from '../../src/infrastructure/security/environment-webhook-secret-provider.js';
import { WahaWebhookAdapter } from '../../src/infrastructure/channels/waha/waha-webhook-adapter.js';
import { PostgresInboundIngestionGateway } from '../../src/infrastructure/database/postgres-inbound-ingestion-gateway.js';
import { PostgresOutboxProcessingGateway } from '../../src/infrastructure/database/postgres-outbox-processing-gateway.js';
import { WahaInboundWorker } from '../../src/infrastructure/workers/waha-inbound-worker.js';
import { dbPool, query } from '../../src/infrastructure/database/pool.js';

describe('TX Commercial Core — WAHA Worker Lifecycle & Connection Hygiene', () => {
  let app: FastifyInstance;
  let worker: WahaInboundWorker;

  const channelConnectionId = 'a2000000-0000-0000-0000-000000000001';
  const secret = 'whsec_haven_webhook_secret_2026';

  const secretProvider = new EnvironmentWebhookSecretProvider();
  const wahaAdapter = new WahaWebhookAdapter();
  const ingestionGateway = new PostgresInboundIngestionGateway();
  const outboxGateway = new PostgresOutboxProcessingGateway();

  beforeAll(async () => {
    secretProvider.registerSecret(channelConnectionId, secret);
    app = buildApp({
      secretProvider,
      wahaAdapter,
      ingestionGateway,
      logger: false,
    });
    await app.ready();
    worker = new WahaInboundWorker({
      adapter: wahaAdapter,
      outboxGateway,
      pollingIntervalMs: 200, // Fast polling for integration test
      batchSize: 5,
    });
  });

  afterAll(async () => {
    await worker.stop();
    await app.close();
    await dbPool.end();
  });

  it('LIFE-01: worker start() and stop() lifecycle is idempotent, processes events in background and shuts down cleanly', async () => {
    // 1. Start worker in background (idempotent multiple calls)
    worker.start();
    worker.start();

    const phoneDigits = '5549' + Math.floor(Math.random() * 89999999 + 10000000);
    const msgId = `msg_life_01_${randomUUID()}`;
    const rawPayload = JSON.stringify({
      event: 'message',
      id: `evt_life_01_${randomUUID()}`,
      payload: {
        id: msgId,
        from: `${phoneDigits}@c.us`,
        pushName: 'Background Worker Test',
        body: 'Mensagem processada pelo worker em background',
        timestamp: Date.now(),
      },
    });

    const signature = crypto.createHmac('sha512', secret).update(rawPayload).digest('hex');
    const timestamp = Date.now().toString();

    // 2. Post webhook to Fastify app
    const res = await app.inject({
      method: 'POST',
      url: `/webhooks/waha/${channelConnectionId}`,
      headers: {
        'content-type': 'application/json',
        'x-webhook-hmac': signature,
        'x-webhook-hmac-algorithm': 'sha512',
        'x-webhook-timestamp': timestamp,
      },
      body: rawPayload,
    });
    expect(res.statusCode).toBe(202);

    // 3. Wait for worker polling tick to automatically consume and normalize
    let found = false;
    for (let i = 0; i < 50; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const msgRes = await query(
        'SELECT id, text_content FROM public.conversation_messages WHERE provider_message_id = $1',
        [msgId]
      );
      if (msgRes.rowCount === 1) {
        found = true;
        expect(msgRes.rows[0].text_content).toBe('Mensagem processada pelo worker em background');
        break;
      }
    }
    expect(found).toBe(true);

    // 4. Stop worker (idempotent multiple calls)
    await worker.stop();
    await worker.stop();
  });

  it('LIFE-02: worker does not leak service_role claim or role to pooled database connections', async () => {
    // Process single batch to trigger worker database interactions
    await worker.processSingleBatch();

    // Acquire connection from the exact same pool and inspect its session state
    const client = await dbPool.connect();
    try {
      const res = await client.query<{
        current_user_name: string;
        jwt_claim_role: string;
        is_service_role: boolean;
      }>(`
        SELECT
          current_user AS current_user_name,
          COALESCE(pg_catalog.current_setting('request.jwt.claim.role', true), '') AS jwt_claim_role,
          public.is_service_role() AS is_service_role
      `);

      const state = res.rows[0];

      // 1. Role must not be 'service_role' (must remain default login postgres)
      expect(state.current_user_name).not.toBe('service_role');
      expect(state.current_user_name).toBe('postgres');

      // 2. JWT claim role setting must be empty/null (not 'service_role')
      expect(state.jwt_claim_role).toBe('');

      // 3. is_service_role() function must strictly evaluate to false
      expect(state.is_service_role).toBe(false);
    } finally {
      client.release();
    }
  });

  it('LIFE-03: worker normalizes a LID only when the injected resolver returns a verified WAHA phone JID', async () => {
    const lid = `opaque-${randomUUID()}@lid`;
    const phoneDigits = '5549' + Math.floor(Math.random() * 89999999 + 10000000);
    const msgId = `msg_lid_resolved_${randomUUID()}`;
    const inserted = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: `message:${msgId}`,
      eventType: 'message',
      rawPayload: {
        event: 'message',
        session: 'waha-test-session',
        payload: { id: msgId, from: lid, body: 'LID resolvido com evidência', timestamp: Date.now() },
      },
    });
    const resolver = { resolvePhone: async () => `${phoneDigits}@c.us` };
    const resolvingWorker = new WahaInboundWorker({
      adapter: wahaAdapter,
      outboxGateway,
      lidIdentityResolver: resolver,
    });

    await resolvingWorker.processSingleBatch();
    const message = await query(
      'SELECT text_content FROM public.conversation_messages WHERE provider_message_id = $1',
      [msgId],
    );
    expect(message.rowCount).toBe(1);
    expect(message.rows[0].text_content).toBe('LID resolvido com evidência');
    await resolvingWorker.stop();
    expect(inserted.inboundEventId).toBeTruthy();
  });
});
