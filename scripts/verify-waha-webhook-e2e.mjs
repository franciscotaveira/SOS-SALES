import pg from '../apps/api/node_modules/pg/lib/index.js';
import {
  cleanupTestFixtures,
  validateSafeLocalDatabaseTarget,
} from '../apps/api/scripts/cleanup-test-fixtures.mjs';

const { Pool } = pg;
const API_URL = process.env.API_BASE || 'http://127.0.0.1:4335/api/v1';
const DB_URL = process.env.DATABASE_URL || 'postgresql://postgres:postgres@127.0.0.1:55432/postgres';
const WAHA_KEY = process.env.WAHA_API_KEY || 'mct_sos_waha_lab_secret_2026';
const WS_ID = 'a0000000-0000-0000-0000-000000000001';
const SESSION = process.env.WAHA_SESSION || 'haven_main';

validateSafeLocalDatabaseTarget(DB_URL);

async function runWahaVerification() {
  console.log('=== WAHA WEBHOOK END-TO-END VERIFICATION ===\n');

  const pool = new Pool({ connectionString: DB_URL });
  const client = await pool.connect();
  let eventId = '';

  try {
    // Test 1: Fail-Closed Security (No Key or Bad Key)
    console.log('1. Testing Fail-Closed Security (Reject Unauthorized)...');
    const unauthRes = await fetch(`${API_URL}/channels/waha/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'message', session: SESSION }),
    });
    if (unauthRes.status === 401) {
      console.log('   ✅ PASS: Rejected without key with HTTP 401');
    } else {
      throw new Error(`Expected HTTP 401, got ${unauthRes.status}`);
    }

    // Test 2: Durable Message Ingestion & Raw Envelope Persistence
    console.log('\n2. Testing durable WAHA inbound ingestion (with x-api-key)...');
    eventId = `waha_test_msg_${Date.now()}`;
    const testPhone = '5549999887766';
    const messageText = 'Olá Haven! Gostaria de agendar corte e hidratação para hoje.';
    const payload = {
      event: 'message',
      session: SESSION,
      payload: {
        id: eventId,
        timestamp: Math.floor(Date.now() / 1000),
        from: `${testPhone}@c.us`,
        to: '5549999112233@c.us',
        fromMe: false,
        body: messageText,
        hasMedia: false,
        _data: { notifyName: 'Juliana Rossi' },
      },
    };

    const inboundRes = await fetch(`${API_URL}/channels/waha/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WAHA_KEY },
      body: JSON.stringify(payload),
    });
    const inboundData = await inboundRes.json();
    console.log(`   Response HTTP: ${inboundRes.status}`, inboundData);
    if (
      inboundRes.status !== 200
      || inboundData.accepted !== true
      || typeof inboundData.inboundEventId !== 'string'
      || inboundData.workspaceId !== WS_ID
    ) {
      throw new Error('Durable inbound ingestion did not return the current accepted contract');
    }
    const envelope = await client.query(
      `SELECT id, workspace_id, provider, provider_event_id
       FROM public.inbound_channel_events
       WHERE id = $1`,
      [inboundData.inboundEventId],
    );
    if (
      envelope.rowCount !== 1
      || envelope.rows[0].workspace_id !== WS_ID
      || envelope.rows[0].provider !== 'waha'
      || envelope.rows[0].provider_event_id !== `message:${eventId}`
    ) {
      throw new Error('Inbound envelope was not persisted with the expected tenant/provider fence');
    }
    console.log(`   ✅ PASS: Envelope persisted with inboundEventId ${inboundData.inboundEventId}`);

    // Test 3: Idempotency & Anti-Replay Drop
    console.log('\n3. Testing idempotency (re-sending the same provider event)...');
    const replayRes = await fetch(`${API_URL}/channels/waha/webhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': WAHA_KEY },
      body: JSON.stringify(payload),
    });
    const replayData = await replayRes.json();
    console.log(`   Response HTTP: ${replayRes.status}`, replayData);
    if (
      replayRes.status !== 200
      || replayData.deduplicated !== true
      || replayData.inboundEventId !== inboundData.inboundEventId
    ) {
      throw new Error('Duplicate provider event was not fenced by the durable ingestion path');
    }
    console.log('   ✅ PASS: Duplicate event returned the original envelope without re-queueing.');

    // Test 4: Asynchronous normalization and outbox completion
    console.log('\n4. Verifying worker normalization and outbox completion...');
    const deadline = Date.now() + 20_000;
    let messageRow = null;
    let outboxRow = null;
    while (Date.now() < deadline) {
      const [messages, outbox] = await Promise.all([
        client.query(
          `SELECT id, workspace_id, provider_message_id, text_content
           FROM public.conversation_messages
           WHERE provider_message_id = $1 AND workspace_id = $2`,
          [eventId, WS_ID],
        ),
        client.query(
          `SELECT status, attempts
           FROM public.outbox_events
           WHERE aggregate_id = $1
           ORDER BY created_at DESC
           LIMIT 1`,
          [inboundData.inboundEventId],
        ),
      ]);
      messageRow = messages.rows[0] || null;
      outboxRow = outbox.rows[0] || null;
      if (messageRow && outboxRow?.status === 'PUBLISHED') break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!messageRow || outboxRow?.status !== 'PUBLISHED') {
      throw new Error(`Worker did not publish the event within 20s (outbox=${outboxRow?.status || 'missing'})`);
    }
    if (messageRow.workspace_id !== WS_ID || messageRow.text_content !== messageText) {
      throw new Error('Normalized conversation message failed workspace/text verification');
    }
    console.log(`   ✅ PASS: Worker published and normalized message (attempts=${outboxRow.attempts}).`);
    console.log('\n🎯 ALL WAHA WEBHOOK CRITERIA VERIFIED (auth, persistence, idempotency, worker, tenant fence)!');
  } finally {
    client.release();
    await pool.end();
    await cleanupTestFixtures(DB_URL);
  }
}

runWahaVerification().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});
