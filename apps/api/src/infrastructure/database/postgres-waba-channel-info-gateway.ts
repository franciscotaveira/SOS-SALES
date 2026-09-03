import { Pool } from 'pg';
import { WabaChannelInfo, WabaChannelInfoGateway } from '../../application/ports/waba-channel-info-gateway.js';
import { dbPool } from './pool.js';

type PgConnector = Pick<Pool, 'query'>;

export class PostgresWabaChannelInfoGateway implements WabaChannelInfoGateway {
  constructor(private readonly pool: PgConnector = dbPool) {}

  async findConnectedByWorkspaceId(workspaceId: string): Promise<WabaChannelInfo | null> {
    const result = await this.pool.query<{
      verified_phone: string | null;
      display_phone: string | null;
      connection_phone: string | null;
      verified_name: string | null;
      phone_number_id: string | null;
      waba_id: string | null;
      quality_rating: string | null;
    }>(`
      SELECT
        public_config::jsonb ->> 'verifiedPhone' AS verified_phone,
        public_config::jsonb ->> 'displayPhone' AS display_phone,
        phone_number AS connection_phone,
        public_config::jsonb ->> 'verifiedName' AS verified_name,
        public_config::jsonb ->> 'phoneNumberId' AS phone_number_id,
        public_config::jsonb ->> 'wabaId' AS waba_id,
        public_config::jsonb ->> 'qualityRating' AS quality_rating
      FROM public.channel_connections
      WHERE workspace_id = $1 AND provider = 'meta_cloud' AND status = 'CONNECTED'
      ORDER BY created_at ASC
      LIMIT 2
    `, [workspaceId]);

    // A workspace with multiple connected Meta numbers has no deterministic
    // default for the MVP. Returning null keeps the UI from claiming a
    // capability that could be routed to the wrong phone number.
    if (result.rowCount !== 1) return null;
    const row = result.rows[0];
    return {
      verifiedPhone: row.verified_phone ?? row.connection_phone ?? undefined,
      displayPhone: row.display_phone ?? row.connection_phone ?? undefined,
      verifiedName: row.verified_name ?? undefined,
      phoneNumberId: row.phone_number_id ?? undefined,
      wabaId: row.waba_id ?? undefined,
      qualityRating: row.quality_rating ?? undefined,
    };
  }
}
