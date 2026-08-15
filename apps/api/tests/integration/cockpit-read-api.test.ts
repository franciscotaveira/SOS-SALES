import { describe, expect, it } from 'vitest';
import { CockpitReadGateway } from '../../src/application/ports/cockpit-read-gateway.js';
import { buildApp } from '../../src/interfaces/http/app.js';

const actor = { userId: '82d9da82-7d10-4c96-a6f5-07c838db5ad4' };
const workspaceA = '90000000-0000-4000-8000-000000000001';
const workspaceB = '90000000-0000-4000-8000-000000000002';
const journeyA = '91000000-0000-4000-8000-000000000001';
const journeyB = '91000000-0000-4000-8000-000000000002';

function buildGateway(): CockpitReadGateway {
  return {
    listPriorities: async (_verifiedActor, workspaceId) => {
      if (workspaceId === workspaceB) return null;
      return workspaceId === workspaceA ? [] : null;
    },
    listJourneys: async (_verifiedActor, workspaceId, options) => {
      if (workspaceId === workspaceB) return null;
      if (workspaceId !== workspaceA) return null;
      return {
        items: [{
          id: journeyA, contactId: '92000000-0000-4000-8000-000000000001', contactName: 'Ana', contactPhone: '+5511999999999',
          status: 'OPEN', pipelineStage: 'NEW', primaryServiceOrProduct: null,
          startedAt: '2026-08-14T10:00:00.000Z', updatedAt: '2026-08-14T11:00:00.000Z',
        }].slice(0, options.limit),
        nextCursor: null,
      };
    },
    listMessages: async (_verifiedActor, journeyId) => {
      if (journeyId === journeyB) return null;
      if (journeyId !== journeyA) return null;
      return {
        items: [{ id: '93000000-0000-4000-8000-000000000001', direction: 'inbound', senderType: 'customer', textContent: 'Oi', sentAt: '2026-08-14T11:00:00.000Z' }],
        nextCursor: null,
      };
    },
    getJourneyCockpit: async (_verifiedActor, workspaceId, journeyId, messageLimit) => {
      if (workspaceId !== workspaceA || journeyId !== journeyA) return null;
      return {
        journey: {
          id: journeyA, contactId: '92000000-0000-4000-8000-000000000001', status: 'OPEN',
          pipelineStage: 'NEW', primaryServiceOrProduct: null, totalRevenueMinor: 0,
          currency: 'BRL', startedAt: '2026-08-14T10:00:00.000Z', closedAt: null,
          updatedAt: '2026-08-14T11:00:00.000Z',
          contact: { id: '92000000-0000-4000-8000-000000000001', name: 'Ana', phone: '+5511999999999' },
          channel: null,
        },
        acquisitionContexts: [],
        messages: messageLimit > 0 ? [{ id: '93000000-0000-4000-8000-000000000001', direction: 'inbound', senderType: 'customer', textContent: 'Oi', sentAt: '2026-08-14T11:00:00.000Z' }] : [],
        knownFacts: [{ id: '94000000-0000-4000-8000-000000000001', key: 'profile.name', value: 'Ana', source: 'customer_explicit_text', confidence: 1, confirmedByCustomer: true, observedAt: '2026-08-14T11:00:00.000Z' }],
        decisionState: null, recommendation: null, handoff: null, outcome: null,
      };
    },
  };
}

function app() {
  return buildApp({
    secretProvider: { getWebhookSecret: async () => 'test-secret' },
    wahaAdapter: {
      providerName: 'waha', verifySignature: () => ({ valid: true }),
      extractEvent: () => ({ provider: 'waha', providerEventId: 'event', eventType: 'message', timestamp: new Date(), rawPayload: {} }),
      parseInboundMessage: () => ({ kind: 'IGNORED' as const, reason: 'not used' }),
    },
    ingestionGateway: { ingestChannelEvent: async () => ({ inboundEventId: 'event', workspaceId: 'workspace', isDuplicate: false }) },
    authenticator: { verifyAccessToken: async () => actor },
    cockpitReadGateway: buildGateway(),
    logger: false,
    rateLimit: false,
  });
}

const headers = { authorization: 'Bearer verified.jwt.token' };

describe('Cockpit read API — authenticated and bounded', () => {
  it('READ-01: returns an empty priority queue for an accessible workspace', async () => {
    const server = app();
    const response = await server.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceA}/priorities?limit=5`, headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [] });
    await server.close();
  });

  it('READ-02: rejects invalid identifiers, limits and cursors without leaking parser details', async () => {
    const server = app();
    const invalidId = await server.inject({ method: 'GET', url: '/api/v1/workspaces/not-a-uuid/journeys', headers });
    const invalidLimit = await server.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceA}/journeys?limit=1000`, headers });
    const invalidCursor = await server.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceA}/journeys?cursor=broken`, headers });
    for (const response of [invalidId, invalidLimit, invalidCursor]) {
      expect(response.statusCode).toBe(400);
      expect(response.json()).toEqual({ statusCode: 400, error: 'Bad Request', message: 'Invalid request parameters' });
    }
    await server.close();
  });

  it('READ-03: keeps cross-tenant workspace and journey requests indistinguishable from absent resources', async () => {
    const server = app();
    const workspaceResponse = await server.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceB}/priorities`, headers });
    const journeyResponse = await server.inject({ method: 'GET', url: `/api/v1/journeys/${journeyB}/messages`, headers });
    for (const response of [workspaceResponse, journeyResponse]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Requested resource was not found' });
    }
    await server.close();
  });

  it('READ-04: returns only the safe normalized message shape and page metadata', async () => {
    const server = app();
    const response = await server.inject({ method: 'GET', url: `/api/v1/journeys/${journeyA}/messages?limit=50`, headers });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      data: [{ id: '93000000-0000-4000-8000-000000000001', direction: 'inbound', senderType: 'customer', textContent: 'Oi', sentAt: '2026-08-14T11:00:00.000Z' }],
      meta: { nextCursor: null },
    });
    await server.close();
  });

  it('READ-05: returns a bounded fact-only cockpit projection and keeps missing/cross-tenant journeys indistinguishable', async () => {
    const server = app();
    const allowed = await server.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/cockpit?messageLimit=50`, headers });
    expect(allowed.statusCode).toBe(200);
    expect(allowed.json()).toMatchObject({
      data: {
        journey: { id: journeyA, contact: { name: 'Ana' }, channel: null },
        knownFacts: [{ key: 'profile.name', source: 'customer_explicit_text', confidence: 1 }],
        acquisitionContexts: [], decisionState: null, recommendation: null, handoff: null, outcome: null,
      },
    });
    expect(JSON.stringify(allowed.json())).not.toContain('rawPayload');
    expect(JSON.stringify(allowed.json())).not.toContain('providerMessageId');

    const crossTenant = await server.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceB}/journeys/${journeyA}/cockpit`, headers });
    const absent = await server.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyB}/cockpit`, headers });
    for (const response of [crossTenant, absent]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Requested resource was not found' });
    }
    await server.close();
  });

  it('READ-06: rejects unauthenticated and invalid composed-read parameters before the gateway', async () => {
    const server = app();
    const unauthenticated = await server.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/cockpit` });
    const invalidLimit = await server.inject({ method: 'GET', url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/cockpit?messageLimit=51`, headers });
    expect(unauthenticated.statusCode).toBe(401);
    expect(invalidLimit.statusCode).toBe(400);
    expect(invalidLimit.json()).toEqual({ statusCode: 400, error: 'Bad Request', message: 'Invalid request parameters' });
    await server.close();
  });
});
