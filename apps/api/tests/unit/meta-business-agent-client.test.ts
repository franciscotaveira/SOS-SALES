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

  it('onboards on the Meta contract endpoint and returns the agent id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ agent_id: 'agent-123' }), { status: 201 }));
    const client = new MetaBusinessAgentClient({ baseUrl: 'https://api.facebook.test', fetchImpl });

    await expect(client.startOnboarding({
      phoneNumberId: 'phone-1',
      accessToken: 'secret',
      catalogId: 'catalog-1',
    })).resolves.toBe('agent-123');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.facebook.test/phone-1/agent_onboarding',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer secret',
          'X-API-Version': '2.0.0',
        }),
        body: JSON.stringify({ catalog_id: 'catalog-1' }),
      }),
    );
  });

  it('runs a non-billing Meta agent test and preserves multi-turn ids', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message_id: 'msg-1',
      agent_response: 'Olá!',
      conversation_id: 'conversation-1',
      quick_replies: ['Agendar'],
    }), { status: 200 }));
    const client = new MetaBusinessAgentClient({ fetchImpl });

    await expect(client.testAgent({
      phoneNumberId: 'phone-1',
      accessToken: 'secret',
      userMsg: 'Oi',
      conversationId: 'conversation-0',
    })).resolves.toMatchObject({
      message_id: 'msg-1',
      conversation_id: 'conversation-1',
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.facebook.com/phone-1/agent_test',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ user_msg: 'Oi', conversation_id: 'conversation-0' }),
      }),
    );
  });

  it('uses the separate v1 thread-control contract', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messaging_product: 'whatsapp' }), { status: 200 }));
    const client = new MetaBusinessAgentClient({ fetchImpl });

    await expect(client.controlThread({
      phoneNumberId: 'phone-1',
      accessToken: 'secret',
      action: 'take',
      to: '5549999999999',
      metadata: 'operator takeover',
    })).resolves.toBe('whatsapp');
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.facebook.com/business/whatsapp/phone_numbers/phone-1/thread_control',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ 'X-API-Version': '1.0.0' }),
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          action: 'take',
          to: '5549999999999',
          metadata: 'operator takeover',
        }),
      }),
    );
  });
});
