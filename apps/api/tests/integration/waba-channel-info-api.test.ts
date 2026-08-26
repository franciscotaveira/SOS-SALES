import { describe, expect, it, vi } from 'vitest';
import { buildApp } from '../../src/interfaces/http/app.js';

const workspaceId = '22222222-2222-2222-2222-222222222222';
const actor = { userId: '72d9da82-7d10-4c96-a6f5-07c838db5ad4', email: 'operator@example.test' };

function dependencies(overrides: Record<string, unknown> = {}) {
  return {
    secretProvider: { getWebhookSecret: async () => 'test-secret' },
    wahaAdapter: {
      providerName: 'waha',
      verifySignature: () => ({ valid: true }),
      extractEvent: () => ({ provider: 'waha', providerEventId: 'event', eventType: 'message', timestamp: new Date(), rawPayload: {} }),
      parseInboundMessage: () => ({ kind: 'IGNORED' as const, reason: 'not used' }),
    },
    ingestionGateway: {
      ingestChannelEvent: async () => ({ inboundEventId: 'event', workspaceId, isDuplicate: false }),
    },
    authenticator: { verifyAccessToken: async () => actor },
    workspaceDirectory: {
      listForActor: async () => [{ id: workspaceId, name: 'Haven', slug: 'haven', role: 'viewer' as const }],
    },
    logger: false,
    rateLimit: false as const,
    ...overrides,
  };
}

describe('WABA channel info runtime gateway', () => {
  it('uses the injected production-owned gateway and returns persisted metadata', async () => {
    const findConnectedByWorkspaceId = vi.fn().mockResolvedValue({
      verifiedPhone: '+5549999999999',
      verifiedName: 'Test WABA',
      phoneNumberId: 'phone-id',
      wabaId: 'waba-id',
      qualityRating: 'GREEN',
    });
    const app = buildApp(dependencies({ wabaChannelInfoGateway: { findConnectedByWorkspaceId } }));

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/channels/waba/channel-info`,
      headers: { authorization: 'Bearer test.jwt.token' },
    });

    expect(response.statusCode).toBe(200);
    expect(findConnectedByWorkspaceId).toHaveBeenCalledWith(workspaceId);
    expect(response.json()).toMatchObject({
      success: true,
      phoneNumber: '+5549999999999',
      verifiedName: 'Test WABA',
      phoneNumberId: 'phone-id',
      wabaId: 'waba-id',
    });
    await app.close();
  });

  it('fails closed without the runtime gateway instead of opening a local pool', async () => {
    const app = buildApp(dependencies());
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/channels/waba/channel-info`,
      headers: { authorization: 'Bearer test.jwt.token' },
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: 'Consulta WABA indisponível' });
    await app.close();
  });
});
