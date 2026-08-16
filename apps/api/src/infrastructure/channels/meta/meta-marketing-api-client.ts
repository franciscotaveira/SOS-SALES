import { MetaSpendInsightItem } from '../../../application/ports/meta-spend-import-gateway.js';

export interface MetaMarketingApiClientConfig {
  defaultAccessToken?: string;
  apiVersion?: string;
  baseUrl?: string;
}

export interface FetchCampaignInsightsParams {
  adAccountId: string;
  dateStart: string; // YYYY-MM-DD
  dateEnd: string; // YYYY-MM-DD
  accessToken?: string;
}

export interface MetaGraphInsightRow {
  campaign_id: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  date_start: string;
  date_stop: string;
}

export class MetaMarketingApiClient {
  private readonly defaultAccessToken?: string;
  private readonly apiVersion: string;
  private readonly baseUrl: string;

  constructor(config?: MetaMarketingApiClientConfig) {
    this.defaultAccessToken = config?.defaultAccessToken || process.env.META_SYSTEM_USER_TOKEN;
    this.apiVersion = config?.apiVersion || 'v20.0';
    this.baseUrl = config?.baseUrl || 'https://graph.facebook.com';
  }

  /**
   * Fetches daily campaign spend, impressions, and clicks breakdown from Meta Marketing API.
   */
  async fetchCampaignInsights(params: FetchCampaignInsightsParams): Promise<MetaSpendInsightItem[]> {
    const token = params.accessToken || this.defaultAccessToken;
    if (!token) {
      throw new Error('Meta API Access Token (System User Token) is required for marketing API insights');
    }

    const cleanAccountId = params.adAccountId.replace(/^act_/, '');
    const endpoint = `${this.baseUrl}/${this.apiVersion}/act_${cleanAccountId}/insights`;

    const url = new URL(endpoint);
    url.searchParams.set('level', 'campaign');
    url.searchParams.set('fields', 'campaign_id,campaign_name,spend,impressions,clicks,date_start,date_stop');
    url.searchParams.set('time_range', JSON.stringify({ since: params.dateStart, until: params.dateEnd }));
    url.searchParams.set('time_increment', '1');
    url.searchParams.set('limit', '500');

    const rawData = await this.executeWithRetry<MetaGraphInsightRow[]>(url.toString(), token);

    return rawData.map((row) => {
      const spendFloat = parseFloat(row.spend || '0');
      const spendMinor = Math.round(spendFloat * 100);
      const impressions = parseInt(row.impressions || '0', 10);
      const clicks = parseInt(row.clicks || '0', 10);

      return {
        campaignId: row.campaign_id,
        campaignName: row.campaign_name || `Campanha ${row.campaign_id}`,
        factDate: row.date_start,
        spendMinor,
        impressions: isNaN(impressions) ? 0 : impressions,
        clicks: isNaN(clicks) ? 0 : clicks,
        rawPayload: row as unknown as Record<string, unknown>,
      };
    });
  }

  private async executeWithRetry<T>(url: string, token: string, maxRetries = 3): Promise<T> {
    let attempt = 0;
    let delay = 500;

    while (attempt < maxRetries) {
      attempt++;
      try {
        const response = await fetch(url, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: 'application/json',
          },
        });

        if (response.ok) {
          const json = (await response.json()) as { data?: T; error?: { message: string; code: number } };
          if (json.error) {
            throw new Error(`Meta Graph API Error [${json.error.code}]: ${json.error.message}`);
          }
          return json.data || ([] as unknown as T);
        }

        const status = response.status;
        const errorText = await response.text();

        // 429 Too Many Requests or 5xx Server Error -> Retry
        if (status === 429 || (status >= 500 && status < 600)) {
          if (attempt >= maxRetries) {
            throw new Error(`Meta Graph API Transient Failure HTTP ${status}: ${errorText}`);
          }
          await new Promise((res) => setTimeout(res, delay));
          delay *= 2;
          continue;
        }

        // 4xx Client Error (Invalid token, invalid permissions, etc.) -> Do not retry
        throw new Error(`Meta Graph API HTTP ${status}: ${errorText}`);
      } catch (error) {
        if (attempt >= maxRetries || (error instanceof Error && error.message.includes('Meta Graph API HTTP 4'))) {
          throw error;
        }
        await new Promise((res) => setTimeout(res, delay));
        delay *= 2;
      }
    }

    throw new Error('Meta Graph API request failed after max retries');
  }
}
