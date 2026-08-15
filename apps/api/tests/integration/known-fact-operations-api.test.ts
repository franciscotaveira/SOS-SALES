import { describe, expect, it } from 'vitest';
import {
  KnownFactIdempotencyConflictError,
  KnownFactOperationsGateway,
  RecordedKnownFact,
  RecordKnownFactInput,
} from '../../src/application/ports/known-fact-operations-gateway.js';
import { buildApp } from '../../src/interfaces/http/app.js';

const verifiedActor = { userId: 'c1000000-0000-4000-8000-000000000001' };
const workspaceA = 'c2000000-0000-4000-8000-000000000001';
const workspaceB = 'c2000000-0000-4000-8000-000000000002';
const journeyA = 'c3000000-0000-4000-8000-000000000001';
const journeyB = 'c3000000-0000-4000-8000-000000000002';
const messageA = 'c4000000-0000-4000-8000-000000000001';
const keyA = 'c5000000-0000-4000-8000-000000000001';
const keyB = 'c5000000-0000-4000-8000-000000000002';
const authorization = 'Bearer verified.jwt.token';

function testGateway(
  onRecord?: (actor: typeof verifiedActor, input: RecordKnownFactInput) => unknown,
): KnownFactOperationsGateway {
  return {
    record: async (actor, input) => {
      const result = onRecord?.(actor, input);
      if (result instanceof Error) throw result;
      if (result === null) return null;
      return (result as RecordedKnownFact | undefined) ?? {
        factId: 'c6000000-0000-4000-8000-000000000001',
        journeyId: input.journeyId,
        source: 'human_operator',
        idempotent: false,
      };
    },
  };
}

function app(gateway: KnownFactOperationsGateway) {
  return buildApp({
    secretProvider: { getWebhookSecret: async () => 'test-secret' },
    wahaAdapter: {
      providerName: 'waha', verifySignature: () => ({ valid: true }),
      extractEvent: () => ({ provider: 'waha', providerEventId: 'event', eventType: 'message', timestamp: new Date(), rawPayload: {} }),
      parseInboundMessage: () => ({ kind: 'IGNORED' as const, reason: 'not used' }),
    },
    ingestionGateway: { ingestChannelEvent: async () => ({ inboundEventId: 'event', workspaceId: 'workspace', isDuplicate: false }) },
    authenticator: { verifyAccessToken: async () => verifiedActor },
    knownFactOperationsGateway: gateway,
    logger: false,
    rateLimit: false,
  });
}

describe('Known fact API — authenticated append-only human facts', () => {
  it('FCT-API-01: derives actor only from JWT and forwards a validated append-only command', async () => {
    let received: { actor: typeof verifiedActor; input: RecordKnownFactInput } | undefined;
    const server = app(testGateway((actor, input) => {
      received = { actor, input };
      return { factId: 'c6000000-0000-4000-8000-000000000001', journeyId: input.journeyId, source: 'human_operator', idempotent: false };
    }));
    const response = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/facts`,
      headers: { authorization, 'idempotency-key': keyA },
      payload: {
        key: 'schedule.preferred_period', value: { period: 'afternoon' }, confidence: 0.9,
        confirmedByCustomer: true, evidenceMessageId: messageA,
      },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: {
      factId: 'c6000000-0000-4000-8000-000000000001', journeyId: journeyA, source: 'human_operator', idempotent: false,
    } });
    expect(received).toEqual({ actor: verifiedActor, input: {
      workspaceId: workspaceA, journeyId: journeyA, key: 'schedule.preferred_period', value: { period: 'afternoon' },
      confidence: 0.9, confirmedByCustomer: true, evidenceMessageId: messageA, idempotencyKey: keyA,
    } });
    await server.close();
  });

  it('FCT-API-02: rejects malformed namespace/JSON/rules and non-UUID idempotency keys before the gateway', async () => {
    let invoked = false;
    const server = app(testGateway(() => { invoked = true; return undefined; }));
    const invalidRequests = [
      { headers: { authorization, 'idempotency-key': keyA }, payload: { key: 'name', value: 'Camila', confidence: 1, confirmedByCustomer: true } },
      { headers: { authorization, 'idempotency-key': keyA }, payload: { key: 'profile.name', value: null, confidence: 1, confirmedByCustomer: true } },
      { headers: { authorization, 'idempotency-key': keyA }, payload: { key: 'profile.name', value: 'Camila', confidence: 1.1, confirmedByCustomer: true } },
      { headers: { authorization, 'idempotency-key': 'not-a-uuid' }, payload: { key: 'profile.name', value: 'Camila', confidence: 1, confirmedByCustomer: true } },
      { headers: { authorization, 'idempotency-key': keyA }, payload: { key: 'profile.name', value: 'Camila', confidence: 1, confirmedByCustomer: true, operatorId: workspaceB } },
    ];
    for (const request of invalidRequests) {
      const response = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/facts`, ...request });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid known fact request' });
    }
    expect(invoked).toBe(false);
    await server.close();
  });

  it('FCT-API-03: gives the exact same 404 for absent and cross-workspace journeys', async () => {
    const server = app(testGateway((_actor, input) => input.workspaceId === workspaceB || input.journeyId === journeyB ? null : undefined));
    const crossTenant = await server.inject({
      method: 'POST', url: `/api/v1/workspaces/${workspaceB}/journeys/${journeyA}/facts`, headers: { authorization, 'idempotency-key': keyA },
      payload: { key: 'profile.name', value: 'Camila', confidence: 1, confirmedByCustomer: true },
    });
    const missing = await server.inject({
      method: 'POST', url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyB}/facts`, headers: { authorization, 'idempotency-key': keyB },
      payload: { key: 'profile.name', value: 'Camila', confidence: 1, confirmedByCustomer: true },
    });
    for (const response of [crossTenant, missing]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Requested resource was not found' });
    }
    await server.close();
  });

  it('FCT-API-04: maps immutable payload drift to 409 and does not invoke a gateway without JWT', async () => {
    let invoked = false;
    const server = app(testGateway(() => {
      invoked = true;
      return new KnownFactIdempotencyConflictError('internal command fingerprint mismatch');
    }));
    const conflict = await server.inject({
      method: 'POST', url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/facts`, headers: { authorization, 'idempotency-key': keyA },
      payload: { key: 'profile.name', value: 'Camila', confidence: 1, confirmedByCustomer: true },
    });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ statusCode: 409, error: 'Conflict', message: 'The idempotency key was already used for another fact' });
    const unauthenticated = await server.inject({
      method: 'POST', url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/facts`, headers: { 'idempotency-key': keyB },
      payload: { key: 'profile.name', value: 'Camila', confidence: 1, confirmedByCustomer: true },
    });
    expect(unauthenticated.statusCode).toBe(401);
    expect(invoked).toBe(true);
    await server.close();
  });
});
