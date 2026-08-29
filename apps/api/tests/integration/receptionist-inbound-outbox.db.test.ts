import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { PoolClient } from 'pg';
import { dbPool, checkDatabaseHealth } from '../../src/infrastructure/database/pool.js';

// DB-backed proof for QA-P0 §4.1 — the enqueue_receptionist_inbound RPC installed by
// 20260829000000_receptionist_inbound_outbox.sql. Every case runs inside a single
// BEGIN/ROLLBACK transaction on a dedicated pooled client, so nothing it enqueues is
// ever committed — no outbox row survives the test.
//
// It proves the security-critical contract end-to-end against real Postgres:
//   - refused without service_role (SECURITY DEFINER + is_service_role() guard)
//   - enqueues exactly one row with the correct lineage and payload under service_role
//   - idempotent on the conversation_messages.id key (double-call → one row, NULL id)
//   - NULL guards for conversation_message_id and workspace_id
//
// service_role is simulated the same way the request layer authenticates: a LOCAL
// GUC 'request.jwt.claim.role' = 'service_role', which public.is_service_role() reads.

// Obviously-fake Lab stubs — never real credentials or a real message body.
const FROM_PHONE = '+5511900000000';
const PUSH_NAME = 'Lab Stub Contact';
const TEXT_CONTENT = 'lab-stub-inbound-text';
const MESSAGE_TYPE = 'text';
const PHONE_NUMBER_ID = 'lab-stub-pn-000';

// Fixed synthetic aggregate ids — rolled back, never persisted.
const MSG_ID = 'c0f00000-0000-0000-0000-0000000000a1';
const JOURNEY_ID = 'c0f00000-0000-0000-0000-0000000000b2';
const CONTACT_ID = 'c0f00000-0000-0000-0000-0000000000c3';
const CHANNEL_ID = 'c0f00000-0000-0000-0000-0000000000d4';

async function withRolledBackTx(fn: (client: PoolClient) => Promise<void>): Promise<void> {
  const client = (await dbPool.connect()) as PoolClient;
  try {
    await client.query('BEGIN');
    await fn(client);
  } finally {
    // The whole fixture is discarded — assertions run only on in-flight state.
    await client.query('ROLLBACK').catch(() => undefined);
    client.release();
  }
}

// Assume the service_role identity for the current transaction so is_service_role()
// returns true. SET LOCAL is scoped to the tx and unwound by the ROLLBACK.
async function assumeServiceRole(client: PoolClient): Promise<void> {
  await client.query(`SET LOCAL "request.jwt.claim.role" = 'service_role'`);
}

// Run a call that is expected to raise, isolated in a SAVEPOINT so the failure
// does not poison the surrounding transaction. A raised error aborts the tx until
// it is rolled back — without the savepoint, any later query (e.g. readOutbox)
// dies with 25P02 "current transaction is aborted". Returns the caught error.
async function expectRaise(
  client: PoolClient,
  run: () => Promise<unknown>,
): Promise<Error> {
  await client.query('SAVEPOINT expect_raise');
  try {
    await run();
    throw new Error('expected the call to raise, but it resolved');
  } catch (error) {
    await client.query('ROLLBACK TO SAVEPOINT expect_raise');
    return error as Error;
  } finally {
    await client.query('RELEASE SAVEPOINT expect_raise').catch(() => undefined);
  }
}

async function enqueue(
  client: PoolClient,
  overrides: {
    conversationMessageId?: string | null;
    workspaceId?: string | null;
  } = {},
  workspaceId?: string,
): Promise<string | null> {
  const res = await client.query(
    `SELECT public.enqueue_receptionist_inbound(
        $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::uuid,
        $6::text, $7::text, $8::text, $9::text, $10::text
     ) AS id`,
    [
      overrides.conversationMessageId === undefined ? MSG_ID : overrides.conversationMessageId,
      overrides.workspaceId === undefined ? workspaceId : overrides.workspaceId,
      JOURNEY_ID,
      CONTACT_ID,
      CHANNEL_ID,
      FROM_PHONE,
      PUSH_NAME,
      TEXT_CONTENT,
      MESSAGE_TYPE,
      PHONE_NUMBER_ID,
    ],
  );
  return res.rows[0].id as string | null;
}

