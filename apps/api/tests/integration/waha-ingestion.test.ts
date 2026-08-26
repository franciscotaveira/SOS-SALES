import { describe, it, expect, afterAll } from 'vitest';
import crypto, { randomUUID } from 'node:crypto';
import { dbPool, query } from '../../src/infrastructure/database/pool.js';
import { WahaWebhookAdapter } from '../../src/infrastructure/channels/waha/waha-webhook-adapter.js';
import { WahaInboundWorker } from '../../src/infrastructure/workers/waha-inbound-worker.js';
import { PostgresInboundIngestionGateway } from '../../src/infrastructure/database/postgres-inbound-ingestion-gateway.js';
import { PostgresOutboxProcessingGateway } from '../../src/infrastructure/database/postgres-outbox-processing-gateway.js';

/** Factory: creates a WahaInboundWorker with all required P0.3B dependencies. */
function makeWorker(options?: Partial<Omit<ConstructorParameters<typeof WahaInboundWorker>[0], 'adapter' | 'outboxGateway'>>): WahaInboundWorker {
  return new WahaInboundWorker({
    adapter: new WahaWebhookAdapter(),
    outboxGateway: new PostgresOutboxProcessingGateway(),
    ...options,
  });
}

describe('TX Commercial Core — WAHA Inbound Pipeline, Security & Concurrency (P0.3A-R2E)', () => {
  const channelConnectionId = 'a2000000-0000-0000-0000-000000000001';
  const workspaceId = 'a0000000-0000-0000-0000-000000000001';
  const adapter = new WahaWebhookAdapter();
  const ingestionGateway = new PostgresInboundIngestionGateway();

  afterAll(async () => {
    await dbPool.end();
  });

  /**
   * Bounded helper to process worker batches until a specific outbox event reaches an expected status.
   */
  async function processUntilStatus(
    worker: WahaInboundWorker,
    outboxQuery: { id?: string; aggregateId?: string },
    expectedStatuses: string[],
    maxIterations = 20,
    delayMs = 25
  ): Promise<{ status: string; attempts: number; last_error: string | null }> {
    let lastRow: { status: string; attempts: number; last_error: string | null } | undefined;

    for (let i = 0; i < maxIterations; i++) {
      await worker.processSingleBatch();

      let res;
      if (outboxQuery.id) {
        res = await query<{ status: string; attempts: number; last_error: string | null }>(
          'SELECT status, attempts, last_error FROM outbox_events WHERE id = $1',
          [outboxQuery.id]
        );
      } else {
        res = await query<{ status: string; attempts: number; last_error: string | null }>(
          'SELECT status, attempts, last_error FROM outbox_events WHERE aggregate_id = $1',
          [outboxQuery.aggregateId]
        );
      }

      if (res.rowCount > 0) {
        lastRow = res.rows[0];
        if (expectedStatuses.includes(lastRow.status)) {
          return lastRow;
        }
      }

      await new Promise((r) => setTimeout(r, delayMs));
    }

    throw new Error(
      `Outbox event (${JSON.stringify(outboxQuery)}) expected status in [${expectedStatuses.join(', ')}], ` +
      `found ${lastRow?.status} (attempts: ${lastRow?.attempts}, last_error: ${lastRow?.last_error}) after ${maxIterations} iterations`
    );
  }

  // ============================================================================
  // 1. SECURITY & CHANNEL VALIDATION TESTS (SEC-01 .. SEC-08)
  // ============================================================================
  it('SEC-01: postgres connection without service_role claim must evaluate is_service_role() = false', async () => {
    const client = await dbPool.connect();
    try {
      const res = await client.query('SELECT public.is_service_role() AS is_service_role');
      expect(res.rows[0].is_service_role).toBe(false);
    } finally {
      client.release();
    }
  });

  it('SEC-02: authenticated and anon roles cannot execute ingestion RPCs directly', async () => {
    const client = await dbPool.connect();
    try {
      // 1. Test as authenticated
      await client.query('SET ROLE authenticated');
      await client.query(`SELECT set_config('request.jwt.claim.role', 'authenticated', true)`);

      await expect(
        client.query(
          `SELECT * FROM public.ingest_channel_event($1, 'message:evt_sec_01', 'message', '{}'::jsonb)`,
          [channelConnectionId]
        )
      ).rejects.toThrow(/permission denied/i);

      await expect(
        client.query(
          `SELECT * FROM public.normalize_waha_inbound_message(gen_random_uuid(), '+5549999999999', '5549999999999@c.us', 'Test', 'msg_01', 'Oi', NULL, NOW())`
        )
      ).rejects.toThrow(/permission denied/i);

      // 2. Test as anon
      await client.query('SET ROLE anon');
      await client.query(`SELECT set_config('request.jwt.claim.role', 'anon', true)`);

      await expect(
        client.query(
          `SELECT * FROM public.ingest_channel_event($1, 'message:evt_sec_02', 'message', '{}'::jsonb)`,
          [channelConnectionId]
        )
      ).rejects.toThrow(/permission denied/i);
    } finally {
      await client.query('RESET ROLE').catch(() => {});
      client.release();
    }
  });

  it('SEC-03: PostgresInboundIngestionGateway with service_role claim successfully executes the RPC', async () => {
    const msgId = `msg_gw_${crypto.randomUUID()}`;
    const result = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: `message:${msgId}`,
      eventType: 'message',
      rawPayload: { event: 'message', id: msgId, text: 'Gateway Test' },
    });

    expect(result.inboundEventId).toBeDefined();
    expect(result.workspaceId).toBe(workspaceId);
    expect(result.isDuplicate).toBe(false);
  });

  it('SEC-04: ingest_channel_event rejects channel connection with non-waha provider (e.g. evolution)', async () => {
    const isolatedWsId = randomUUID();
    const evolutionChannelId = randomUUID();
    await query(`
      INSERT INTO workspaces (id, name, slug) VALUES ('${isolatedWsId}', 'Evolution WS', 'ws-evo-${isolatedWsId}');
      INSERT INTO channel_connections (id, workspace_id, provider, phone_number, name, status)
      VALUES ('${evolutionChannelId}', '${isolatedWsId}', 'evolution', '+5549988880001', 'Evolution Bot', 'CONNECTED');
    `);

    await expect(
      ingestionGateway.ingestChannelEvent({
        channelConnectionId: evolutionChannelId,
        providerEventId: `message:${randomUUID()}`,
        eventType: 'message',
        rawPayload: { event: 'message', body: 'Evolution message' },
      })
    ).rejects.toThrow(/expected waha/i);
  });

  it('SEC-05: ingest_channel_event rejects WAHA channel connection with status = DISCONNECTED', async () => {
    const isolatedWsId = randomUUID();
    const disconnectedChannelId = randomUUID();
    await query(`
      INSERT INTO workspaces (id, name, slug) VALUES ('${isolatedWsId}', 'Disconnected WS', 'ws-disc-${isolatedWsId}');
      INSERT INTO channel_connections (id, workspace_id, provider, phone_number, name, status)
      VALUES ('${disconnectedChannelId}', '${isolatedWsId}', 'waha', '+5549988880002', 'Disconnected WAHA', 'DISCONNECTED');
    `);

    await expect(
      ingestionGateway.ingestChannelEvent({
        channelConnectionId: disconnectedChannelId,
        providerEventId: `message:${randomUUID()}`,
        eventType: 'message',
        rawPayload: { event: 'message', body: 'Disconnected message' },
      })
    ).rejects.toThrow(/is not connected/i);
  });

  it('SEC-06: worker enforces lineage integrity — malicious outbox payload with cross-workspace reference is rejected', async () => {
    const workspaceBId = randomUUID();
    const channelBId = randomUUID();
    const eventBId = randomUUID();
    await query(`
      INSERT INTO workspaces (id, name, slug) VALUES ('${workspaceBId}', 'Workspace B Integrity', 'ws-b-integ-${workspaceBId}');
      INSERT INTO channel_connections (id, workspace_id, provider, phone_number, name, status)
      VALUES ('${channelBId}', '${workspaceBId}', 'waha', '+5549988880003', 'WAHA B', 'CONNECTED');
      INSERT INTO inbound_channel_events (id, workspace_id, channel_connection_id, provider, provider_event_id, event_type, raw_payload)
      VALUES ('${eventBId}', '${workspaceBId}', '${channelBId}', 'waha', 'message:malicious_01', 'message', '{"event":"message","payload":{"id":"malicious_01","from":"5549999112233@c.us","body":"Hacking"}}'::jsonb);
    `);

    const outboxId = randomUUID();
    await query(`
      INSERT INTO outbox_events (
        id, workspace_id, event_name, aggregate_type, aggregate_id, payload, idempotency_key
      ) VALUES (
        '${outboxId}',
        '${workspaceId}',
        'inbound.channel_event_received',
        'InboundChannelEvent',
        '${eventBId}',
        '{"inboundEventId": "${eventBId}"}'::jsonb,
        'outbox_malicious_${outboxId}'
      );
    `);

    const worker = makeWorker();
    const settled = await processUntilStatus(worker, { id: outboxId }, ['FAILED', 'DEAD_LETTER']);

    expect(settled.status).toBe('FAILED');
    expect(settled.last_error).toMatch(/integrity violation/i);
  });

  it('SEC-07: normalize_waha_inbound_message rejects inbound envelope with provider != waha (e.g. evolution)', async () => {
    const fakeWsId = randomUUID();
    const fakeChanId = randomUUID();
    const fakeEvtId = randomUUID();
    const fakeMsgId = `evo_msg_${randomUUID()}`;
    await query(`
      INSERT INTO workspaces (id, name, slug) VALUES ('${fakeWsId}', 'Evo Env WS', 'evo-ws-${fakeWsId}');
      INSERT INTO channel_connections (id, workspace_id, provider, phone_number, name, status)
      VALUES ('${fakeChanId}', '${fakeWsId}', 'evolution', '+5549988889999', 'Evo Ch', 'CONNECTED');
      INSERT INTO inbound_channel_events (id, workspace_id, channel_connection_id, provider, provider_event_id, event_type, raw_payload)
      VALUES ('${fakeEvtId}', '${fakeWsId}', '${fakeChanId}', 'evolution', 'message:${fakeMsgId}', 'message', '{"event":"message"}'::jsonb);
    `);

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
      await client.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);

      await expect(
        client.query(
          `SELECT * FROM public.normalize_waha_inbound_message($1, '+5549999112233', '5549999112233@c.us', 'Evo User', 'wamid_evo_01', 'Oi', NULL, NOW())`,
          [fakeEvtId]
        )
      ).rejects.toThrow(/expected waha, found evolution/i);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });

  it('SEC-08: normalize_waha_inbound_message rejects non-message envelope (e.g. event_type = message.ack)', async () => {
    const ackEvtId = randomUUID();
    const ackUlid = `ack_ulid_${randomUUID()}`;
    await query(`
      INSERT INTO inbound_channel_events (id, workspace_id, channel_connection_id, provider, provider_event_id, event_type, raw_payload)
      VALUES ('${ackEvtId}', '${workspaceId}', '${channelConnectionId}', 'waha', 'message.ack:${ackUlid}', 'message.ack', '{"event":"message.ack"}'::jsonb);
    `);

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
      await client.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);

      await expect(
        client.query(
          `SELECT * FROM public.normalize_waha_inbound_message($1, '+5549999112233', '5549999112233@c.us', 'Ack User', 'wamid_ack_01', 'Oi', NULL, NOW())`,
          [ackEvtId]
        )
      ).rejects.toThrow(/expected message or message\.any, found message\.ack/i);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });

  // ============================================================================
  // 2. INGESTION PIPELINE & INVARIANT TESTS (ING-01 .. ING-16)
  // ============================================================================
  it('ING-01: raw envelope stored with workspace derived strictly from channel connection', async () => {
    const msgId = `wamid_raw_${crypto.randomUUID()}`;
    const result = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: `message:${msgId}`,
      eventType: 'message',
      rawPayload: { event: 'message', id: msgId, test: 'envelope_01' },
    });

    const envelope = await query<{ workspace_id: string }>(
      'SELECT workspace_id FROM inbound_channel_events WHERE id = $1',
      [result.inboundEventId]
    );

    expect(envelope.rows[0].workspace_id).toBe(workspaceId);
  });

  it('ING-02: deduplication by provider_event_id returns isDuplicate: true and skips duplicate outbox', async () => {
    const msgId = `wamid_dedup_${crypto.randomUUID()}`;
    const providerEventId = `message:${msgId}`;

    const res1 = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId,
      eventType: 'message',
      rawPayload: { event: 'message', id: msgId, test: 'dedup_original' },
    });
    expect(res1.isDuplicate).toBe(false);

    const res2 = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId,
      eventType: 'message',
      rawPayload: { event: 'message', id: msgId, test: 'dedup_retry' },
    });
    expect(res2.isDuplicate).toBe(true);
    expect(res2.inboundEventId).toBe(res1.inboundEventId);

    const outboxCount = await query<{ count: string }>(
      `SELECT count(*) as count FROM outbox_events WHERE aggregate_id = $1`,
      [res1.inboundEventId]
    );
    expect(Number(outboxCount.rows[0].count)).toBe(1);
  });

  it('ING-03: Asynchrony Proof — envelope exists before worker, 0 messages; worker runs -> 1 message', async () => {
    const providerMessageId = `wamid_async_${crypto.randomUUID()}`;
    const randomPhone = `+5549${Math.floor(Math.random() * 89999999 + 10000000)}`;

    const rawPayload = {
      event: 'message',
      payload: {
        id: providerMessageId,
        from: `${randomPhone.replace('+', '')}@c.us`,
        pushName: 'Cliente Async Test',
        body: 'Mensagem para testar assincronia estrita',
        timestamp: Date.now(),
      },
    };

    // 1. Ingest via Gateway
    const ingestion = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: `message:${providerMessageId}`,
      eventType: 'message',
      rawPayload,
    });

    // 2. Verify Envelope exists in DB
    const envRes = await query('SELECT id FROM inbound_channel_events WHERE id = $1', [ingestion.inboundEventId]);
    expect(envRes.rowCount).toBe(1);

    // 3. Verify zero conversation messages exist BEFORE worker runs
    const beforeMsgs = await query(
      'SELECT id FROM conversation_messages WHERE provider_message_id = $1',
      [providerMessageId]
    );
    expect(beforeMsgs.rowCount).toBe(0);

    // 4. Run Worker until settled
    const worker = makeWorker();
    const settled = await processUntilStatus(worker, { aggregateId: ingestion.inboundEventId }, ['PUBLISHED']);
    expect(settled.status).toBe('PUBLISHED');

    // 5. Verify conversation message exists AFTER worker runs
    const afterMsgs = await query<{ text_content: string }>(
      'SELECT text_content FROM conversation_messages WHERE provider_message_id = $1',
      [providerMessageId]
    );
    expect(afterMsgs.rowCount).toBe(1);
    expect(afterMsgs.rows[0].text_content).toBe('Mensagem para testar assincronia estrita');
  });

  it('ING-04: worker normalizes contact into E.164 format and persists contacts.whatsapp_id', async () => {
    const providerMessageId = `wamid_e164_${crypto.randomUUID()}`;
    const randomPhone = `+5549${Math.floor(Math.random() * 89999999 + 10000000)}`;
    const expectedWhatsappId = `${randomPhone.replace('+', '')}@c.us`;

    const ingestion = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: `message:${providerMessageId}`,
      eventType: 'message',
      rawPayload: {
        event: 'message',
        payload: {
          id: providerMessageId,
          from: expectedWhatsappId,
          pushName: 'Joana Normalizada',
          body: 'Teste de número E.164 e whatsapp_id',
          timestamp: Date.now(),
        },
      },
    });

    const worker = makeWorker();
    await processUntilStatus(worker, { aggregateId: ingestion.inboundEventId }, ['PUBLISHED']);

    const contact = await query<{ phone: string; whatsapp_id: string; name: string }>(
      'SELECT phone, whatsapp_id, name FROM contacts WHERE workspace_id = $1 AND phone = $2',
      [workspaceId, randomPhone]
    );
    expect(contact.rowCount).toBe(1);
    expect(contact.rows[0].phone).toBe(randomPhone);
    expect(contact.rows[0].whatsapp_id).toBe(expectedWhatsappId);
    expect(contact.rows[0].name).toBe('Joana Normalizada');
  });

  it('ING-05: worker automatically opens a new commercial journey for new contact', async () => {
    const providerMessageId = `wamid_journey_${crypto.randomUUID()}`;
    const randomPhone = `+5549${Math.floor(Math.random() * 89999999 + 10000000)}`;

    const ingestion = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: `message:${providerMessageId}`,
      eventType: 'message',
      rawPayload: {
        event: 'message',
        payload: {
          id: providerMessageId,
          from: `${randomPhone.replace('+', '')}@c.us`,
          pushName: 'Novo Lead',
          body: 'Gostaria de agendar',
          timestamp: Date.now(),
        },
      },
    });

    const worker = makeWorker();
    await processUntilStatus(worker, { aggregateId: ingestion.inboundEventId }, ['PUBLISHED']);

    const journey = await query<{ status: string; contact_id: string }>(
      `SELECT j.status, j.contact_id
       FROM commercial_journeys j
       JOIN contacts c ON c.id = j.contact_id
       WHERE c.phone = $1 AND j.status = 'OPEN'`,
      [randomPhone]
    );
    expect(journey.rowCount).toBe(1);
    expect(journey.rows[0].status).toBe('OPEN');
  });

  it('ING-06: subsequent messages from same contact bind to existing OPEN journey (partial index invariant)', async () => {
    const randomPhone = `+5549${Math.floor(Math.random() * 89999999 + 10000000)}`;
    const msgId1 = `wamid_sub1_${crypto.randomUUID()}`;
    const msgId2 = `wamid_sub2_${crypto.randomUUID()}`;

    // Message 1
    const res1 = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: `message:${msgId1}`,
      eventType: 'message',
      rawPayload: {
        event: 'message',
        payload: {
          id: msgId1,
          from: `${randomPhone.replace('+', '')}@c.us`,
          body: 'Primeira mensagem',
          timestamp: Date.now(),
        },
      },
    });

    // Message 2
    const res2 = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: `message:${msgId2}`,
      eventType: 'message',
      rawPayload: {
        event: 'message',
        payload: {
          id: msgId2,
          from: `${randomPhone.replace('+', '')}@c.us`,
          body: 'Segunda mensagem',
          timestamp: Date.now(),
        },
      },
    });

    const worker = makeWorker();
    await processUntilStatus(worker, { aggregateId: res1.inboundEventId }, ['PUBLISHED']);
    await processUntilStatus(worker, { aggregateId: res2.inboundEventId }, ['PUBLISHED']);

    const journeys = await query<{ id: string }>(
      `SELECT j.id FROM commercial_journeys j
       JOIN contacts c ON c.id = j.contact_id
       WHERE c.phone = $1 AND j.status = 'OPEN'`,
      [randomPhone]
    );

    // Exactly 1 open journey maintained
    expect(journeys.rowCount).toBe(1);

    const msgs = await query<{ journey_id: string }>(
      `SELECT m.journey_id FROM conversation_messages m
       JOIN contacts c ON c.id = m.contact_id
       WHERE c.phone = $1`,
      [randomPhone]
    );
    expect(msgs.rowCount).toBe(2);
    expect(msgs.rows[0].journey_id).toBe(journeys.rows[0].id);
    expect(msgs.rows[1].journey_id).toBe(journeys.rows[0].id);
  });

  it('ING-07: media metadata stored in media_payload without binary content', async () => {
    const providerMessageId = `wamid_media_${crypto.randomUUID()}`;
    const randomPhone = `+5549${Math.floor(Math.random() * 89999999 + 10000000)}`;

    const ingestion = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: `message:${providerMessageId}`,
      eventType: 'message',
      rawPayload: {
        event: 'message',
        payload: {
          id: providerMessageId,
          from: `${randomPhone.replace('+', '')}@c.us`,
          hasMedia: true,
          media: {
            mimetype: 'image/jpeg',
            filename: 'foto_cabelo.jpg',
            filesize: 125000,
            url: 'https://waha.internal/media/foto_cabelo.jpg',
            caption: 'Foto do meu cabelo hoje',
          },
          timestamp: Date.now(),
        },
      },
    });

    const worker = makeWorker();
    await processUntilStatus(worker, { aggregateId: ingestion.inboundEventId }, ['PUBLISHED']);

    const msg = await query<{ media_payload: { mimetype: string; filename: string } }>(
      'SELECT media_payload FROM conversation_messages WHERE provider_message_id = $1',
      [providerMessageId]
    );

    expect(msg.rowCount).toBe(1);
    expect(msg.rows[0].media_payload.mimetype).toBe('image/jpeg');
    expect(msg.rows[0].media_payload.filename).toBe('foto_cabelo.jpg');
  });

  it('ING-08: outbound message (fromMe: true) keeps envelope, is IGNORED and completes outbox without creating message', async () => {
    const providerMessageId = `wamid_out_${crypto.randomUUID()}`;

    const res = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: `message:${providerMessageId}`,
      eventType: 'message',
      rawPayload: {
        event: 'message',
        payload: {
          id: providerMessageId,
          from: '5549999112233@c.us',
          fromMe: true,
          body: 'Resposta do atendente Haven',
        },
      },
    });

    const worker = makeWorker();
    const settled = await processUntilStatus(worker, { aggregateId: res.inboundEventId }, ['PUBLISHED']);

    // Envelope persists
    const env = await query('SELECT id FROM inbound_channel_events WHERE id = $1', [res.inboundEventId]);
    expect(env.rowCount).toBe(1);

    // Outbox is marked completed (PUBLISHED)
    expect(settled.status).toBe('PUBLISHED');

    // No conversation message created for outbound waha
    const msg = await query('SELECT id FROM conversation_messages WHERE provider_message_id = $1', [
      providerMessageId,
    ]);
    expect(msg.rowCount).toBe(0);
  });

  it('ING-09: group message (@g.us) keeps envelope, is IGNORED and completes outbox without creating message', async () => {
    const providerMessageId = `wamid_grp_${crypto.randomUUID()}`;

    const res = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: `message:${providerMessageId}`,
      eventType: 'message',
      rawPayload: {
        event: 'message',
        payload: {
          id: providerMessageId,
          from: '123456-7890@g.us',
          isGroup: true,
          body: 'Mensagem no grupo da família',
        },
      },
    });

    const worker = makeWorker();
    const settled = await processUntilStatus(worker, { aggregateId: res.inboundEventId }, ['PUBLISHED']);

    const env = await query('SELECT id FROM inbound_channel_events WHERE id = $1', [res.inboundEventId]);
    expect(env.rowCount).toBe(1);
    expect(settled.status).toBe('PUBLISHED');

    const msg = await query('SELECT id FROM conversation_messages WHERE provider_message_id = $1', [
      providerMessageId,
    ]);
    expect(msg.rowCount).toBe(0);
  });

  it('ING-10: inbound customer message missing message ID is INVALID and transitions outbox to FAILED with retries', async () => {
    const eventId = `waha_invalid_msg_${crypto.randomUUID()}`;

    const res = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: `message:${eventId}`,
      eventType: 'message',
      rawPayload: {
        event: 'message',
        id: eventId,
        payload: {
          from: '5549999112233@c.us',
          body: 'Mensagem sem ID',
        },
      },
    });

    const worker = makeWorker();
    const settled = await processUntilStatus(worker, { aggregateId: res.inboundEventId }, ['FAILED', 'DEAD_LETTER']);

    expect(settled.status).toBe('FAILED');
    expect(settled.attempts).toBe(1);
    expect(settled.last_error).toMatch(/Invalid inbound message/i);
  });

  it('ING-11: 20 concurrent identical webhook ingestions => exactly 1 envelope + 1 outbox event', async () => {
    const msgId = `wamid_concurrent_20_${crypto.randomUUID()}`;
    const providerEventId = `message:${msgId}`;

    const attempts = await Promise.all(
      Array.from({ length: 20 }, () =>
        ingestionGateway.ingestChannelEvent({
          channelConnectionId,
          providerEventId,
          eventType: 'message',
          rawPayload: {
            event: 'message',
            payload: {
              id: msgId,
              from: '5549999112233@c.us',
              body: 'Concorrência de 20 chamadas',
            },
          },
        })
      )
    );

    // Exactly 1 attempt is not duplicate, 19 are duplicates
    const nonDuplicates = attempts.filter((a) => !a.isDuplicate);
    const duplicates = attempts.filter((a) => a.isDuplicate);
    expect(nonDuplicates.length).toBe(1);
    expect(duplicates.length).toBe(19);

    const canonicalId = nonDuplicates[0].inboundEventId;
    for (const dup of duplicates) {
      expect(dup.inboundEventId).toBe(canonicalId);
    }

    const envelopeCount = await query<{ count: string }>(
      'SELECT count(*) as count FROM inbound_channel_events WHERE provider_event_id = $1',
      [providerEventId]
    );
    expect(Number(envelopeCount.rows[0].count)).toBe(1);

    const outboxCount = await query<{ count: string }>(
      'SELECT count(*) as count FROM outbox_events WHERE aggregate_id = $1',
      [canonicalId]
    );
    expect(Number(outboxCount.rows[0].count)).toBe(1);
  }, 20000);

  it('ING-12: same phone number in two distinct workspaces => contacts and journeys completely isolated', async () => {
    const sharedPhone = `+5549${Math.floor(Math.random() * 89999999 + 10000000)}`;

    const workspace2Id = randomUUID();
    const channel2Id = randomUUID();
    await query(`
      INSERT INTO workspaces (id, name, slug) VALUES ('${workspace2Id}', 'Salão Beta', 'salao-beta-${workspace2Id}');
      INSERT INTO channel_connections (id, workspace_id, provider, phone_number, name, status)
      VALUES ('${channel2Id}', '${workspace2Id}', 'waha', '+5549988776655', 'WhatsApp Beta', 'CONNECTED');
    `);

    const msg1Id = `wamid_ws1_${crypto.randomUUID()}`;
    const res1 = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: `message:${msg1Id}`,
      eventType: 'message',
      rawPayload: {
        event: 'message',
        payload: { id: msg1Id, from: `${sharedPhone.replace('+', '')}@c.us`, body: 'Msg Workspace 1' },
      },
    });

    const msg2Id = `wamid_ws2_${crypto.randomUUID()}`;
    const res2 = await ingestionGateway.ingestChannelEvent({
      channelConnectionId: channel2Id,
      providerEventId: `message:${msg2Id}`,
      eventType: 'message',
      rawPayload: {
        event: 'message',
        payload: { id: msg2Id, from: `${sharedPhone.replace('+', '')}@c.us`, body: 'Msg Workspace 2' },
      },
    });

    const worker = makeWorker();
    await processUntilStatus(worker, { aggregateId: res1.inboundEventId }, ['PUBLISHED']);
    await processUntilStatus(worker, { aggregateId: res2.inboundEventId }, ['PUBLISHED']);

    // Verify separate contacts
    const contactsWs1 = await query<{ id: string }>(
      'SELECT id FROM contacts WHERE workspace_id = $1 AND phone = $2',
      [workspaceId, sharedPhone]
    );
    const contactsWs2 = await query<{ id: string }>(
      'SELECT id FROM contacts WHERE workspace_id = $1 AND phone = $2',
      [workspace2Id, sharedPhone]
    );
    expect(contactsWs1.rowCount).toBe(1);
    expect(contactsWs2.rowCount).toBe(1);
    expect(contactsWs1.rows[0].id).not.toBe(contactsWs2.rows[0].id);

    // Verify separate journeys
    const journeysWs1 = await query<{ id: string }>(
      'SELECT id FROM commercial_journeys WHERE workspace_id = $1 AND contact_id = $2',
      [workspaceId, contactsWs1.rows[0].id]
    );
    const journeysWs2 = await query<{ id: string }>(
      'SELECT id FROM commercial_journeys WHERE workspace_id = $1 AND contact_id = $2',
      [workspace2Id, contactsWs2.rows[0].id]
    );
    expect(journeysWs1.rowCount).toBe(1);
    expect(journeysWs2.rowCount).toBe(1);
    expect(journeysWs1.rows[0].id).not.toBe(journeysWs2.rows[0].id);
  });

  it('ING-13: two concurrent messages from the same contact => exactly 1 OPEN journey created', async () => {
    const sharedPhone = `+5549${Math.floor(Math.random() * 89999999 + 10000000)}`;
    const msg1Id = `wamid_concur1_${crypto.randomUUID()}`;
    const msg2Id = `wamid_concur2_${crypto.randomUUID()}`;

    const res1 = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: `message:${msg1Id}`,
      eventType: 'message',
      rawPayload: {
        event: 'message',
        payload: { id: msg1Id, from: `${sharedPhone.replace('+', '')}@c.us`, body: 'Msg 1' },
      },
    });

    const res2 = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: `message:${msg2Id}`,
      eventType: 'message',
      rawPayload: {
        event: 'message',
        payload: { id: msg2Id, from: `${sharedPhone.replace('+', '')}@c.us`, body: 'Msg 2' },
      },
    });

    const client1 = await dbPool.connect();
    const client2 = await dbPool.connect();

    const runNormalized = async (client: import('pg').PoolClient, eventId: string, msgId: string) => {
      try {
        await client.query('BEGIN');
        await client.query('SET LOCAL ROLE service_role');
        await client.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);
        const res = await client.query<{ journey_id: string }>(
          `SELECT * FROM public.normalize_waha_inbound_message($1, $2, $3, 'Lead Concur', $4, 'Msg', NULL, NOW())`,
          [eventId, sharedPhone, `${sharedPhone.replace('+', '')}@c.us`, msgId]
        );
        await client.query('COMMIT');
        return res;
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        throw err;
      } finally {
        await client.query('RESET ROLE').catch(() => {});
        client.release();
      }
    };

    const [norm1, norm2] = await Promise.all([
      runNormalized(client1, res1.inboundEventId, msg1Id),
      runNormalized(client2, res2.inboundEventId, msg2Id),
    ]);

    expect(norm1.rows[0].journey_id).toBe(norm2.rows[0].journey_id);

    const openJourneys = await query<{ count: string }>(
      `SELECT count(*) as count FROM commercial_journeys j
       JOIN contacts c ON c.id = j.contact_id
       WHERE c.phone = $1 AND j.status = 'OPEN'`,
      [sharedPhone]
    );
    expect(Number(openJourneys.rows[0].count)).toBe(1);
  });

  it('ING-14: linked-device LID is retained as an immutable event but does NOT create contact, journey, message or DLQ retries', async () => {
    const invalidPhoneMsgId = `wamid_invalid_phone_${crypto.randomUUID()}`;

    const res = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: `message:${invalidPhoneMsgId}`,
      eventType: 'message',
      rawPayload: {
        event: 'message',
        payload: {
          id: invalidPhoneMsgId,
          from: '123456789012345678@lid',
          body: 'Msg com LID',
        },
      },
    });

    const worker = makeWorker();
    const settled = await processUntilStatus(worker, { aggregateId: res.inboundEventId }, ['PUBLISHED']);

    expect(settled.status).toBe('PUBLISHED');
    expect(settled.last_error).toBeNull();

    const client = await dbPool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
      await client.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);

      await expect(
        client.query(
          `SELECT * FROM public.normalize_waha_inbound_message($1, 'abc', NULL, 'Bad Phone', 'msg_abc', 'Text', NULL, NOW())`,
          [res.inboundEventId]
        )
      ).rejects.toThrow(/Invalid E.164 phone number/i);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }

    const msgs = await query(
      'SELECT id FROM conversation_messages WHERE provider_message_id = $1',
      [invalidPhoneMsgId]
    );
    expect(msgs.rowCount).toBe(0);
  });

  it('ING-15: message.ack and message.reaction events preserve envelope, return IGNORED and NEVER create conversation_message', async () => {
    const ackUlid = `01J5K4M7N8P9Q0R1S2T3U4V5WA_${randomUUID()}`;
    const reactionUlid = `01J5K4M7N8P9Q0R1S2T3U4V5WR_${randomUUID()}`;
    const ackMsgId = `wamid_ack_target_${randomUUID()}`;

    // Ingest message.ack
    const ackIngest = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: `message.ack:${ackUlid}`,
      eventType: 'message.ack',
      rawPayload: {
        event: 'message.ack',
        id: ackUlid,
        payload: { id: ackMsgId, ack: 3 },
      },
    });

    // Ingest message.reaction
    const reactionIngest = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId: `message.reaction:${reactionUlid}`,
      eventType: 'message.reaction',
      rawPayload: {
        event: 'message.reaction',
        id: reactionUlid,
        payload: { id: ackMsgId, reaction: { text: '❤️' } },
      },
    });

    const worker = makeWorker();
    const ackSettled = await processUntilStatus(worker, { aggregateId: ackIngest.inboundEventId }, ['PUBLISHED']);
    const reactSettled = await processUntilStatus(worker, { aggregateId: reactionIngest.inboundEventId }, ['PUBLISHED']);

    // Verify both envelopes exist
    const ackEnv = await query('SELECT id FROM inbound_channel_events WHERE id = $1', [ackIngest.inboundEventId]);
    const reactEnv = await query('SELECT id FROM inbound_channel_events WHERE id = $1', [reactionIngest.inboundEventId]);
    expect(ackEnv.rowCount).toBe(1);
    expect(reactEnv.rowCount).toBe(1);

    // Verify both outbox events are marked completed (PUBLISHED)
    expect(ackSettled.status).toBe('PUBLISHED');
    expect(reactSettled.status).toBe('PUBLISHED');

    // Zero messages created
    const msgs = await query(
      'SELECT id FROM conversation_messages WHERE provider_message_id = $1',
      [ackMsgId]
    );
    expect(msgs.rowCount).toBe(0);
  });

  it('ING-16: repeated lifecycle event uses stable top-level envelope ID and enforces idempotency', async () => {
    const sessionUlid = `01J5K4M7N8P9Q0R1S2T3U4V5SS_${randomUUID()}`;
    const providerEventId = `session.status:${sessionUlid}`;

    const res1 = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId,
      eventType: 'session.status',
      rawPayload: {
        event: 'session.status',
        id: sessionUlid,
        payload: { status: 'CONNECTED' },
      },
    });
    expect(res1.isDuplicate).toBe(false);

    const res2 = await ingestionGateway.ingestChannelEvent({
      channelConnectionId,
      providerEventId,
      eventType: 'session.status',
      rawPayload: {
        event: 'session.status',
        id: sessionUlid,
        payload: { status: 'CONNECTED' },
      },
    });
    expect(res2.isDuplicate).toBe(true);
    expect(res2.inboundEventId).toBe(res1.inboundEventId);
  });
}, 30000);
