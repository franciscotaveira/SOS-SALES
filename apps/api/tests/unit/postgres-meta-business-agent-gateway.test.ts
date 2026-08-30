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
});
