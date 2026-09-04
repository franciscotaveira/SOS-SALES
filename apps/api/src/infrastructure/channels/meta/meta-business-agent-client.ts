export interface MetaBusinessAgentEligibilityResponse {
  is_eligible: boolean;
}

interface OnboardingResponse { agent_id: string }
interface AgentTestResponse {
  message_id: string;
  agent_response: string;
  conversation_id: string;
  timestamp?: number;
  handoff_reason?: string;
  no_response_reason?: string;
  quick_replies?: string[];
  product_variant_ids?: string[];
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

  private async request(path: string, init: RequestInit, version: '1.0.0' | '2.0.0'): Promise<unknown> {
    const fetchImpl = this.options.fetchImpl ?? fetch;
    const baseUrl = (this.options.baseUrl ?? 'https://api.facebook.com').replace(/\/$/, '');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.options.timeoutMs ?? 10_000);
    try {
      const response = await fetchImpl(`${baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          ...(init.body ? { 'Content-Type': 'application/json' } : {}),
          'X-API-Version': version,
          ...(init.headers ?? {}),
        },
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const errorDetail = (payload && typeof payload === 'object')
          ? ((payload as any).detail || (payload as any).error?.message || (payload as any).message || (payload as any).title)
          : null;
        throw new MetaBusinessAgentUpstreamError(
          errorDetail ? String(errorDetail) : 'Meta Business Agent rejected the request',
          response.status,
        );
      }
      return payload;
    } catch (error) {
      if (error instanceof MetaBusinessAgentUpstreamError) throw error;
      throw new MetaBusinessAgentUpstreamError('Meta Business Agent request failed');
    } finally {
      clearTimeout(timeout);
    }
  }

  async checkEligibility(input: {
    phoneNumberId: string;
    accessToken: string;
  }): Promise<boolean> {
    const payload = await this.request(`/${encodeURIComponent(input.phoneNumberId)}/agent_eligibility`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${input.accessToken}` },
    }, '2.0.0');
    if (!payload || typeof payload !== 'object' || typeof (payload as MetaBusinessAgentEligibilityResponse).is_eligible !== 'boolean') {
      throw new MetaBusinessAgentUpstreamError('Meta Business Agent returned an invalid eligibility response');
    }
    return (payload as MetaBusinessAgentEligibilityResponse).is_eligible;
  }

  async startOnboarding(input: { phoneNumberId: string; accessToken: string; catalogId?: string }): Promise<string> {
    const payload = await this.request(`/${encodeURIComponent(input.phoneNumberId)}/agent_onboarding`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.accessToken}` },
      body: JSON.stringify(input.catalogId ? { catalog_id: input.catalogId } : {}),
    }, '2.0.0');
    if (!payload || typeof payload !== 'object' || typeof (payload as OnboardingResponse).agent_id !== 'string') {
      throw new MetaBusinessAgentUpstreamError('Meta Business Agent returned an invalid onboarding response');
    }
    return (payload as OnboardingResponse).agent_id;
  }

  async testAgent(input: { phoneNumberId: string; accessToken: string; userMsg: string; conversationId?: string }): Promise<AgentTestResponse> {
    const payload = await this.request(`/${encodeURIComponent(input.phoneNumberId)}/agent_test`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.accessToken}` },
      body: JSON.stringify({ user_msg: input.userMsg, ...(input.conversationId ? { conversation_id: input.conversationId } : {}) }),
    }, '2.0.0');
    if (!payload || typeof payload !== 'object'
      || typeof (payload as AgentTestResponse).message_id !== 'string'
      || typeof (payload as AgentTestResponse).agent_response !== 'string'
      || typeof (payload as AgentTestResponse).conversation_id !== 'string') {
      throw new MetaBusinessAgentUpstreamError('Meta Business Agent returned an invalid test response');
    }
    return payload as AgentTestResponse;
  }

  async controlThread(input: {
    phoneNumberId: string;
    accessToken: string;
    action: 'take' | 'release';
    to: string;
    metadata?: string;
  }): Promise<'whatsapp'> {
    const payload = await this.request(`/business/whatsapp/phone_numbers/${encodeURIComponent(input.phoneNumberId)}/thread_control`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${input.accessToken}` },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        action: input.action,
        to: input.to,
        ...(input.metadata ? { metadata: input.metadata } : {}),
      }),
    }, '1.0.0');
    if (!payload || typeof payload !== 'object' || (payload as { messaging_product?: string }).messaging_product !== 'whatsapp') {
      throw new MetaBusinessAgentUpstreamError('Meta Business Agent returned an invalid thread-control response');
    }
    return 'whatsapp';
  }
}
