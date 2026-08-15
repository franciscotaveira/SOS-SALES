import type { Pool, PoolClient, QueryResultRow } from 'pg';
import { AuthenticatedActor } from '../../application/ports/operator-authenticator.js';
import { TrafficProofCampaign, TrafficProofGateway, TrafficProofPeriod } from '../../application/ports/traffic-proof-gateway.js';
import { dbPool } from './pool.js';

type PgConnector = Pick<Pool, 'connect'>;

interface TrafficProofRow extends QueryResultRow {
  source: string;
  campaign_id: string | null;
  campaign_name: string | null;
  acquired_leads: string | number;
  won_outcomes: string | number;
  lost_outcomes: string | number;
  revenue_minor: string | number;
  spend_minor: string | number | null;
}

/**
 * Aggregates a lead-acquisition cohort. An outcome is counted once, against
 * the earliest acquisition context in the selected period for its journey.
 * This avoids multiplying revenue when a journey has several context facts.
 */
export class PostgresTrafficProofGateway implements TrafficProofGateway {
  constructor(private readonly pool: PgConnector = dbPool) {}

  async getTrafficProof(
    actor: AuthenticatedActor,
    workspaceId: string,
    period: TrafficProofPeriod,
  ): Promise<TrafficProofCampaign[] | null> {
    return this.withActor(actor, async (client) => {
      const visibleWorkspace = await client.query<{ id: string }>(
        'SELECT id FROM public.workspaces WHERE id = $1',
        [workspaceId],
      );
      if (visibleWorkspace.rowCount !== 1) return null;

      const result = await client.query<TrafficProofRow>(`
        WITH acquisition_cohort AS (
          SELECT DISTINCT ON (a.journey_id)
            a.journey_id, a.source, a.campaign_id, a.campaign_name
          FROM public.acquisition_contexts a
          WHERE a.workspace_id = $1
            AND a.occurred_at >= $2::date
            AND a.occurred_at < ($3::date + INTERVAL '1 day')
          ORDER BY a.journey_id, a.occurred_at ASC, a.id ASC
        ),
        acquisition_rollup AS (
          SELECT
            source, campaign_id, campaign_name,
            COUNT(*)::bigint AS acquired_leads,
            COUNT(o.id) FILTER (WHERE o.result = 'WON')::bigint AS won_outcomes,
            COUNT(o.id) FILTER (WHERE o.result IN ('LOST', 'UNRESPONSIVE'))::bigint AS lost_outcomes,
            COALESCE(SUM(o.final_revenue_minor) FILTER (WHERE o.result = 'WON'), 0)::bigint AS revenue_minor
          FROM acquisition_cohort ac
          LEFT JOIN public.commercial_outcomes o
            ON o.workspace_id = $1 AND o.journey_id = ac.journey_id
          GROUP BY source, campaign_id, campaign_name
        ),
        spend_rollup AS (
          SELECT
            source, campaign_id, campaign_name,
            SUM(spend_minor)::bigint AS spend_minor
          FROM public.campaign_spend_daily_facts
          WHERE workspace_id = $1 AND fact_date BETWEEN $2::date AND $3::date
          GROUP BY source, campaign_id, campaign_name
        )
        SELECT
          COALESCE(a.source, s.source) AS source,
          COALESCE(a.campaign_id, s.campaign_id) AS campaign_id,
          COALESCE(a.campaign_name, s.campaign_name) AS campaign_name,
          COALESCE(a.acquired_leads, 0)::bigint AS acquired_leads,
          COALESCE(a.won_outcomes, 0)::bigint AS won_outcomes,
          COALESCE(a.lost_outcomes, 0)::bigint AS lost_outcomes,
          COALESCE(a.revenue_minor, 0)::bigint AS revenue_minor,
          s.spend_minor
        FROM acquisition_rollup a
        FULL OUTER JOIN spend_rollup s
          ON a.source = s.source
          AND a.campaign_id IS NOT DISTINCT FROM s.campaign_id
          AND a.campaign_name IS NOT DISTINCT FROM s.campaign_name
        ORDER BY source ASC, campaign_name ASC NULLS LAST, campaign_id ASC NULLS LAST
        LIMIT $4
      `, [workspaceId, period.from, period.to, period.limit]);

      return result.rows.map((row) => {
        const spendMinor = row.spend_minor === null ? null : Number(row.spend_minor);
        const revenueMinor = Number(row.revenue_minor);
        return {
          source: row.source,
          campaignId: row.campaign_id,
          campaignName: row.campaign_name,
          acquiredLeads: Number(row.acquired_leads),
          wonOutcomes: Number(row.won_outcomes),
          lostOutcomes: Number(row.lost_outcomes),
          revenueMinor,
          spendMinor,
          roas: spendMinor && spendMinor > 0 ? revenueMinor / spendMinor : null,
          currency: 'BRL',
        };
      });
    });
  }

  private async withActor<T>(actor: AuthenticatedActor, action: (client: PoolClient) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE authenticated');
      await client.query("SELECT pg_catalog.set_config('request.jwt.claim.role', 'authenticated', true)");
      await client.query("SELECT pg_catalog.set_config('request.jwt.claim.sub', $1, true)", [actor.userId]);
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
