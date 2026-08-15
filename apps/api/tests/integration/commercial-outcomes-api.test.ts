import { describe, expect, it } from 'vitest';
import {
  CommercialOutcomeConflictError,
  CommercialOutcomeGateway,
  CommercialOutcomeResultRecord,
  RecordCommercialOutcomeInput,
} from '../../src/application/ports/commercial-outcome-gateway.js';
import { buildApp } from '../../src/interfaces/http/app.js';

const verifiedActor = { userId: 'a1000000-0000-4000-8000-000000000001' };
const workspaceA = 'a2000000-0000-4000-8000-000000000001';
const workspaceB = 'a2000000-0000-4000-8000-000000000002';
const journeyA = 'a3000000-0000-4000-8000-000000000001';
const journeyB = 'a3000000-0000-4000-8000-000000000002';
const keyA = 'a4000000-0000-4000-8000-000000000001';
const keyB = 'a4000000-0000-4000-8000-000000000002';
const authorization = 'Bearer verified.jwt.token';

function testGateway(onRecord?: (actor: typeof verifiedActor, input: RecordCommercialOutcomeInput) => unknown): CommercialOutcomeGateway {
  return {
    record: async (actor, input) => {
      const result = onRecord?.(actor, input);
      if (result instanceof Error) throw result;
      if (result === null) return null;
      return (result as CommercialOutcomeResultRecord | undefined) ?? { outcomeId: 'a5000000-0000-4000-8000-000000000001' };
    },
  };
}

function app(gateway: CommercialOutcomeGateway) {
  return buildApp({
    secretProvider: { getWebhookSecret: async () => 'test-secret' },
    wahaAdapter: {
      providerName: 'waha', verifySignature: () => ({ valid: true }),
      extractEvent: () => ({ provider: 'waha', providerEventId: 'event', eventType: 'message', timestamp: new Date(), rawPayload: {} }),
      parseInboundMessage: () => ({ kind: 'IGNORED' as const, reason: 'not used' }),
    },
    ingestionGateway: { ingestChannelEvent: async () => ({ inboundEventId: 'event', workspaceId: 'workspace', isDuplicate: false }) },
    authenticator: { verifyAccessToken: async () => verifiedActor },
    commercialOutcomeGateway: gateway,
    logger: false,
    rateLimit: false,
  });
}

describe('Commercial outcome API — authenticated immutable journey closures', () => {
  it('OUT-API-01: derives actor identity from the JWT and forces BRL', async () => {
    let received: { actor: typeof verifiedActor; input: RecordCommercialOutcomeInput } | undefined;
    const server = app(testGateway((actor, input) => {
      received = { actor, input };
      return { outcomeId: 'a5000000-0000-4000-8000-000000000001' };
    }));
    const response = await server.inject({
      method: 'POST',
      url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/outcomes`,
      headers: { authorization, 'idempotency-key': keyA },
      payload: { result: 'WON', revenueMinor: 5900, currency: 'BRL', reason: 'Pagamento confirmado', actorUserId: workspaceB },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: { outcomeId: 'a5000000-0000-4000-8000-000000000001' } });
    expect(received).toEqual({ actor: verifiedActor, input: {
      workspaceId: workspaceA, journeyId: journeyA, result: 'WON', revenueMinor: 5900,
      currency: 'BRL', reason: 'Pagamento confirmado', idempotencyKey: keyA,
    } });
    await server.close();
  });

  it('OUT-API-02: permits LOST, but rejects unsupported lifecycle values and invalid data before the gateway', async () => {
    let invoked = false;
    const server = app(testGateway(() => { invoked = true; return undefined; }));
    const cases = [
      { headers: { authorization, 'idempotency-key': keyA }, payload: { result: 'UNRESPONSIVE', revenueMinor: 0 } },
      { headers: { authorization, 'idempotency-key': keyA }, payload: { result: 'LOST', revenueMinor: -1 } },
      { headers: { authorization, 'idempotency-key': 'not-a-uuid' }, payload: { result: 'LOST', revenueMinor: 0 } },
      { headers: { authorization, 'idempotency-key': keyA }, payload: { result: 'WON', revenueMinor: 1, currency: 'USD' } },
    ];
    for (const request of cases) {
      const response = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/outcomes`, ...request });
      expect(response.statusCode).toBe(422);
      expect(response.json()).toEqual({ statusCode: 422, error: 'Unprocessable Entity', message: 'Invalid commercial outcome request' });
    }
    expect(invoked).toBe(false);
    await server.close();
  });

  it('OUT-API-03: returns indistinguishable 404 for missing and cross-workspace journeys', async () => {
    const server = app(testGateway((_actor, input) => input.workspaceId === workspaceB || input.journeyId === journeyB ? null : undefined));
    const crossTenant = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceB}/journeys/${journeyA}/outcomes`, headers: { authorization, 'idempotency-key': keyA }, payload: { result: 'LOST', revenueMinor: 0 } });
    const missing = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyB}/outcomes`, headers: { authorization, 'idempotency-key': keyB }, payload: { result: 'LOST', revenueMinor: 0 } });
    for (const response of [crossTenant, missing]) {
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ statusCode: 404, error: 'Not Found', message: 'Requested resource was not found' });
    }
    await server.close();
  });

  it('OUT-API-04: returns 409 for a raced/immutable final result and 401 before invoking dependencies', async () => {
    let invoked = false;
    const server = app(testGateway(() => {
      invoked = true;
      return new CommercialOutcomeConflictError('internal immutable detail');
    }));
    const conflict = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/outcomes`, headers: { authorization, 'idempotency-key': keyA }, payload: { result: 'WON', revenueMinor: 5900 } });
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json()).toEqual({ statusCode: 409, error: 'Conflict', message: 'A final outcome has already been recorded' });
    const unauthenticated = await server.inject({ method: 'POST', url: `/api/v1/workspaces/${workspaceA}/journeys/${journeyA}/outcomes`, headers: { 'idempotency-key': keyB }, payload: { result: 'LOST', revenueMinor: 0 } });
    expect(unauthenticated.statusCode).toBe(401);
    expect(invoked).toBe(true);
    await server.close();
  });
});
