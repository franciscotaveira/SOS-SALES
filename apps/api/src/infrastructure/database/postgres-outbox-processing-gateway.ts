/**
 * TX COMMERCIAL CORE — POSTGRES OUTBOX PROCESSING GATEWAY
 * Development / test adapter for OutboxProcessingGateway.
 * Uses the local administrative pg Pool.
 *
 * ⚠️  NOT for production use. This gateway calls SET LOCAL ROLE service_role
 *     which is only valid in the locally-controlled Supabase dev database.
 *     In production, inject a server-only adapter that uses a scoped credential.
 */

import pg from 'pg';
import {
  OutboxProcessingGateway,
  OutboxEvent,
  InboundChannelEventRow,
} from '../../application/ports/outbox-processing-gateway.js';
import { dbPool } from './pool.js';

export class PostgresOutboxProcessingGateway implements OutboxProcessingGateway {
  private pool: pg.Pool;

  constructor(pool?: pg.Pool) {
    this.pool = pool ?? dbPool;
    if (!pool && process.env.NODE_ENV === 'production') {
      throw new Error(
        'PostgresOutboxProcessingGateway is disabled in production. ' +
        'Direct administrative postgres connections must not be used as ' +
        'the application service-role identity. Configure a production outbox gateway.'
      );
    }
  }

  async claimBatch(params: {
    workerId: string;
    eventNames: string[];
    batchSize: number;
    leaseSeconds: number;
  }): Promise<OutboxEvent[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
      await client.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);

      const res = await client.query<{
        id: string;
        workspace_id: string;
        event_name: string;
        aggregate_type: string;
        aggregate_id: string;
        payload: Record<string, unknown>;
        idempotency_key: string;
        claim_token: string;
        attempts: number;
      }>(
        `SELECT * FROM public.claim_outbox_batch_for_events($1, $2, $3, $4)`,
        [params.workerId, params.eventNames, params.batchSize, params.leaseSeconds]
      );

      await client.query('COMMIT');

      return res.rows.map((row) => ({
        id: row.id,
        workspaceId: row.workspace_id,
        eventName: row.event_name,
        aggregateType: row.aggregate_type,
        aggregateId: row.aggregate_id,
        payload: row.payload,
        idempotencyKey: row.idempotency_key,
        claimToken: row.claim_token,
        attempts: row.attempts,
      }));
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      await client.query('RESET ROLE').catch(() => {});
      await client.query(`SELECT set_config('request.jwt.claim.role', '', false)`).catch(() => {});
      client.release();
    }
  }

  async completeEvent(params: {
    eventId: string;
    claimToken: string;
    workerId: string;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
      await client.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);

      await client.query(
        `SELECT public.complete_outbox_event($1, $2, $3)`,
        [params.eventId, params.claimToken, params.workerId]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      await client.query('RESET ROLE').catch(() => {});
      await client.query(`SELECT set_config('request.jwt.claim.role', '', false)`).catch(() => {});
      client.release();
    }
  }

  async failEvent(params: {
    eventId: string;
    claimToken: string;
    workerId: string;
    errorMessage: string;
    maxAttempts: number;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
      await client.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);

      await client.query(
        `SELECT public.fail_outbox_event($1, $2, $3, $4, $5)`,
        [params.eventId, params.claimToken, params.workerId, params.errorMessage, params.maxAttempts]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      await client.query('RESET ROLE').catch(() => {});
      await client.query(`SELECT set_config('request.jwt.claim.role', '', false)`).catch(() => {});
      client.release();
    }
  }

  async fetchInboundChannelEvent(params: {
    inboundEventId: string;
    workspaceId: string;
    provider: string;
  }): Promise<InboundChannelEventRow | null> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
      await client.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);

      const res = await client.query<{
        id: string;
        workspace_id: string;
        channel_connection_id: string;
        provider: string;
        raw_payload: Record<string, unknown>;
      }>(
        `SELECT id, workspace_id, channel_connection_id, provider, raw_payload
         FROM public.inbound_channel_events
         WHERE id = $1 AND workspace_id = $2 AND provider = $3`,
        [params.inboundEventId, params.workspaceId, params.provider]
      );

      await client.query('COMMIT');

      if (!res.rowCount) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        workspaceId: row.workspace_id,
        channelConnectionId: row.channel_connection_id,
        provider: row.provider,
        rawPayload: row.raw_payload,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      await client.query('RESET ROLE').catch(() => {});
      await client.query(`SELECT set_config('request.jwt.claim.role', '', false)`).catch(() => {});
      client.release();
    }
  }

  async normalizeWahaInboundMessage(params: {
    inboundEventId: string;
    contactPhone: string;
    whatsappId: string | null;
    contactName: string | null;
    providerMessageId: string;
    textContent: string | null;
    mediaPayload: string | null;
    sentAt: Date;
  }): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
      await client.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);

      await client.query(
        `SELECT * FROM public.normalize_waha_inbound_message(
          $1, $2, $3, $4, $5, $6, $7, $8
        )`,
        [
          params.inboundEventId,
          params.contactPhone,
          params.whatsappId,
          params.contactName,
          params.providerMessageId,
          params.textContent,
          params.mediaPayload,
          params.sentAt,
        ]
      );

      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      await client.query('RESET ROLE').catch(() => {});
      await client.query(`SELECT set_config('request.jwt.claim.role', '', false)`).catch(() => {});
      client.release();
    }
  }
}
