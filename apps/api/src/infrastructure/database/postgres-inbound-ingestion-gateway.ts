import pg from 'pg';
import {
  InboundIngestionGateway,
  IngestChannelEventInput,
  IngestChannelEventResult,
} from '../../application/ports/inbound-ingestion-gateway.js';
import { dbPool } from './pool.js';

export class PostgresInboundIngestionGateway implements InboundIngestionGateway {
  private pool: pg.Pool;

  constructor(pool?: pg.Pool) {
    this.pool = pool ?? dbPool;
    if (!pool && process.env.NODE_ENV === 'production') {
      throw new Error(
        'PostgresInboundIngestionGateway is disabled in production. ' +
        'Pass an explicit scoped database pool.'
      );
    }
  }

  public async ingestChannelEvent(input: IngestChannelEventInput): Promise<IngestChannelEventResult> {
    const { channelConnectionId, providerEventId, eventType, rawPayload } = input;
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
      await client.query(`SELECT set_config('request.jwt.claim.role', 'service_role', true)`);

      const res = await client.query<{
        inbound_event_id: string;
        workspace_id: string;
        is_duplicate: boolean;
      }>(
        `SELECT inbound_event_id, workspace_id, is_duplicate
         FROM public.ingest_channel_event($1, $2, $3, $4::jsonb)`,
        [
          channelConnectionId,
          providerEventId,
          eventType,
          JSON.stringify(rawPayload),
        ]
      );

      await client.query('COMMIT');

      if (!res.rowCount) {
        throw new Error(`Failed to ingest channel event for connection ${channelConnectionId}`);
      }

      const row = res.rows[0];
      return {
        inboundEventId: row.inbound_event_id,
        workspaceId: row.workspace_id,
        isDuplicate: row.is_duplicate,
      };
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      client.release();
    }
  }
}
