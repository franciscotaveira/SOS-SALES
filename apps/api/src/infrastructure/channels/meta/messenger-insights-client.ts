/**
 * Messenger Insights Client — Meta Graph API v20.0
 * 
 * Fetches operational messaging health and engagement metrics:
 * - page_messages_total_messaging_connections (Total active connections)
 * - page_messages_new_conversations_unique (New conversations started)
 * - page_messages_blocked_conversations_unique (Blocks / Spam reports)
 * - page_messages_reported_conversations_unique (Spam reports)
 */

export interface MessengerMetricDailyPoint {
  metricName: string;
  date: string;
  value: number;
}

export class MessengerInsightsClient {
  private readonly baseUrl = 'https://graph.facebook.com/v20.0';

  /**
   * Fetches key Messenger metrics for a date range.
   */
  async fetchMessagingMetrics(params: {
    pageId: string;
    pageAccessToken: string;
    since?: number; // UNIX timestamp in seconds
    until?: number; // UNIX timestamp in seconds
  }): Promise<MessengerMetricDailyPoint[]> {
    const { pageId, pageAccessToken, since, until } = params;

    const metrics = [
      'page_messages_total_messaging_connections',
      'page_messages_new_conversations_unique',
      'page_messages_blocked_conversations_unique',
      'page_messages_reported_conversations_unique',
    ];

    const url = new URL(`${this.baseUrl}/${pageId}/insights`);
    url.searchParams.set('metric', metrics.join(','));
    url.searchParams.set('period', 'day');
    if (since) url.searchParams.set('since', String(since));
    if (until) url.searchParams.set('until', String(until));

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${pageAccessToken}`,
        Accept: 'application/json',
      },
    });

    const data = (await response.json()) as any;
    if (!response.ok || data.error) {
      throw new Error(data.error?.message || `Erro Meta Messenger Insights: HTTP ${response.status}`);
    }

    const results: MessengerMetricDailyPoint[] = [];
    const series = data.data || [];

    for (const item of series) {
      const metricName = item.name;
      for (const valObj of item.values || []) {
        const rawDate = valObj.end_time ? valObj.end_time.split('T')[0] : new Date().toISOString().split('T')[0];
        results.push({
          metricName,
          date: rawDate,
          value: typeof valObj.value === 'number' ? valObj.value : parseInt(valObj.value || '0', 10),
        });
      }
    }

    return results;
  }
}