async function readOutbox(
  client: PoolClient,
  aggregateId: string,
): Promise<
  Array<{
    id: string;
    workspace_id: string;
    event_name: string;
    aggregate_type: string;
    aggregate_id: string;
    payload: Record<string, unknown>;
    idempotency_key: string;
  }>
> {
  const res = await client.query(
    `SELECT id, workspace_id, event_name, aggregate_type, aggregate_id, payload, idempotency_key
       FROM public.outbox_events
      WHERE aggregate_id = $1`,
    [aggregateId],
  );
  return res.rows;
}

describe('QA-P0 §4.1 — enqueue_receptionist_inbound (DB-backed)', () => {
  let workspaceId: string;

  beforeAll(async () => {
    const healthy = await checkDatabaseHealth();
    // When the Lab database is unreachable this fails loudly and the whole suite
    // is reported BLOCKED — never silently green.
    expect(healthy).toBe(true);

    const ws = await dbPool.query('SELECT id FROM public.workspaces LIMIT 1');
    expect(ws.rowCount).toBeGreaterThanOrEqual(1);
    workspaceId = ws.rows[0].id;
  });

  afterAll(async () => {
    await dbPool.end();
  });

  it('refuses to enqueue without the service_role claim', async () => {
    await withRolledBackTx(async (client) => {
      // No assumeServiceRole() — the guard must reject. The rejection is isolated in
      // a SAVEPOINT so the transaction survives for the readOutbox assertion below.
      const error = await expectRaise(client, () => enqueue(client, {}, workspaceId));
      expect(error.message).toMatch(/Unauthorized/i);
      expect(await readOutbox(client, MSG_ID)).toHaveLength(0);
    });
  });

  it('enqueues exactly one row with the correct lineage and payload under service_role', async () => {
    await withRolledBackTx(async (client) => {
      await assumeServiceRole(client);

      const outboxId = await enqueue(client, {}, workspaceId);
      expect(outboxId).toBeTruthy();

      const rows = await readOutbox(client, MSG_ID);
      expect(rows).toHaveLength(1);

      const row = rows[0];
      expect(row.id).toBe(outboxId);
      expect(row.workspace_id).toBe(workspaceId);
      expect(row.event_name).toBe('receptionist.inbound_received');
      expect(row.aggregate_type).toBe('ConversationMessage');
      expect(row.aggregate_id).toBe(MSG_ID);
      expect(row.idempotency_key).toBe(`outbox_receptionist_${MSG_ID}`);

      // Payload is the self-contained ReceptionistInput the worker replays.
      expect(row.payload).toEqual({
        workspaceId,
        journeyId: JOURNEY_ID,
        contactId: CONTACT_ID,
        channelConnectionId: CHANNEL_ID,
        fromPhone: FROM_PHONE,
        pushName: PUSH_NAME,
        textContent: TEXT_CONTENT,
        messageType: MESSAGE_TYPE,
        phoneNumberId: PHONE_NUMBER_ID,
      });
    });
  });

  it('is idempotent on the conversation message id (double-call yields one row)', async () => {
    await withRolledBackTx(async (client) => {
      await assumeServiceRole(client);

      const first = await enqueue(client, {}, workspaceId);
      expect(first).toBeTruthy();

      // Second call for the same conversation message conflicts and inserts nothing;
      // ON CONFLICT DO NOTHING makes RETURNING id yield NULL.
      const second = await enqueue(client, {}, workspaceId);
      expect(second).toBeNull();

      expect(await readOutbox(client, MSG_ID)).toHaveLength(1);
    });
  });

  it('rejects a NULL conversation_message_id', async () => {
    await withRolledBackTx(async (client) => {
      await assumeServiceRole(client);
      await expect(
        enqueue(client, { conversationMessageId: null }, workspaceId),
      ).rejects.toThrow(/conversation_message_id is required/i);
    });
  });

  it('rejects a NULL workspace_id', async () => {
    await withRolledBackTx(async (client) => {
      await assumeServiceRole(client);
      await expect(
        enqueue(client, { workspaceId: null }),
      ).rejects.toThrow(/workspace_id is required/i);
    });
  });
});
