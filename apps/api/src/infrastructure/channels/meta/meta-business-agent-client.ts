export interface MetaBusinessAgentEligibilityResponse {
  is_eligible: boolean;
}

export class MetaBusinessAgentUpstreamError extends Error {
  constructor(
    message: string,
    readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'MetaBusinessAgentUpstreamError';
  }
}

/**
 * Contract-specific client for Meta Business Agent Platform.
 *
 * This API's version header is deliberately not shared with Graph API calls.
 * Its base URL and version are injectable so a future official contract change
 * remains an adapter change, not a business-rule change.
 */
export class MetaBusinessAgentClient {
  constructor(
    private readonly options: {
      baseUrl?: string;
      fetchImpl?: typeof fetch;
      timeoutMs?: number;
    } = {},
  ) {}

  async checkEligibility(input: {
    phoneNumberId: string;
    accessToken: string;
  }): Promise<boolean> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const baseUrl = (this.options.baseUrl ?? 'https://api.facebook.com').replace(/\/$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10_000);
    let response: Response;
    try {
      response = await fetchImpl(`${baseUrl}/${encodeURIComponent(input.phoneNumberId)}/agent_eligibility`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${input.accessToken}`,
          'X-API-Version': '2.0.0',
          Accept: 'application/json',
        },
        signal: controller.signal,
      });
    } catch {
      throw new MetaBusinessAgentUpstreamError('Meta Business Agent eligibility request failed');
    } finally {
      clearTimeout(timeout);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      throw new MetaBusinessAgentUpstreamError('Meta Business Agent returned invalid JSON', response.status);
    }
    if (!response.ok) {
      throw new MetaBusinessAgentUpstreamError('Meta Business Agent rejected eligibility request', response.status);
    }
    if (!payload || typeof payload !== 'object' || typeof (payload as MetaBusinessAgentEligibilityResponse).is_eligible !== 'boolean') {
      throw new MetaBusinessAgentUpstreamError('Meta Business Agent returned an invalid eligibility response', response.status);
    }
    return (payload as MetaBusinessAgentEligibilityResponse).is_eligible;
  }
}
