import { describe, expect, it, vi } from 'vitest';
import { PostgresMetaBusinessAgentGateway } from '../../src/infrastructure/database/postgres-meta-business-agent-gateway.js';
import { MetaBusinessAgentClient } from '../../src/infrastructure/channels/meta/meta-business-agent-client.js';

describe('PostgresMetaBusinessAgentGateway', () => {
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

  it('keeps a provider failure UNKNOWN instead of marking the number ineligible', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rowCount: 1,
        rows: [{ phone_number_id: 'phone-id', secret_payload: { accessToken: 'secret' } }],
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

  it('persists eligibility so responder routing survives a browser reload', async () => {
    const pool = {
      query: vi.fn()
        .mockResolvedValueOnce({
          rowCount: 1,
          rows: [{ phone_number_id: 'phone-id', secret_payload: { accessToken: 'secret' } }],
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
          rows: [{ phone_number_id: 'phone-id', secret_payload: { accessToken: 'secret' } }],
        })
        .mockResolvedValueOnce({ rowCount: 1, rows: [] }),
    };
    const client = {
      startOnboarding: vi.fn().mockResolvedValue('agent-123'),
    } as unknown as MetaBusinessAgentClient;
    const gateway = new PostgresMetaBusinessAgentGateway(pool, client);

    await expect(gateway.startOnboarding('workspace-id')).resolves.toEqual({ agentId: 'agent-123' });
    expect(pool.query).toHaveBeenLastCalledWith(
      expect.stringContaining('meta_agent_id'),
      ['workspace-id', 'agent-123'],
    );
  });
});
