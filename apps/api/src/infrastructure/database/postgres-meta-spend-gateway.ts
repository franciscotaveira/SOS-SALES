import type { Pool, PoolClient } from 'pg';
import {
  MetaSpendImportGateway,
  MetaSpendInsightItem,
} from '../../application/ports/meta-spend-import-gateway.js';
import { dbPool } from './pool.js';

type PgConnector = Pick<Pool, 'connect'>;

export class PostgresMetaSpendGateway implements MetaSpendImportGateway {
  constructor(private readonly pool: PgConnector = dbPool) {}

  async recordDailySpendFacts(
    workspaceId: string,
    items: MetaSpendInsightItem[],
    observedAt: Date = new Date(),
  ): Promise<{ inserted: number; duplicates: number }> {
    if (!items || items.length === 0) {
      return { inserted: 0, duplicates: 0 };
    }

    return this.withServiceRole(async (client) => {
      let inserted = 0;
      let duplicates = 0;

      for (const item of items) {
        const sourceImportKey = `meta_ads:${item.campaignId}:${item.factDate}`;
        const provenance = JSON.stringify({
          impressions: item.impressions,
          clicks: item.clicks,
          rawPayload: item.rawPayload ?? {},
        });

        const result = await client.query(
          `INSERT INTO public.campaign_spend_daily_facts (
             workspace_id,
             source,
             campaign_id,
             campaign_name,
             fact_date,
             spend_minor,
             currency,
             provider_observed_at,
             provenance,
             source_import_key
           ) VALUES (
             $1, 'meta_ads', $2, $3, $4, $5, 'BRL', $6, $7, $8
           )
           ON CONFLICT (workspace_id, source, source_import_key) DO NOTHING`,
          [
            workspaceId,
            item.campaignId,
            item.campaignName,
            item.factDate,
            item.spendMinor,
            observedAt,
            provenance,
            sourceImportKey,
          ],
        );

        if ((result.rowCount ?? 0) > 0) {
          inserted++;
        } else {
          duplicates++;
        }
      }

      return { inserted, duplicates };
    });
  }

  private async withServiceRole<T>(action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
      const result = await action(client);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw error;
    } finally {
      await client.query('RESET ROLE').catch(() => undefined);
      client.release();
    }
  }
}
