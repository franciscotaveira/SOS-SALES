import { Pool } from 'pg';
import {
  MetaBusinessAgentEligibility,
  MetaBusinessAgentGateway,
} from '../../application/ports/meta-business-agent-gateway.js';
import {
  MetaBusinessAgentClient,
  MetaBusinessAgentUpstreamError,
} from '../channels/meta/meta-business-agent-client.js';
import { dbPool } from './pool.js';

type PgConnector = Pick<Pool, 'query'>;

export class PostgresMetaBusinessAgentGateway implements MetaBusinessAgentGateway {
  constructor(
    private readonly pool: PgConnector = dbPool,
    private readonly client = new MetaBusinessAgentClient({
      baseUrl: process.env.META_BUSINESS_AGENT_BASE_URL?.trim() || undefined,
    }),
  ) {}

  async checkEligibility(workspaceId: string): Promise<MetaBusinessAgentEligibility> {
    const checkedAt = new Date().toISOString();
    const result = await this.pool.query<{
      phone_number_id: string | null;
      secret_payload: Record<string, unknown> | string | null;
    }>(`
      SELECT
        cc.public_config::jsonb ->> 'phoneNumberId' AS phone_number_id,
        cs.secret_payload
      FROM public.channel_connections cc
      LEFT JOIN public.channel_connection_secrets cs
        ON cs.channel_connection_id = cc.id
        AND cs.secret_kind = 'meta_bearer_token'
      WHERE cc.workspace_id = $1
        AND cc.provider = 'meta_cloud'
        AND cc.status = 'CONNECTED'
      ORDER BY cc.created_at ASC
      LIMIT 2
    `, [workspaceId]);

    if (result.rowCount !== 1) {
      return { status: 'UNKNOWN', checkedAt, reason: 'CHANNEL_NOT_CONNECTED' };
    }
    const row = result.rows[0];
    const secretPayload = typeof row.secret_payload === 'string'
      ? JSON.parse(row.secret_payload) as Record<string, unknown>
      : row.secret_payload ?? {};
    const accessToken = typeof secretPayload.accessToken === 'string' ? secretPayload.accessToken : '';
    if (!row.phone_number_id || !accessToken) {
      return { status: 'UNKNOWN', phoneNumberId: row.phone_number_id ?? undefined, checkedAt, reason: 'CREDENTIALS_UNAVAILABLE' };
    }

    try {
      const isEligible = await this.client.checkEligibility({
        phoneNumberId: row.phone_number_id,
        accessToken,
      });
      return {
        status: isEligible ? 'ELIGIBLE' : 'INELIGIBLE',
        phoneNumberId: row.phone_number_id,
        checkedAt,
      };
    } catch (error) {
      const upstream = error instanceof MetaBusinessAgentUpstreamError ? error : undefined;
      return {
        status: 'UNKNOWN',
        phoneNumberId: row.phone_number_id,
        checkedAt,
        reason: upstream?.statusCode && upstream.statusCode >= 400 && upstream.statusCode < 500
          ? 'UPSTREAM_REJECTED'
          : 'UPSTREAM_UNAVAILABLE',
      };
    }
  }
}
