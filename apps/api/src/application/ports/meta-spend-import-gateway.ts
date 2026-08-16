/**
 * TX COMMERCIAL CORE — META ADS SPEND IMPORT GATEWAY PORT
 *
 * Domain/application interface for importing daily spend facts from Meta Marketing API.
 * Adheres strictly to immutable facts and audit provenance.
 */

export interface MetaSpendInsightItem {
  campaignId: string;
  campaignName: string;
  factDate: string; // YYYY-MM-DD
  spendMinor: number; // minor currency units (cents/centavos, e.g. 150.50 -> 15050)
  impressions: number;
  clicks: number;
  rawPayload?: Record<string, unknown>;
}

export interface ImportMetaSpendInput {
  workspaceId: string;
  adAccountId: string;
  date: string; // YYYY-MM-DD
  systemUserToken?: string;
}

export interface ImportMetaSpendRangeInput {
  workspaceId: string;
  adAccountId: string;
  startDate: string; // YYYY-MM-DD
  endDate: string; // YYYY-MM-DD
  systemUserToken?: string;
}

export interface ImportMetaSpendResult {
  workspaceId: string;
  importedCount: number;
  skippedCount: number;
  items: MetaSpendInsightItem[];
}

export interface MetaSpendImportGateway {
  /**
   * Persists daily spend records for a workspace into campaign_spend_daily_facts idempotently.
   */
  recordDailySpendFacts(
    workspaceId: string,
    items: MetaSpendInsightItem[],
    observedAt?: Date,
  ): Promise<{ inserted: number; duplicates: number }>;
}
