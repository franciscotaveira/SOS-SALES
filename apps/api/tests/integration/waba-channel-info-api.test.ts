import { afterEach, describe, expect, it, vi } from 'vitest';
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
  afterEach(() => {
    vi.unstubAllGlobals();
  });

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

  it('rejects the legacy channel-info route when workspaceId is absent instead of selecting a default tenant', async () => {
    const findConnectedByWorkspaceId = vi.fn();
    const app = buildApp(dependencies({ wabaChannelInfoGateway: { findConnectedByWorkspaceId } }));

    const response = await app.inject({
      method: 'GET',
      url: '/api/v1/channels/waba/channel-info',
      headers: { authorization: 'Bearer test.jwt.token' },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: 'workspaceId é obrigatório' });
    expect(findConnectedByWorkspaceId).not.toHaveBeenCalled();
    await app.close();
  });

  it('fails WABA capabilities closed when no connected channel exists', async () => {
    const findConnectedByWorkspaceId = vi.fn().mockResolvedValue(null);
    const app = buildApp(dependencies({ wabaChannelInfoGateway: { findConnectedByWorkspaceId } }));

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/channels/waba/capabilities`,
      headers: { authorization: 'Bearer test.jwt.token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      connected: false,
      capabilities: {
        flow: false,
        buttons: false,
        call: false,
        orderDetails: false,
        locationRequest: false,
        product: false,
        multiProduct: false,
        carousel: false,
      },
    });
    await app.close();
  });

  it('advertises only implemented WABA actions for the connected workspace', async () => {
    const findConnectedByWorkspaceId = vi.fn().mockResolvedValue({
      phoneNumberId: 'phone-id',
      wabaId: 'waba-id',
    });
    const app = buildApp(dependencies({ wabaChannelInfoGateway: { findConnectedByWorkspaceId } }));

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/channels/waba/capabilities`,
      headers: { authorization: 'Bearer test.jwt.token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      connected: true,
      capabilities: {
        flow: true,
        buttons: true,
        call: false,
      },
    });
    await app.close();
  });

  it('returns Meta Business Agent eligibility as an explicit tri-state result', async () => {
    const checkEligibility = vi.fn().mockResolvedValue({
      status: 'UNKNOWN',
      phoneNumberId: 'phone-id',
      checkedAt: '2026-08-30T00:00:00.000Z',
      reason: 'UPSTREAM_UNAVAILABLE',
    });
    const app = buildApp(dependencies({ metaBusinessAgentGateway: { checkEligibility } }));

    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/meta-business-agent/eligibility`,
      headers: { authorization: 'Bearer test.jwt.token' },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: expect.objectContaining({ status: 'UNKNOWN', reason: 'UPSTREAM_UNAVAILABLE' }) });
    expect(checkEligibility).toHaveBeenCalledWith(workspaceId);
    await app.close();
  });

  it('fails Meta Business Agent eligibility closed when the adapter is absent', async () => {
    const app = buildApp(dependencies());
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/meta-business-agent/eligibility`,
      headers: { authorization: 'Bearer test.jwt.token' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'META_BUSINESS_AGENT_GATEWAY_UNAVAILABLE' });
    await app.close();
  });

  it('does not misrepresent an eligibility adapter failure as ineligible', async () => {
    const app = buildApp(dependencies({
      metaBusinessAgentGateway: { checkEligibility: vi.fn().mockRejectedValue(new Error('database timeout')) },
    }));
    const response = await app.inject({
      method: 'GET',
      url: `/api/v1/workspaces/${workspaceId}/meta-business-agent/eligibility`,
      headers: { authorization: 'Bearer test.jwt.token' },
    });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: 'META_BUSINESS_AGENT_ELIGIBILITY_UNAVAILABLE' });
    await app.close();
  });

  it('does not present an invalid Meta token as a valid empty account list', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ error: { message: 'Invalid OAuth access token.' } }),
      { status: 400, headers: { 'content-type': 'application/json' } },
    )));
    const app = buildApp(dependencies({
      workspaceDirectory: {
        listForActor: async () => [{ id: workspaceId, name: 'Haven', slug: 'haven', role: 'operator' as const }],
      },
    }));

    const response = await app.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceId}/channels/waba/list-accounts`,
      headers: { authorization: 'Bearer test.jwt.token' },
      payload: { accessToken: 'invalid-token' },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: 'META_TOKEN_INVALID_OR_UNAUTHORIZED' });
    await app.close();
  });
});
