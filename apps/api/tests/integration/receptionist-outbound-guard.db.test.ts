import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { dbPool } from '../../src/infrastructure/database/pool.js';

const here = dirname(fileURLToPath(import.meta.url));
const migration = readFileSync(resolve(
  here,
  '../../supabase/migrations/20260910140000_atomic_receptionist_outbound_guard.sql',
), 'utf8');

describe('atomic receptionist outbound database guard', () => {
  it('orders reservation before closure and refuses reservations after closure', async () => {
    const client = await dbPool.connect();
    const workspaceId = randomUUID();
    const channelId = randomUUID();
    const contactId = randomUUID();
    const journeyId = randomUUID();
    const messageId = randomUUID();

    try {
      await client.query('BEGIN');
      await client.query(migration);
      await client.query(
        `INSERT INTO public.workspaces (id, name, slug, active)
         VALUES ($1, 'Receptionist guard', $2, true)`,
        [workspaceId, `receptionist-guard-${workspaceId.slice(0, 8)}`],
      );
      await client.query(
        `INSERT INTO public.channel_connections
           (id, workspace_id, provider, phone_number, name, public_config, status)
         VALUES ($1, $2, 'waha', '+5549999000099', 'Guard WAHA', '{}'::jsonb, 'CONNECTED')`,
        [channelId, workspaceId],
      );
      await client.query(
        `INSERT INTO public.contacts (id, workspace_id, phone, name)
         VALUES ($1, $2, '+5549999000098', 'Guard contact')`,
        [contactId, workspaceId],
      );
      await client.query(
        `INSERT INTO public.commercial_journeys
           (id, workspace_id, contact_id, channel_connection_id, status,
            bot_enabled, bot_paused_at, responder_owner)
         VALUES ($1, $2, $3, $4, 'OPEN', true, NULL, 'sos_sales')`,
        [journeyId, workspaceId, contactId, channelId],
      );
      await client.query(
        `INSERT INTO public.conversation_messages
           (id, workspace_id, channel_connection_id, journey_id, contact_id,
            direction, sender_type, provider_message_id, text_content)
         VALUES ($1, $2, $3, $4, $5, 'inbound', 'customer', $6, 'Olá')`,
        [messageId, workspaceId, channelId, journeyId, contactId, `guard-${messageId}`],
      );

      const reserved = await client.query<{ reservation: { reservationId: string } }>(
        `SELECT public.reserve_receptionist_outbound(
           $1, $2, $3, $4, $5, 'waha', 'TEXT', 'Resposta', $6
         ) AS reservation`,
        [workspaceId, messageId, journeyId, contactId, channelId, '0123456789abcdef0123456789abcdef'],
      );
      const reservationId = reserved.rows[0].reservation.reservationId;

      await client.query('SAVEPOINT close_while_sending');
      await expect(client.query(
        `UPDATE public.commercial_journeys SET status = 'ABANDONED' WHERE id = $1`,
        [journeyId],
      )).rejects.toThrow(/cannot transition while a receptionist outbound is in progress/);
      await client.query('ROLLBACK TO SAVEPOINT close_while_sending');

      await client.query(
        `SELECT public.mark_receptionist_outbound_unknown($1, 'test-reconciliation')`,
        [reservationId],
      );
      await client.query(
        `UPDATE public.commercial_journeys SET status = 'ABANDONED' WHERE id = $1`,
        [journeyId],
      );

      const blocked = await client.query<{ reservation: { status: string; shouldSend: boolean } }>(
        `SELECT public.reserve_receptionist_outbound(
           $1, $2, $3, $4, $5, 'waha', 'TEXT_SECONDARY', 'Outra resposta', $6
         ) AS reservation`,
        [workspaceId, messageId, journeyId, contactId, channelId, 'abcdef0123456789abcdef0123456789'],
      );
      expect(blocked.rows[0].reservation).toMatchObject({
        status: 'BLOCKED_JOURNEY',
        shouldSend: false,
      });
    } finally {
      await client.query('ROLLBACK').catch(() => undefined);
      client.release();
    }
  });
});
