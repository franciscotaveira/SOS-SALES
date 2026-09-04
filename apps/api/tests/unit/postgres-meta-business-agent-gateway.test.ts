import { describe, expect, it, vi } from 'vitest';
import { PostgresMetaBusinessAgentGateway } from '../../src/infrastructure/database/postgres-meta-business-agent-gateway.js';
import { MetaBusinessAgentClient, MetaBusinessAgentUpstreamError } from '../../src/infrastructure/channels/meta/meta-business-agent-client.js';

describe('PostgresMetaBusinessAgentGateway', () => {
  it('accepts the persisted Meta phone/token aliases used by older connections', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{
            channel_connection_id: '40000000-0000-4000-8000-000000000004',
            phone_number_id: 'phone-id-from-alias',
            secret_payload: { access_token: 'token-from-alias' },
          }],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    const client = { checkEligibility: vi.fn().mockResolvedValue(true) } as unknown as MetaBusinessAgentClient;
    const gateway = new PostgresMetaBusinessAgentGateway(pool, client);

    await expect(gateway.checkEligibility('workspace-id')).resolves.toMatchObject({
      status: 'ELIGIBLE',
      phoneNumberId: 'phone-id-from-alias',
    });
    expect(client.checkEligibility).toHaveBeenCalledWith({
      phoneNumberId: 'phone-id-from-alias',
      accessToken: 'token-from-alias',
    });
    expect(pool.query.mock.calls[0][0]).toContain("phone_number_id");
    expect(pool.query.mock.calls[0][0]).toContain("wabaPhoneNumberId");
  });

  it('returns UNKNOWN when a workspace does not have exactly one connected Meta channel', async () => {
    const pool = { query: vi.fn().mockResolvedValue({ rowCount: 0, rows: [] }) };
    const client = { checkEligibility: vi.fn() } as unknown as MetaBusinessAgentClient;
    const gateway = new PostgresMetaBusinessAgentGateway(pool, client);

    await expect(gateway.checkEligibility('workspace-id')).resolves.toMatchObject({
      status: 'UNKNOWN',
      reason: 'CHANNEL_NOT_CONNECTED',
    });
    expect(client.checkEligibility).not.toHaveBeenCalled();
  });

  it('persists UNKNOWN when a previously eligible workspace loses its channel or secret', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({ rowCount: 0, rows: [] })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    const client = { checkEligibility: vi.fn() } as unknown as MetaBusinessAgentClient;
    const gateway = new PostgresMetaBusinessAgentGateway(pool, client);

    await expect(gateway.checkEligibility('workspace-id')).resolves.toMatchObject({
      status: 'UNKNOWN',
      reason: 'CHANNEL_NOT_CONNECTED',
    });
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('meta_agent_eligibility_status'),
      expect.arrayContaining(['workspace-id', 'UNKNOWN']),
    );
  });

  it('keeps a provider failure UNKNOWN instead of marking the number ineligible', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rowCount: 1,
        rows: [{ channel_connection_id: '40000000-0000-4000-8000-000000000004', phone_number_id: 'phone-id', secret_payload: { accessToken: 'secret' } }],
      }),
    };
    const client = { checkEligibility: vi.fn().mockRejectedValue(new Error('network unavailable')) } as unknown as MetaBusinessAgentClient;
    const gateway = new PostgresMetaBusinessAgentGateway(pool, client);

    await expect(gateway.checkEligibility('workspace-id')).resolves.toMatchObject({
      status: 'UNKNOWN',
      phoneNumberId: 'phone-id',
      reason: 'UPSTREAM_UNAVAILABLE',
    });
  });

  it('identifies when Meta Business AI terms of service are not accepted and provides actionUrl', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rowCount: 1,
        rows: [{ channel_connection_id: '40000000-0000-4000-8000-000000000004', phone_number_id: 'phone-id', secret_payload: { accessToken: 'secret' } }],
      }),
    };
    const error = new MetaBusinessAgentUpstreamError(
      'The Meta Business AI Terms of Service must be accepted for this WhatsApp Business Account before using this API.',
      403,
    );
    const client = { checkEligibility: vi.fn().mockRejectedValue(error) } as unknown as MetaBusinessAgentClient;
    const gateway = new PostgresMetaBusinessAgentGateway(pool, client);

    await expect(gateway.checkEligibility('workspace-id')).resolves.toMatchObject({
      status: 'UNKNOWN',
      phoneNumberId: 'phone-id',
      reason: 'TERMS_NOT_ACCEPTED',
      actionUrl: 'https://www.facebook.com/legal/meta-business-ai-terms',
    });
  });

  it('persists eligibility so responder routing survives a browser reload', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ channel_connection_id: '40000000-0000-4000-8000-000000000004', phone_number_id: 'phone-id', secret_payload: { accessToken: 'secret' } }],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    const client = {
      checkEligibility: vi.fn().mockResolvedValue(true),
    } as unknown as MetaBusinessAgentClient;
    const gateway = new PostgresMetaBusinessAgentGateway(pool, client);

    await expect(gateway.checkEligibility('workspace-id')).resolves.toMatchObject({ status: 'ELIGIBLE' });
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('INSERT INTO public.workspace_agent_config'),
      expect.arrayContaining(['workspace-id', 'ELIGIBLE']),
    );
  });

  it('persists the Meta agent id after onboarding', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ channel_connection_id: '40000000-0000-4000-8000-000000000004', phone_number_id: 'phone-id', secret_payload: { accessToken: 'secret' } }],
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ channel_connection_id: '40000000-0000-4000-8000-000000000004', phone_number_id: 'phone-id', secret_payload: { accessToken: 'secret' } }],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ meta_agent_id: null, meta_agent_activation_status: 'NOT_STARTED', meta_agent_channel_connection_id: null }],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    const client = {
      checkEligibility: vi.fn().mockResolvedValue(true),
      startOnboarding: vi.fn().mockResolvedValue('agent-123'),
    } as unknown as MetaBusinessAgentClient;
    const gateway = new PostgresMetaBusinessAgentGateway(pool, client);

    await expect(gateway.startOnboarding('workspace-id')).resolves.toEqual({ agentId: 'agent-123' });
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('meta_agent_id'),
      expect.arrayContaining(['workspace-id', 'agent-123', true, 'PENDING']),
    );
  });

  it('does not trigger asynchronous onboarding for an ineligible number', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ channel_connection_id: '40000000-0000-4000-8000-000000000004', phone_number_id: 'phone-id', secret_payload: { accessToken: 'secret' } }],
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ channel_connection_id: '40000000-0000-4000-8000-000000000004', phone_number_id: 'phone-id', secret_payload: { accessToken: 'secret' } }],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    const client = {
      checkEligibility: vi.fn().mockResolvedValue(false),
      startOnboarding: vi.fn(),
    } as unknown as MetaBusinessAgentClient;
    const gateway = new PostgresMetaBusinessAgentGateway(pool, client);

    await expect(gateway.startOnboarding('workspace-id')).rejects.toMatchObject({ statusCode: 409 });
    expect(client.startOnboarding).not.toHaveBeenCalled();
  });

  it('does not create a second provider onboarding job while one is pending', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ channel_connection_id: '40000000-0000-4000-8000-000000000004', phone_number_id: 'phone-id', secret_payload: { accessToken: 'secret' } }],
        })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ channel_connection_id: '40000000-0000-4000-8000-000000000004', phone_number_id: 'phone-id', secret_payload: { accessToken: 'secret' } }],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] })
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ meta_agent_id: 'agent-existing', meta_agent_activation_status: 'PENDING', meta_agent_channel_connection_id: '40000000-0000-4000-8000-000000000004' }],
        }),
    };
    const client = {
      checkEligibility: vi.fn().mockResolvedValue(true),
      startOnboarding: vi.fn(),
    } as unknown as MetaBusinessAgentClient;
    const gateway = new PostgresMetaBusinessAgentGateway(pool, client);

    await expect(gateway.startOnboarding('workspace-id')).resolves.toEqual({ agentId: 'agent-existing' });
    expect(client.startOnboarding).not.toHaveBeenCalled();
  });

  it('does not mark the agent READY when Meta reports no usable answer', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ channel_connection_id: '40000000-0000-4000-8000-000000000004', phone_number_id: 'phone-id', secret_payload: { accessToken: 'secret' } }],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    const client = {
      testAgent: vi.fn().mockResolvedValue({
        message_id: 'message-1',
        agent_response: '',
        conversation_id: 'conversation-1',
        no_response_reason: 'ELIGIBILITY_CHECK_FAILED',
      }),
    } as unknown as MetaBusinessAgentClient;
    const gateway = new PostgresMetaBusinessAgentGateway(pool, client);

    await expect(gateway.testAgent('workspace-id', 'Olá')).rejects.toMatchObject({ statusCode: 409 });
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('meta_agent_activation_status'),
      expect.arrayContaining(['workspace-id', null, false, 'FAILED']),
    );
  });
});
