import { describe, expect, it, vi } from 'vitest';
import { MetaBusinessAgentClient, MetaBusinessAgentUpstreamError } from '../../src/infrastructure/channels/meta/meta-business-agent-client.js';

describe('MetaBusinessAgentClient', () => {
  it('uses the contract-specific base URL and API version header for eligibility', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ is_eligible: true }), { status: 200 }));
    const client = new MetaBusinessAgentClient({ baseUrl: 'https://api.facebook.test/', fetchImpl });

    await expect(client.checkEligibility({ phoneNumberId: '123', accessToken: 'secret' })).resolves.toBe(true);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.facebook.test/123/agent_eligibility',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret',
          'X-API-Version': '2.0.0',
        }),
      }),
    );
  });

  it('does not turn an upstream error into an ineligible result', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: 'unauthorized' }), { status: 401 }));
    const client = new MetaBusinessAgentClient({ fetchImpl });
    await expect(client.checkEligibility({ phoneNumberId: '123', accessToken: 'secret' }))
      .rejects.toBeInstanceOf(MetaBusinessAgentUpstreamError);
  });
});
