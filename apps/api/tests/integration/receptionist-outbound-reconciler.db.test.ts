import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { dbPool } from '../../src/infrastructure/database/pool.js';
import { ReceptionistOutboundReconciler } from '../../src/infrastructure/workers/receptionist-outbound-reconciler.js';

describe('Receptionist outbound stale reservation reconciliation', () => {
  it('marks a stale SENDING reservation UNKNOWN and keeps provider id empty', async () => {
    const client = await dbPool.connect();
    const workspaceId = randomUUID();
    const channelId = randomUUID();
    const contactId = randomUUID();
    const journeyId = randomUUID();
    const inboundMessageId = randomUUID();
    const reservationId = randomUUID();

    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO public.workspaces (id, name, slug, active)
         VALUES ($1, 'Reconciler test', $2, true)`,
        [workspaceId, `reconciler-${workspaceId.slice(0, 8)}`],
      );
      await client.query(
        `INSERT INTO public.channel_connections
          (id, workspace_id, provider, phone_number, name, public_config, status)
         VALUES ($1, $2, 'waha', '+5549999000011', 'Reconciler WAHA', '{}'::jsonb, 'CONNECTED')`,
        [channelId, workspaceId],
      );
      await client.query(
        `INSERT INTO public.contacts (id, workspace_id, phone, name)
         VALUES ($1, $2, '+5549999000012', 'Reconciler contact')`,
        [contactId, workspaceId],
      );
      await client.query(
        `INSERT INTO public.commercial_journeys
          (id, workspace_id, contact_id, channel_connection_id, status, bot_enabled, responder_owner)
         VALUES ($1, $2, $3, $4, 'OPEN', true, 'sos_sales')`,
        [journeyId, workspaceId, contactId, channelId],
      );
      await client.query(
        `INSERT INTO public.conversation_messages
          (id, workspace_id, channel_connection_id, journey_id, contact_id,
           direction, sender_type, provider_message_id, text_content)
         VALUES ($1, $2, $3, $4, $5, 'inbound', 'customer', $6, 'reconciler')`,
        [inboundMessageId, workspaceId, channelId, journeyId, contactId, `reconciler-${inboundMessageId}`],
      );
      await client.query(
        `INSERT INTO public.receptionist_outbound_reservations
          (id, workspace_id, conversation_message_id, journey_id, contact_id,
           channel_connection_id, provider, message_kind, reply_fingerprint,
           reply_text, status, attempts, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 'waha', 'TEXT',
                 '0123456789abcdef0123456789abcdef', 'resposta', 'SENDING', 1,
                 NOW() - INTERVAL '10 minutes', NOW() - INTERVAL '10 minutes')`,
        [reservationId, workspaceId, inboundMessageId, journeyId, contactId, channelId],
      );

      const reconciler = new ReceptionistOutboundReconciler({ pool: client, staleAfterSeconds: 60, batchSize: 10 });
      const result = await reconciler.reconcileOnce();
      expect(result).toEqual([expect.objectContaining({
        id: reservationId,
        workspaceId,
        journeyId,
        failureCode: 'STALE_SENDING_RECONCILIATION',
        attempts: 2,
      })]);

      const state = await client.query(
        `SELECT status, failure_code, attempts, provider_message_id
         FROM public.receptionist_outbound_reservations WHERE id = $1`,
        [reservationId],
      );
      expect(state.rows[0]).toEqual({
        status: 'UNKNOWN',
        failure_code: 'STALE_SENDING_RECONCILIATION',
        attempts: 2,
        provider_message_id: null,
      });
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });
});
