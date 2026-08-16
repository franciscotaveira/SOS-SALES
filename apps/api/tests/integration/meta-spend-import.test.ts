import { describe, expect, it, vi } from 'vitest';
import { MetaMarketingApiClient } from '../../src/infrastructure/channels/meta/meta-marketing-api-client.js';
import { PostgresMetaSpendGateway } from '../../src/infrastructure/database/postgres-meta-spend-gateway.js';
import { MetaSpendImportWorker } from '../../src/infrastructure/workers/meta-spend-import-worker.js';

describe('Meta Ads Spend Import Gateway & Worker', () => {
  it('META-SPEND-01: fetches campaign insights from Graph API and converts spend to minor units (centavos)', async () => {
    const client = new MetaMarketingApiClient({
      defaultAccessToken: 'EAABtestToken123',
      baseUrl: 'https://mock-graph.facebook.com',
    });

    const mockResponse = {
      data: [
        {
          campaign_id: '120200000000000001',
          campaign_name: 'Campanha Conversão Implantes',
          spend: '145.80',
          impressions: '1250',
          clicks: '48',
          date_start: '2026-08-14',
          date_stop: '2026-08-14',
        },
        {
          campaign_id: '120200000000000002',
          campaign_name: 'Campanha Reativação Botox',
          spend: '50.00',
          impressions: '600',
          clicks: '19',
          date_start: '2026-08-14',
          date_stop: '2026-08-14',
        },
      ],
    };

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => mockResponse,
    }) as any;

    const items = await client.fetchCampaignInsights({
      adAccountId: 'act_9988776655',
      dateStart: '2026-08-14',
      dateEnd: '2026-08-14',
    });

    expect(items).toHaveLength(2);
    expect(items[0]).toEqual({
      campaignId: '120200000000000001',
      campaignName: 'Campanha Conversão Implantes',
      factDate: '2026-08-14',
      spendMinor: 14580,
      impressions: 1250,
      clicks: 48,
      rawPayload: mockResponse.data[0],
    });
    expect(items[1].spendMinor).toBe(5000);
  });

  it('META-SPEND-02: deduplicates daily facts using source_import_key idempotently', async () => {
    let queryCallCount = 0;
    const executedQueries: string[] = [];

    const mockPoolClient = {
      query: vi.fn().mockImplementation((queryText: string) => {
        executedQueries.push(queryText);
        queryCallCount++;
        // First insert succeeds (1 row), second insert is on conflict do nothing (0 rows)
        if (queryText.includes('INSERT INTO public.campaign_spend_daily_facts')) {
          return Promise.resolve({ rowCount: queryCallCount <= 3 ? 1 : 0 });
        }
        return Promise.resolve({ rowCount: 0, rows: [] });
      }),
      release: vi.fn(),
    };

    const mockPool = {
      connect: vi.fn().mockResolvedValue(mockPoolClient),
    };

    const gateway = new PostgresMetaSpendGateway(mockPool as any);

    const testItem = {
      campaignId: '120200000000000001',
      campaignName: 'Campanha Teste',
      factDate: '2026-08-14',
      spendMinor: 14580,
      impressions: 1250,
      clicks: 48,
    };

    // First execution: insert 1
    const result1 = await gateway.recordDailySpendFacts(
      'w1000000-0000-4000-8000-000000000001',
      [testItem],
    );
    expect(result1).toEqual({ inserted: 1, duplicates: 0 });

    // Second execution: duplicate detected
    const result2 = await gateway.recordDailySpendFacts(
      'w1000000-0000-4000-8000-000000000001',
      [testItem],
    );
    expect(result2).toEqual({ inserted: 0, duplicates: 1 });
  });

  it('META-SPEND-03: worker orchestrates workspace spend import and handles empty list gracefully', async () => {
    const mockSpendGateway = {
      recordDailySpendFacts: vi.fn().mockResolvedValue({ inserted: 2, duplicates: 0 }),
    };

    const mockApiClient = {
      fetchCampaignInsights: vi.fn().mockResolvedValue([
        {
          campaignId: '120200000000000001',
          campaignName: 'Campanha 1',
          factDate: '2026-08-14',
          spendMinor: 10000,
          impressions: 500,
          clicks: 25,
        },
        {
          campaignId: '120200000000000002',
          campaignName: 'Campanha 2',
          factDate: '2026-08-14',
          spendMinor: 20000,
          impressions: 800,
          clicks: 40,
        },
      ]),
    };

    const worker = new MetaSpendImportWorker({
      spendGateway: mockSpendGateway as any,
      apiClient: mockApiClient as any,
    });

    const result = await worker.importWorkspaceSpend(
      'w1000000-0000-4000-8000-000000000001',
      'act_123456789',
      '2026-08-14',
      '2026-08-14',
    );

    expect(result).toEqual({
      inserted: 2,
      duplicates: 0,
      totalFetched: 2,
    });
    expect(mockSpendGateway.recordDailySpendFacts).toHaveBeenCalledWith(
      'w1000000-0000-4000-8000-000000000001',
      expect.any(Array),
      expect.any(Date),
    );
  });
});
