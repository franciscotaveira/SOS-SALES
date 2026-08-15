import { describe, expect, it } from 'vitest';
import { TrafficProofCampaign, TrafficProofGateway, TrafficProofPeriod } from '../../src/application/ports/traffic-proof-gateway.js';
import { buildApp } from '../../src/interfaces/http/app.js';

const actor = { userId: '7a100000-0000-4000-8000-000000000001' };
const workspaceA = '7a200000-0000-4000-8000-000000000001';
const workspaceB = '7a200000-0000-4000-8000-000000000002';
const authorization = 'Bearer verified.jwt.token';

function app(gateway: TrafficProofGateway) {
  return buildApp({
    secretProvider: { getWebhookSecret: async () => 'test-secret' },
    wahaAdapter: {
      providerName: 'waha', verifySignature: () => ({ valid: true }),
      extractEvent: () => ({ provider: 'waha', providerEventId: 'event', eventType: 'message', timestamp: new Date(), rawPayload: {} }),
      parseInboundMessage: () => ({ kind: 'IGNORED' as const, reason: 'not used' }),
    },
    ingestionGateway: { ingestChannelEvent: async () => ({ inboundEventId: 'event', workspaceId: 'workspace', isDuplicate: false }) },
    authenticator: { verifyAccessToken: async () => actor },
    trafficProofGateway: gateway,
    logger: false,
    rateLimit: false,
  });
}

describe('Traffic proof API — authenticated cohort reporting', () => {
  it('TP-API-01: passes only JWT actor and validated inclusive dates to the gateway', async () => {
    let received: { receivedActor: typeof actor; workspaceId: string; period: TrafficProofPeriod } | undefined;
    const server = app({
      getTrafficProof: async (receivedActor, workspaceId, period) => {
        received = { receivedActor, workspaceId, period };
        return [{ source: 'meta_ads', campaignId: 'campaign-a', campaignName: 'Campaign A', acquiredLeads: 3, wonOutcomes: 1, lostOutcomes: 0, revenueMinor: 5900, spendMinor: null, roas: null, currency: 'BRL' }];
      },
    });
    const response = await server.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceA}/traffic-proof?from=2026-08-01&to=2026-08-31`, headers: { authorization } });
    expect(response.statusCode).toBe(200);
    expect(received).toEqual({ receivedActor: actor, workspaceId: workspaceA, period: { from: '2026-08-01', to: '2026-08-31', limit: 50 } });
    expect(response.json()).toEqual({
      data: [{ source: 'meta_ads', campaignId: 'campaign-a', campaignName: 'Campaign A', acquiredLeads: 3, wonOutcomes: 1, lostOutcomes: 0, revenueMinor: 5900, spendMinor: null, roas: null, currency: 'BRL' }],
      meta: { from: '2026-08-01', to: '2026-08-31', limit: 50, basis: 'acquisition_cohort' },
    });
    await server.close();
  });

  it('TP-API-02: rejects invalid, reversed or excessively broad date ranges before querying', async () => {
    let invoked = false;
    const server = app({ getTrafficProof: async () => { invoked = true; return []; } });
    for (const url of [
      `/api/v1/workspaces/${workspaceA}/traffic-proof?from=2026-08-31&to=2026-08-01`,
      `/api/v1/workspaces/${workspaceA}/traffic-proof?from=not-a-date&to=2026-08-01`,
      `/api/v1/workspaces/${workspaceA}/traffic-proof?from=2024-01-01&to=2026-01-02`,
      `/api/v1/workspaces/${workspaceA}/traffic-proof?from=2026-08-01&to=2026-08-31&limit=101`,
    ]) {
      const response = await server.inject({ method: 'GET', url, headers: { authorization } });
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ statusCode: 400, error: 'Bad Request', message: 'Invalid traffic proof parameters' });
    }
    expect(invoked).toBe(false);
    await server.close();
  });

  it('TP-API-03: keeps inaccessible workspaces indistinguishable from missing and requires authentication', async () => {
    const server = app({ getTrafficProof: async (_actor, workspaceId): Promise<TrafficProofCampaign[] | null> => workspaceId === workspaceB ? null : [] });
    const missing = await server.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceB}/traffic-proof?from=2026-08-01&to=2026-08-31`, headers: { authorization } });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Requested resource was not found' });
    const unauthenticated = await server.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceA}/traffic-proof?from=2026-08-01&to=2026-08-31` });
    expect(unauthenticated.statusCode).toBe(401);
    await server.close();
  });
});
