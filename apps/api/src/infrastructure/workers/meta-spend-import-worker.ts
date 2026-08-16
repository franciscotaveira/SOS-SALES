import type { Pool } from 'pg';
import { MetaSpendImportGateway } from '../../application/ports/meta-spend-import-gateway.js';
import { MetaMarketingApiClient } from '../channels/meta/meta-marketing-api-client.js';
import { dbPool } from '../database/pool.js';

export interface MetaSpendImportWorkerOptions {
  spendGateway: MetaSpendImportGateway;
  apiClient: MetaMarketingApiClient;
  pool?: Pick<Pool, 'connect'>;
}

export interface WorkspaceAdAccountConfig {
  workspaceId: string;
  metaAdsAccountId: string;
}

export class MetaSpendImportWorker {
  private readonly spendGateway: MetaSpendImportGateway;
  private readonly apiClient: MetaMarketingApiClient;
  private readonly pool: Pick<Pool, 'connect'>;

  constructor(options: MetaSpendImportWorkerOptions) {
    this.spendGateway = options.spendGateway;
    this.apiClient = options.apiClient;
    this.pool = options.pool || dbPool;
  }

  /**
   * Imports spend facts for a single workspace and date range.
   */
  async importWorkspaceSpend(
    workspaceId: string,
    adAccountId: string,
    dateStart: string,
    dateEnd: string,
  ): Promise<{ inserted: number; duplicates: number; totalFetched: number }> {
    const items = await this.apiClient.fetchCampaignInsights({
      adAccountId,
      dateStart,
      dateEnd,
    });

    if (items.length === 0) {
      return { inserted: 0, duplicates: 0, totalFetched: 0 };
    }

    const { inserted, duplicates } = await this.spendGateway.recordDailySpendFacts(
      workspaceId,
      items,
      new Date(),
    );

    return {
      inserted,
      duplicates,
      totalFetched: items.length,
    };
  }

  /**
   * Discovers all workspaces with configured Meta Ads accounts and imports recent spend.
   */
  async importAllActiveWorkspaces(daysBack = 7): Promise<{
    workspacesProcessed: number;
    totalInserted: number;
    totalDuplicates: number;
  }> {
    const accounts = await this.listConfiguredAdAccounts();
    const today = new Date();
    const until = today.toISOString().split('T')[0];
    const sinceDate = new Date(today.getTime() - daysBack * 24 * 60 * 60 * 1000);
    const since = sinceDate.toISOString().split('T')[0];

    let totalInserted = 0;
    let totalDuplicates = 0;
    let workspacesProcessed = 0;

    for (const account of accounts) {
      try {
        const result = await this.importWorkspaceSpend(
          account.workspaceId,
          account.metaAdsAccountId,
          since,
          until,
        );
        totalInserted += result.inserted;
        totalDuplicates += result.duplicates;
        workspacesProcessed++;
      } catch (err) {
        // Partial failures should not block other workspaces
        console.error(`Failed to import Meta spend for workspace ${account.workspaceId}:`, err);
      }
    }

    return {
      workspacesProcessed,
      totalInserted,
      totalDuplicates,
    };
  }

  private async listConfiguredAdAccounts(): Promise<WorkspaceAdAccountConfig[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query('SET LOCAL ROLE service_role');
      const result = await client.query<{ workspace_id: string; meta_ads_account_id: string }>(
        `SELECT DISTINCT workspace_id, 
           COALESCE(public_config->>'meta_ads_account_id', '') as meta_ads_account_id
         FROM public.channel_connections
         WHERE COALESCE(public_config->>'meta_ads_account_id', '') != ''`,
      );
      await client.query('COMMIT');
      return result.rows.map((r) => ({
        workspaceId: r.workspace_id,
        metaAdsAccountId: r.meta_ads_account_id,
      }));
    } catch {
      await client.query('ROLLBACK').catch(() => undefined);
      return [];
    } finally {
      await client.query('RESET ROLE').catch(() => undefined);
      client.release();
    }
  }
}
